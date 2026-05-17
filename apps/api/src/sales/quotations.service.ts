import { Injectable } from '@nestjs/common';
import type { Role } from '@hj/shared-types';
import { SalesDocumentService } from './_shared/sales-document.service';
import { CreateSalesDocumentDto } from './dto/create-sales-document.dto';
import { ListSalesDocumentsDto } from './dto/list-sales-documents.dto';

@Injectable()
export class QuotationsService {
  constructor(private salesDoc: SalesDocumentService) {}

  create(companyId: string, userId: string, dto: CreateSalesDocumentDto) {
    return this.salesDoc.create('QUOTATION', companyId, userId, dto);
  }

  update(companyId: string, id: string, dto: CreateSalesDocumentDto) {
    return this.salesDoc.update('QUOTATION', companyId, id, dto);
  }

  confirm(companyId: string, userId: string, role: Role, id: string) {
    return this.salesDoc.confirm('QUOTATION', companyId, userId, role, id);
  }

  void(companyId: string, userId: string, role: Role, id: string, reason: string) {
    return this.salesDoc.void('QUOTATION', companyId, userId, role, id, reason);
  }

  findOne(companyId: string, id: string) {
    return this.salesDoc.findOne('QUOTATION', companyId, id);
  }

  list(companyId: string, query: ListSalesDocumentsDto) {
    return this.salesDoc.list('QUOTATION', companyId, query);
  }
}
