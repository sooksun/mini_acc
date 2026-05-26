import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProductType } from '@hj/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenRouterClient } from '../../ai/openrouter.client';
import { extractPdfText } from '../../ai/pdf-text';
import { sniffMime } from '../../expense-receipts/mime-sniff';
import { ProductsService } from '../../products/products.service';
import { SalesDocumentService } from '../_shared/sales-document.service';
import {
  applyMarkup,
  proposeMatch,
  suggestWhtRate,
  type MatchResult,
  type ProductLike,
} from './from-receipts.util';
import { CreateQuotationFromReceiptsDto } from './dto/create-from-receipts.dto';

type UploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface ProposedItem {
  /** Stable client-side key for React rows (not persisted). */
  tempId: string;
  sourceFile: string;
  description: string;
  unit: string;
  quantity: number;
  /** Price per unit as read from the receipt (cost). 0 when AI couldn't find it. */
  purchaseUnitPrice: number;
  /** purchaseUnitPrice × (1 + markup%/100) — the default sell price to prefill. */
  suggestedSellPrice: number;
  match: MatchResult;
}

export interface ExtractResult {
  markupPercent: number;
  /** True when at least one file fell back to the mock extractor (no API key). */
  mocked: boolean;
  files: { name: string; items: number; mocked: boolean }[];
  items: ProposedItem[];
}

/**
 * "Quotation from purchase receipts" — a buy-and-resell shortcut. The OWNER
 * uploads one or more purchase receipts; AI extracts the purchased line items;
 * we propose a catalog match per item (owner confirms). On create we add the
 * NEW products to the catalog and open a DRAFT quotation prefilled with sell
 * prices for the owner to finish editing.
 *
 * Advisory contract: extract() writes nothing. createQuotation() only persists
 * after the owner has reviewed + confirmed, and the quotation is a DRAFT that
 * still requires an explicit confirm later (numbering + journal).
 */
@Injectable()
export class FromReceiptsService {
  constructor(
    private prisma: PrismaService,
    private openrouter: OpenRouterClient,
    private products: ProductsService,
    private salesDoc: SalesDocumentService,
  ) {}

  async extract(
    companyId: string,
    files: UploadFile[] | undefined,
    markupOverride?: number,
  ): Promise<ExtractResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('ต้องอัปโหลดใบเสร็จอย่างน้อย 1 ไฟล์');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultMarkupPercent: true },
    });
    const markupPercent =
      markupOverride ?? (company ? company.defaultMarkupPercent.toNumber() : 15);

    // Load the active catalog once for fuzzy matching.
    const catalog = await this.prisma.product.findMany({
      where: { companyId, isActive: true },
      select: { id: true, nameTh: true, unitPrice: true },
    });
    const productLikes: ProductLike[] = catalog.map((p) => ({
      id: p.id,
      nameTh: p.nameTh,
      unitPrice: p.unitPrice.toNumber(),
    }));

    const items: ProposedItem[] = [];
    const perFile: ExtractResult['files'] = [];
    let anyMocked = false;

    for (const file of files) {
      const detected = sniffMime(file.buffer);
      if (!detected || !ALLOWED_MIME_TYPES.has(detected)) {
        throw new BadRequestException(
          `ไฟล์ ${file.originalname}: รองรับเฉพาะ PDF/JPEG/PNG/WEBP`,
        );
      }

      const text = await extractPdfText(file.buffer, detected);
      const result = await this.openrouter.extractReceiptItems({
        fileName: file.originalname,
        text,
      });
      anyMocked = anyMocked || result.mocked;
      perFile.push({
        name: file.originalname,
        items: result.payload.items.length,
        mocked: result.mocked,
      });

      for (const it of result.payload.items) {
        const rawQty = it.quantity ? Number(it.quantity) : 1;
        const quantity = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;
        const rawPrice = it.unitPrice ? Number(it.unitPrice) : 0;
        const purchaseUnitPrice = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0;
        items.push({
          tempId: randomUUID(),
          sourceFile: file.originalname,
          description: it.description,
          unit: it.unit && it.unit.trim() ? it.unit.trim() : 'ชิ้น',
          quantity,
          purchaseUnitPrice,
          suggestedSellPrice: applyMarkup(purchaseUnitPrice, markupPercent),
          match: proposeMatch(it.description, productLikes),
        });
      }
    }

    return { markupPercent, mocked: anyMocked, files: perFile, items };
  }

  /**
   * Materialize the owner-reviewed items into NEW catalog products (for rows
   * marked NEW) + a DRAFT quotation. Not wrapped in a single transaction:
   * create() manages its own; products are master data and creating them is
   * idempotent-safe (no code → no unique conflict), so a rare failure on the
   * quotation step leaves reusable catalog rows rather than corrupt state.
   */
  async createQuotation(
    companyId: string,
    userId: string,
    dto: CreateQuotationFromReceiptsDto,
  ) {
    const lineItems: {
      productId: string;
      description: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      vatable: boolean;
    }[] = [];
    const productTypes: ProductType[] = [];

    for (const item of dto.items) {
      let productId: string;
      if (item.decision === 'EXISTING') {
        if (!item.productId) {
          throw new BadRequestException(
            `รายการ "${item.nameTh}" ระบุว่าซ้ำกับสินค้าเดิมแต่ไม่มี productId`,
          );
        }
        const existing = await this.prisma.product.findFirst({
          where: { id: item.productId, companyId },
          select: { id: true, type: true },
        });
        if (!existing) {
          throw new NotFoundException(`ไม่พบสินค้า ${item.productId} ในระบบ`);
        }
        productId = existing.id;
        productTypes.push(existing.type as ProductType);
      } else {
        const type = (item.productType ?? 'GOOD') as ProductType;
        const created = await this.products.create(companyId, {
          type,
          nameTh: item.nameTh,
          unit: item.unit,
          unitPrice: item.unitPrice,
          vatable: item.vatable ?? true,
        });
        productId = created.id;
        productTypes.push(type);
      }

      lineItems.push({
        productId,
        description: item.nameTh,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatable: item.vatable ?? true,
      });
    }

    // Reuses the shared create() — customer validation, numbering placeholder,
    // totals, and DRAFT status all happen there. Returns the QT DTO with id.
    return this.salesDoc.create('QUOTATION', companyId, userId, {
      customerId: dto.customerId,
      projectId: dto.projectId,
      documentDate: dto.documentDate,
      vatRate: dto.vatRate,
      // WHT follows the standard rule (SERVICE→3%, GOOD/MATERIAL→1%, else 0%);
      // a goods resale lands at 1%. Owner can still override on the edit page.
      whtRate: dto.whtRate ?? suggestWhtRate(productTypes),
      items: lineItems,
    });
  }
}
