import { Injectable } from '@nestjs/common';
import type { Company, SalesDocument, SalesDocumentItem } from '@prisma/client';
import { buildPdfHtml } from './pdf-templates/layout';

@Injectable()
export class PdfTemplateService {
  buildSalesDocumentHtml(opts: {
    company: Company;
    doc: SalesDocument & { items: SalesDocumentItem[] };
    watermark?: string;
  }): string {
    return buildPdfHtml({
      company: opts.company,
      doc: opts.doc,
      watermark: opts.watermark,
    });
  }
}
