import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [AiModule], // provides OpenRouterClient; AuditLogService is global
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
