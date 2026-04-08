import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AdminAuthService, TokenPayload } from './admin-auth.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly authService: AdminAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization as string | undefined;

    if (!authHeader?.startsWith('Bearer ')) {
      // No token → allow through with default role (backward compatible)
      req.adminUser = { sub: '', email: '', name: 'ADMIN', role: 'operation', iat: 0, exp: 0 };
      return true;
    }

    try {
      const token = authHeader.slice(7);
      const payload: TokenPayload = this.authService.verifyToken(token);
      req.adminUser = payload;
    } catch {
      // Invalid token → still allow through with default role
      req.adminUser = { sub: '', email: '', name: 'ADMIN', role: 'operation', iat: 0, exp: 0 };
    }

    return true;
  }
}
