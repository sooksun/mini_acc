import { Module } from '@nestjs/common';
import { ClosingController } from './closing.controller';
import { ClosingService } from './closing.service';
import { RisksModule } from '../risks/risks.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [RisksModule, InventoryModule],
  controllers: [ClosingController],
  providers: [ClosingService],
  exports: [ClosingService],
})
export class ClosingModule {}
