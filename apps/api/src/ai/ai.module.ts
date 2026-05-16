import { Module } from '@nestjs/common';
import { AiInboxController } from './ai-inbox.controller';
import { AiInboxService } from './ai-inbox.service';
import { OpenRouterClient } from './openrouter.client';
import { ExpenseReceiptsModule } from '../expense-receipts/expense-receipts.module';

@Module({
  imports: [ExpenseReceiptsModule],
  controllers: [AiInboxController],
  providers: [AiInboxService, OpenRouterClient],
  exports: [AiInboxService, OpenRouterClient],
})
export class AiModule {}
