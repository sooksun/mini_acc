import type { PartnerType, ProductType } from '@hj/shared-types';

/** Partner row from GET /api/partners — used by PartnerPicker and sales/expense forms. */
export interface PartnerOption {
  id: string;
  code: string | null;
  nameTh: string;
  taxId: string | null;
  type: PartnerType;
  address: string | null;
  branch?: string | null;
  defaultWhtRate?: string | null;
}

/** Product row from GET /api/products — used by ProductPicker and sales line items. */
export interface ProductOption {
  id: string;
  code: string | null;
  nameTh: string;
  type: ProductType;
  unit: string;
  unitPrice: string;
  vatable: boolean;
  description: string | null;
}