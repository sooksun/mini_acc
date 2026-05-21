import type { Partner } from '@prisma/client';

export interface SalesDocumentItemInput {
  productId?: string;
  productCode?: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  vatable?: boolean;
}

export interface CreateSalesDocumentInput {
  customerId: string;
  projectId?: string;
  documentDate: string;
  dueDate?: string;
  reference?: string;
  note?: string;
  vatRate?: number;
  whtRate?: number;
  items: SalesDocumentItemInput[];
}

export interface ListSalesDocumentsQuery {
  status?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  take?: number;
  skip?: number;
}

export type PreCreateHook = (
  companyId: string,
  customer: Partner,
  input: CreateSalesDocumentInput,
) => Promise<void>;
