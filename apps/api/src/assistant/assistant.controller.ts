import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AssistantService } from './assistant.service';
import { PageAdviceDto } from './dto/page-advice.dto';
import { AssistantChatDto } from './dto/chat.dto';

@Controller('assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /** Short contextual guidance for the page the user just opened. */
  @Post('page-advice')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  pageAdvice(@CurrentUser() user: AuthUser, @Body() dto: PageAdviceDto) {
    return this.assistant.pageAdvice(user, dto.context);
  }

  /** Multi-turn clarify→fill. Returns {action:'ask'|'fill'} — never saves. */
  @Post('chat')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  chat(@CurrentUser() user: AuthUser, @Body() dto: AssistantChatDto) {
    return this.assistant.chat(user, dto.context, dto.messages);
  }
}
