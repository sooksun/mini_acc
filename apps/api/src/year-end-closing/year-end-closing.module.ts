import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { YearEndClosingController } from './year-end-closing.controller';
import { YearEndClosingService } from './year-end-closing.service';

@Module({
  imports: [JournalModule],
  controllers: [YearEndClosingController],
  providers: [YearEndClosingService],
  exports: [YearEndClosingService],
})
export class YearEndClosingModule {}
