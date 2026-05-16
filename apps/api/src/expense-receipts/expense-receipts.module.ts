import { Module } from '@nestjs/common';
import { ExpenseReceiptsController } from './expense-receipts.controller';
import { ExpenseReceiptsService } from './expense-receipts.service';
import { JournalModule } from '../journal/journal.module';
import { TaxModule } from '../tax/tax.module';

@Module({
  imports: [JournalModule, TaxModule],
  controllers: [ExpenseReceiptsController],
  providers: [ExpenseReceiptsService],
  exports: [ExpenseReceiptsService],
})
export class ExpenseReceiptsModule {}
