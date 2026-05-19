import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [PrismaModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
