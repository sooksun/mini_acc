import { Module } from '@nestjs/common';
import { AccountantPackController } from './accountant-pack.controller';
import { AccountantPackService } from './accountant-pack.service';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [PdfModule],
  controllers: [AccountantPackController],
  providers: [AccountantPackService],
})
export class AccountantPackModule {}
