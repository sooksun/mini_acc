import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { LedgerAggregationService } from './ledger-aggregation.service';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [LedgerAggregationService, ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
