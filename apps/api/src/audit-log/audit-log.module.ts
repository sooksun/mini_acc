import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogController } from './audit-log.controller';

@Global()
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogInterceptor],
  exports: [AuditLogService],
})
export class AuditLogModule {}
