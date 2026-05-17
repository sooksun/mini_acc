import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { ProductType } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

const VALID_TYPES: ProductType[] = ['SERVICE', 'GOOD', 'MATERIAL', 'ASSET'];
const TYPE_TH: Record<ProductType, string> = {
  SERVICE: 'บริการ',
  GOOD: 'สินค้า',
  MATERIAL: 'วัสดุ',
  ASSET: 'ทรัพย์สิน',
};

export interface ImportRowResult {
  row: number;
  status: 'created' | 'skipped' | 'error';
  code?: string;
  nameTh?: string;
  message?: string;
}

export interface ImportResult {
  totalRows: number;
  created: number;
  skipped: number;
  errors: number;
  details: ImportRowResult[];
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, dto: CreateProductDto) {
    if (dto.code) {
      const existing = await this.prisma.product.findFirst({
        where: { companyId, code: dto.code },
        select: { id: true },
      });
      if (existing) throw new ConflictException(`Code ${dto.code} already in use`);
    }

    return this.prisma.product.create({
      data: {
        companyId,
        type: dto.type,
        code: dto.code,
        nameTh: dto.nameTh,
        nameEn: dto.nameEn,
        description: dto.description,
        unit: dto.unit,
        unitPrice: dto.unitPrice,
        vatable: dto.vatable ?? true,
      },
    });
  }

  async list(companyId: string, dto: ListProductsDto) {
    const where: Prisma.ProductWhereInput = {
      companyId,
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.search
        ? {
            OR: [
              { nameTh: { contains: dto.search } },
              { nameEn: { contains: dto.search } },
              { code: { contains: dto.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { nameTh: 'asc' }],
        take: dto.take ?? 100,
        skip: dto.skip ?? 0,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total };
  }

  async findOne(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(companyId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(companyId, id);

    if (dto.code) {
      const conflict = await this.prisma.product.findFirst({
        where: { companyId, code: dto.code, NOT: { id } },
        select: { id: true },
      });
      if (conflict) throw new ConflictException(`Code ${dto.code} already in use`);
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        type: dto.type,
        code: dto.code,
        nameTh: dto.nameTh,
        nameEn: dto.nameEn,
        description: dto.description,
        unit: dto.unit,
        unitPrice: dto.unitPrice,
        vatable: dto.vatable,
        isActive: dto.isActive,
      },
    });
  }

  async deactivate(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Build an xlsx template for bulk product import. Two sheets:
   *  - "Products" with header + 2 sample rows the user overwrites
   *  - "คำแนะนำ" with field rules + valid type values
   */
  async buildImportTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HJ Account AI';
    wb.created = new Date();

    const ws = wb.addWorksheet('Products');
    ws.columns = [
      { header: 'ประเภท (type)*', key: 'type', width: 18 },
      { header: 'รหัส (code)', key: 'code', width: 18 },
      { header: 'ชื่อ (nameTh)*', key: 'nameTh', width: 42 },
      { header: 'ชื่อภาษาอังกฤษ (nameEn)', key: 'nameEn', width: 30 },
      { header: 'หน่วย (unit)*', key: 'unit', width: 14 },
      { header: 'ราคา/หน่วย (unitPrice)*', key: 'unitPrice', width: 16 },
      { header: 'VAT (vatable: TRUE/FALSE)', key: 'vatable', width: 16 },
      { header: 'รายละเอียด (description)', key: 'description', width: 40 },
    ];
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    header.height = 24;
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    ws.addRow({
      type: 'SERVICE',
      code: 'SVC-002',
      nameTh: 'ค่าออกแบบโลโก้',
      nameEn: 'Logo design',
      unit: 'งาน',
      unitPrice: 5000,
      vatable: 'TRUE',
      description: 'ออกแบบ logo พร้อม source file',
    });
    ws.addRow({
      type: 'GOOD',
      code: 'PROD-001',
      nameTh: 'คอมพิวเตอร์ตั้งโต๊ะ',
      nameEn: '',
      unit: 'เครื่อง',
      unitPrice: 25000,
      vatable: 'TRUE',
      description: '',
    });

    // Sheet 2: instructions
    const help = wb.addWorksheet('คำแนะนำ');
    help.columns = [{ width: 26 }, { width: 80 }];
    const rows: Array<[string, string]> = [
      ['HJ Account AI', 'แบบฟอร์มนำเข้าสินค้า/บริการ — ฉบับ ${date}'.replace('${date}', new Date().toISOString().slice(0, 10))],
      ['', ''],
      ['กรอกข้อมูลที่ Sheet "Products"', 'อย่าแก้ชื่อ Sheet หรือ header แถวแรก'],
      ['คอลัมน์ที่ * ต้องกรอก', 'type, nameTh, unit, unitPrice'],
      ['', ''],
      ['type ที่อนุญาต', 'SERVICE = บริการ / GOOD = สินค้า / MATERIAL = วัสดุ / ASSET = ทรัพย์สิน'],
      ['code', 'ไม่บังคับ. ถ้ากรอกต้องไม่ซ้ำ. เว้นว่าง = ระบบไม่ตั้งรหัส (ค้นด้วยชื่อแทน)'],
      ['nameTh', 'ชื่อภาษาไทย ≤ 200 ตัวอักษร'],
      ['nameEn', 'optional — ใช้ใน PDF บางที่'],
      ['unit', 'เช่น "งาน", "เครื่อง", "ชั่วโมง", "ขวด" — ≤ 32 ตัวอักษร'],
      ['unitPrice', 'ราคาก่อน VAT ตัวเลข ≥ 0 (ทศนิยม 2 ตำแหน่ง)'],
      ['vatable', 'TRUE = มี VAT, FALSE = ไม่มี VAT. ค่าว่าง = TRUE'],
      ['description', 'optional — ≤ 2000 ตัวอักษร'],
      ['', ''],
      ['Tip', 'แถวที่ขาด field บังคับจะถูก skip + รายงานใน import result (ไม่ทำให้ทั้งไฟล์ล้ม)'],
      ['Tip', 'รหัส (code) ที่ซ้ำกับที่มีในระบบแล้ว = error เฉพาะแถวนั้น'],
    ];
    rows.forEach((r) => help.addRow(r));
    help.getColumn(1).font = { bold: true };
    help.getRow(1).font = { bold: true, size: 14 };

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Parse an xlsx file and create products. Per-row error isolation —
   * one bad row does not abort the whole import. Returns a per-row result
   * the operator can review.
   */
  async importFromExcel(companyId: string, fileBuffer: Buffer): Promise<ImportResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Products') ?? wb.worksheets[0];
    if (!ws) {
      return { totalRows: 0, created: 0, skipped: 0, errors: 0, details: [] };
    }

    const details: ImportRowResult[] = [];
    const lastRow = ws.actualRowCount;

    // Existing codes (avoid hitting DB per row)
    const existingCodes = new Set(
      (
        await this.prisma.product.findMany({
          where: { companyId, code: { not: null } },
          select: { code: true },
        })
      ).map((p) => p.code!),
    );

    for (let rowIdx = 2; rowIdx <= lastRow; rowIdx++) {
      const row = ws.getRow(rowIdx);
      const cells = (n: number) => cellString(row.getCell(n).value);

      const type = cells(1).toUpperCase();
      const code = cells(2);
      const nameTh = cells(3);
      const nameEn = cells(4);
      const unit = cells(5);
      const unitPriceRaw = cells(6);
      const vatableRaw = cells(7);
      const description = cells(8);

      // Skip totally empty row
      if (!type && !code && !nameTh && !unit && !unitPriceRaw) {
        continue;
      }

      // Required fields
      const missing: string[] = [];
      if (!type) missing.push('type');
      if (!nameTh) missing.push('nameTh');
      if (!unit) missing.push('unit');
      if (!unitPriceRaw) missing.push('unitPrice');
      if (missing.length) {
        details.push({
          row: rowIdx,
          status: 'error',
          code: code || undefined,
          nameTh: nameTh || undefined,
          message: `ขาด field: ${missing.join(', ')}`,
        });
        continue;
      }

      // Type validation
      if (!VALID_TYPES.includes(type as ProductType)) {
        details.push({
          row: rowIdx,
          status: 'error',
          code: code || undefined,
          nameTh,
          message: `type "${type}" ไม่ถูกต้อง — ใช้ได้ ${VALID_TYPES.join(', ')}`,
        });
        continue;
      }

      // Price validation
      const unitPrice = Number(String(unitPriceRaw).replace(/,/g, ''));
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        details.push({
          row: rowIdx,
          status: 'error',
          code: code || undefined,
          nameTh,
          message: `unitPrice "${unitPriceRaw}" ไม่ใช่ตัวเลข ≥ 0`,
        });
        continue;
      }

      // Duplicate code in DB (or earlier in this import)
      if (code && existingCodes.has(code)) {
        details.push({
          row: rowIdx,
          status: 'error',
          code,
          nameTh,
          message: `รหัส "${code}" ซ้ำกับที่มีอยู่ในระบบ`,
        });
        continue;
      }

      const vatable = parseVatable(vatableRaw);

      try {
        await this.prisma.product.create({
          data: {
            companyId,
            type: type as ProductType,
            code: code || null,
            nameTh,
            nameEn: nameEn || null,
            description: description || null,
            unit,
            unitPrice,
            vatable,
          },
        });
        if (code) existingCodes.add(code); // prevent later rows in same file from duplicating
        details.push({ row: rowIdx, status: 'created', code: code || undefined, nameTh });
      } catch (err: unknown) {
        details.push({
          row: rowIdx,
          status: 'error',
          code: code || undefined,
          nameTh,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const created = details.filter((d) => d.status === 'created').length;
    const errors = details.filter((d) => d.status === 'error').length;
    const skipped = details.filter((d) => d.status === 'skipped').length;

    return {
      totalRows: details.length,
      created,
      skipped,
      errors,
      details,
    };
  }
}

function cellString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString();
  // Rich text + formula objects
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return String(value.result).trim();
    }
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') {
      return (value as { text: string }).text.trim();
    }
    if ('richText' in value && Array.isArray((value as any).richText)) {
      return (value as any).richText.map((r: any) => r.text ?? '').join('').trim();
    }
  }
  return String(value).trim();
}

function parseVatable(raw: string): boolean {
  if (!raw) return true; // default
  const v = raw.toLowerCase().trim();
  if (['false', 'no', '0', 'ไม่มี', 'ไม่'].includes(v)) return false;
  return true;
}
