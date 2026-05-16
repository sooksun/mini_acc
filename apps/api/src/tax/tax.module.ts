import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';
import { VatService } from './vat.service';

@Module({
  controllers: [TaxController],
  providers: [TaxService, VatService],
  exports: [VatService],
})
export class TaxModule {}
