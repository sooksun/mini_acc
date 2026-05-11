import { BadRequestException, Injectable } from '@nestjs/common';
import type { Role } from '@hj/shared-types';
import { SalesDocumentService } from './_shared/sales-document.service';
import { CreateSalesDocumentDto } from './dto/create-sales-document.dto';
import { ListSalesDocumentsDto } from './dto/list-sales-documents.dto';

@Injectable()
export class TaxInvoicesService {
  constructor(private salesDoc: SalesDocumentService) {}

  create(companyId: string, userId: string, dto: CreateSalesDocumentDto) {
    return this.salesDoc.create('TAX_INVOICE', companyId, userId, dto, async (cid, customer, input) => {
      if (!customer.taxId?.trim()) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'CUSTOMER_TAX_ID_REQUIRED',
          message: 'ลูกค้านี้ยังไม่มีเลขประจำตัวผู้เสียภาษี — เพิ่มในข้อมูลลูกค้าก่อนออกใบกำกับภาษี',
          customerId: customer.id,
        });
      }
      await this.salesDoc.assertVatEligible(cid, input.documentDate);
    });
  }

  confirm(companyId: string, userId: string, role: Role, id: string) {
    return this.salesDoc.confirm('TAX_INVOICE', companyId, userId, role, id);
  }

  void(companyId: string, userId: string, role: Role, id: string, reason: string) {
    return this.salesDoc.void('TAX_INVOICE', companyId, userId, role, id, reason);
  }

  findOne(companyId: string, id: string) {
    return this.salesDoc.findOne('TAX_INVOICE', companyId, id);
  }

  list(companyId: string, query: ListSalesDocumentsDto) {
    return this.salesDoc.list('TAX_INVOICE', companyId, query);
  }
}
