import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@hj/shared-types';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
