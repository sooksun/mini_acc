import { Injectable } from '@nestjs/common';
import type { Role } from '@hj/shared-types';
import { SalesDocumentService } from './_shared/sales-document.service';
import { CreateSalesDocumentDto } from './dto/create-sales-document.dto';
import { ListSalesDocumentsDto } from './dto/list-sales-documents.dto';

@Injectable()
export class InvoicesService {
  constructor(private salesDoc: SalesDocumentService) {}

  create(companyId: string, userId: string, dto: CreateSalesDocumentDto) {
    return this.salesDoc.create('INVOICE', companyId, userId, dto);
  }

  confirm(companyId: string, userId: string, role: Role, id: string) {
    return this.salesDoc.confirm('INVOICE', companyId, userId, role, id);
  }

  createNext(companyId: string, userId: string, id: string) {
    return this.salesDoc.createNext('INVOICE', companyId, userId, id);
  }

  void(companyId: string, userId: string, role: Role, id: string, reason: string) {
    return this.salesDoc.void('INVOICE', companyId, userId, role, id, reason);
  }

  findOne(companyId: string, id: string) {
    return this.salesDoc.findOne('INVOICE', companyId, id);
  }

  list(companyId: string, query: ListSalesDocumentsDto) {
    return this.salesDoc.list('INVOICE', companyId, query);
  }
}
