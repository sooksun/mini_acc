import { Module } from '@nestjs/common';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [InventoryModule, ProjectsModule],
  controllers: [RisksController],
  providers: [RisksService],
  exports: [RisksService],
})
export class RisksModule {}
