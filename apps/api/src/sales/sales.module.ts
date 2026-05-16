import { Module } from '@nestjs/common';
import { SalesDocumentService } from './_shared/sales-document.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { DeliveryNotesController } from './delivery-notes.controller';
import { DeliveryNotesService } from './delivery-notes.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { TaxInvoicesController } from './tax-invoices.controller';
import { TaxInvoicesService } from './tax-invoices.service';
import { ReceiptTaxInvoicesController } from './receipt-tax-invoices.controller';
import { ReceiptTaxInvoicesService } from './receipt-tax-invoices.service';
import { TaxModule } from '../tax/tax.module';

@Module({
  imports: [TaxModule],
  controllers: [
    QuotationsController,
    InvoicesController,
    DeliveryNotesController,
    ReceiptsController,
    TaxInvoicesController,
    ReceiptTaxInvoicesController,
  ],
  providers: [
    SalesDocumentService,
    QuotationsService,
    InvoicesService,
    DeliveryNotesService,
    ReceiptsService,
    TaxInvoicesService,
    ReceiptTaxInvoicesService,
  ],
  exports: [
    SalesDocumentService,
    QuotationsService,
    InvoicesService,
    DeliveryNotesService,
    ReceiptsService,
    TaxInvoicesService,
    ReceiptTaxInvoicesService,
  ],
})
export class SalesModule {}
