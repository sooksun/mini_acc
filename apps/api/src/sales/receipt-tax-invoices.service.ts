import { BadRequestException, Injectable } from '@nestjs/common';
import type { Role } from '@hj/shared-types';
import { SalesDocumentService } from './_shared/sales-document.service';
import { CreateSalesDocumentDto } from './dto/create-sales-document.dto';
import { ListSalesDocumentsDto } from './dto/list-sales-documents.dto';

@Injectable()
export class ReceiptTaxInvoicesService {
  constructor(private salesDoc: SalesDocumentService) {}

  create(companyId: string, userId: string, dto: CreateSalesDocumentDto) {
    return this.salesDoc.create(
      'RECEIPT_TAX_INVOICE',
      companyId,
      userId,
      dto,
      async (_cid, customer) => {
        const taxId = customer.taxId?.trim() ?? '';
        if (!taxId) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'CUSTOMER_TAX_ID_REQUIRED',
            message:
              'ลูกค้านี้ยังไม่มีเลขประจำตัวผู้เสียภาษี — เพิ่มในข้อมูลลูกค้าก่อนออกใบเสร็จ/ใบกำกับภาษี',
            customerId: customer.id,
          });
        }
        if (!/^\d{13}$/.test(taxId)) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'CUSTOMER_TAX_ID_INVALID',
            message: 'เลขประจำตัวผู้เสียภาษีของลูกค้าต้องเป็นตัวเลข 13 หลัก — แก้ไขในข้อมูลลูกค้าก่อน',
            customerId: customer.id,
          });
        }
      },
    );
  }

  confirm(companyId: string, userId: string, role: Role, id: string) {
    return this.salesDoc.confirm('RECEIPT_TAX_INVOICE', companyId, userId, role, id);
  }

  account(companyId: string, userId: string, role: Role, id: string) {
    return this.salesDoc.account('RECEIPT_TAX_INVOICE', companyId, userId, role, id);
  }

  void(companyId: string, userId: string, role: Role, id: string, reason: string) {
    return this.salesDoc.void('RECEIPT_TAX_INVOICE', companyId, userId, role, id, reason);
  }

  findOne(companyId: string, id: string) {
    return this.salesDoc.findOne('RECEIPT_TAX_INVOICE', companyId, id);
  }

  list(companyId: string, query: ListSalesDocumentsDto) {
    return this.salesDoc.list('RECEIPT_TAX_INVOICE', companyId, query);
  }
}
