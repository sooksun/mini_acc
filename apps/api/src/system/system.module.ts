import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [PrismaModule, SalesModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
