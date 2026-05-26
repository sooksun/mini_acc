import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { ProductsModule } from '../../products/products.module';
import { SalesModule } from '../sales.module';
import { FromReceiptsController } from './from-receipts.controller';
import { FromReceiptsService } from './from-receipts.service';

@Module({
  // AiModule → OpenRouterClient, ProductsModule → ProductsService,
  // SalesModule → SalesDocumentService. PrismaService is global.
  imports: [AiModule, ProductsModule, SalesModule],
  controllers: [FromReceiptsController],
  providers: [FromReceiptsService],
})
export class FromReceiptsModule {}
