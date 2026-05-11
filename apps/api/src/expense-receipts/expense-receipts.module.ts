import { Module } from '@nestjs/common';
import { ExpenseReceiptsController } from './expense-receipts.controller';
import { ExpenseReceiptsService } from './expense-receipts.service';

@Module({
  controllers: [ExpenseReceiptsController],
  providers: [ExpenseReceiptsService],
  exports: [ExpenseReceiptsService],
})
export class ExpenseReceiptsModule {}
