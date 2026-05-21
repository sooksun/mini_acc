import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PdfRendererService } from '../pdf/pdf-renderer.service';
import { buildWhtCertificateHtml, type CertCopy } from './templates/wht-certificate.html';
import { buildPndSummaryHtml } from './templates/pnd-summary.html';
import { inferPndForm, type PndForm } from './templates/wht-shared';

@Injectable()
export class WhtPdfService {
  constructor(
    private prisma: PrismaService,
    private renderer: PdfRendererService,
  ) {}

  /**
   * Generate a "หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)" PDF for a single
   * WhtRecord. The PDF contains 3 pages by default (ต้นฉบับ + 2 สำเนา) — the
   * caller can pass `copies` to override.
   *
   * Only PAYABLE records get a certificate from us — RECEIVABLE means we were
   * the one withheld, so the certificate comes from the customer, not us.
   */
  async renderCertificate(
    companyId: string,
    recordId: string,
    copies?: CertCopy[],
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const record = await this.prisma.withholdingTaxRecord.findFirst({
      where: { id: recordId, companyId },
      include: {
        payment: {
          include: {
            partner: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException('WHT record not found');
    if (record.recordType !== 'PAYABLE') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'CERT_REQUIRES_PAYABLE',
        message: 'หนังสือรับรองหักภาษี ณ ที่จ่าย ออกได้เฉพาะ record ที่ recordType = PAYABLE',
      });
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    });

    const html = buildWhtCertificateHtml({
      company,
      partner: record.payment?.partner ?? null,
      record,
      copies,
    });
    const buffer = await this.renderer.render(html);

    const fileName = `WHT-50tawi-${record.certNumber || record.id}.pdf`.replace(
      /[^A-Za-z0-9._-]/g,
      '_',
    );
    return { buffer, fileName };
  }

  /**
   * Generate the monthly attachment ("ใบแนบ ภ.ง.ด.3" or "ใบแนบ ภ.ง.ด.53").
   *
   * Form selection: if `form` arg is provided we use it (operator override).
   * Otherwise we split the period's PAYABLE records by inferred PND form
   * (PND3 = individual, PND53 = juristic) and return the requested set. The
   * accountant typically prints both forms in the same submission.
   */
  async renderPndSummary(
    companyId: string,
    year: number,
    month: number,
    form: PndForm,
  ): Promise<{ buffer: Buffer; fileName: string; recordCount: number }> {
    if (year < 2000 || year > 2200) throw new BadRequestException('Invalid year');
    if (month < 1 || month > 12) throw new BadRequestException('Invalid month');

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    });

    const allRecords = await this.prisma.withholdingTaxRecord.findMany({
      where: {
        companyId,
        recordType: 'PAYABLE',
        periodYear: year,
        periodMonth: month,
      },
      orderBy: { paidAt: 'asc' },
    });

    // PND54 = payments abroad (sourceType FOREIGN_WHT); PND3/53 = domestic,
    // split by the payee's Thai tax ID (foreign records excluded).
    const records =
      form === 'PND54'
        ? allRecords.filter((r) => r.sourceType === 'FOREIGN_WHT')
        : allRecords.filter(
            (r) => r.sourceType !== 'FOREIGN_WHT' && inferPndForm(r.partnerTaxId) === form,
          );

    const html = buildPndSummaryHtml({
      company,
      form,
      year,
      month,
      records,
    });
    const buffer = await this.renderer.render(html);
    const fileName = `${form.toLowerCase()}-summary-${year}-${month.toString().padStart(2, '0')}.pdf`;
    return { buffer, fileName, recordCount: records.length };
  }

  /**
   * Convenience: count records per form for the period — used by the UI to
   * decide whether to show "พิมพ์ ภ.ง.ด.3" and/or "ภ.ง.ด.53" buttons.
   */
  async periodSplit(companyId: string, year: number, month: number) {
    const records = await this.prisma.withholdingTaxRecord.findMany({
      where: {
        companyId,
        recordType: 'PAYABLE',
        periodYear: year,
        periodMonth: month,
      },
      select: { partnerTaxId: true, baseAmount: true, whtAmount: true, sourceType: true },
    });
    const split = {
      PND3: [] as typeof records,
      PND53: [] as typeof records,
      PND54: [] as typeof records,
    };
    for (const r of records) {
      if (r.sourceType === 'FOREIGN_WHT') split.PND54.push(r);
      else split[inferPndForm(r.partnerTaxId)].push(r);
    }
    const totals = (rs: typeof records) => ({
      count: rs.length,
      base: rs.reduce((s, r) => s.plus(r.baseAmount), new Prisma.Decimal(0)).toString(),
      wht: rs.reduce((s, r) => s.plus(r.whtAmount), new Prisma.Decimal(0)).toString(),
    });
    return {
      period: { year, month },
      pnd3: totals(split.PND3),
      pnd53: totals(split.PND53),
      pnd54: totals(split.PND54),
    };
  }
}
