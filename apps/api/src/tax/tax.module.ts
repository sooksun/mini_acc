import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';
import { VatService } from './vat.service';
import { WhtPdfService } from './wht-pdf.service';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [PdfModule],
  controllers: [TaxController],
  providers: [TaxService, VatService, WhtPdfService],
  exports: [VatService],
})
export class TaxModule {}
