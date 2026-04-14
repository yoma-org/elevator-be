import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';

function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedException('No token provided');
  }
  return authHeader.slice(7);
}

@ApiTags('auth')
@Controller('auth')
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  /** POST /auth/login — Login via Supabase (or seed) */
  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  /** POST /auth/logout — Invalidate current access token */
  @Post('logout')
  @ApiBearerAuth('admin-jwt')
  async logout(@Headers('authorization') authHeader?: string) {
    const token = extractBearerToken(authHeader);
    return this.authService.logout(token);
  }

  /** GET /auth/me — Current user profile + role permissions */
  @Get('me')
  @ApiBearerAuth('admin-jwt')
  async me(@Headers('authorization') authHeader?: string) {
    const token = extractBearerToken(authHeader);
    return this.authService.getMe(token);
  }

  /** POST /auth/refresh — Issue a new access/refresh token pair */
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    if (!body?.refreshToken) {
      throw new UnauthorizedException('refreshToken is required');
    }
    return this.authService.refresh(body.refreshToken);
  }
}
