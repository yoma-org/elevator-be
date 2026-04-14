import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../common/supabase.service';
import { getRolePermissions, getVisibleStatuses, NEXT_STATUS } from './permissions';

const ACCESS_TOKEN_EXPIRY_SECONDS = 60 * 60; // 1 hour
const REFRESH_TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type AdminRole = 'operation' | 'mnt-manager' | 'pc-team' | 'commercial' | 'management';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  password: string;
  active: boolean;
}

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: AdminRole;
  typ?: 'access' | 'refresh';
  jti?: string;
  iat: number;
  exp: number;
}

// In-memory revocation list — tokens with `jti` in this set are rejected.
// For production, move to Redis or DB.
const REVOKED_JTI = new Set<string>();

/**
 * Hardcoded seed users — used as fallback when the admin_users table
 * does not exist yet in Supabase (e.g. during local development).
 */
const SEED_USERS: AdminUser[] = [
  { id: randomUUID(), email: 'ops@yomaelevator.com', password: 'yecl2024', name: 'Rita Chen', role: 'operation', active: true },
  { id: randomUUID(), email: 'manager@yomaelevator.com', password: 'yecl2024', name: 'MNT Manager', role: 'mnt-manager', active: true },
  { id: randomUUID(), email: 'pc@yomaelevator.com', password: 'yecl2024', name: 'PC Team', role: 'pc-team', active: true },
  { id: randomUUID(), email: 'commercial@yomaelevator.com', password: 'yecl2024', name: 'Commercial Team', role: 'commercial', active: true },
  { id: randomUUID(), email: 'management@yomaelevator.com', password: 'yecl2024', name: 'Management', role: 'management', active: true },
];

@Injectable()
export class AdminAuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret = this.config.get<string>('ADMIN_JWT_SECRET', 'yecl-admin-secret-change-me');
  }

  /**
   * Try to find user in Supabase admin_users table.
   * Falls back to SEED_USERS if the table doesn't exist.
   */
  private async findUser(email: string): Promise<AdminUser | null> {
    try {
      const { data, error } = await this.supabase.client
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .eq('active', true)
        .single();

      if (!error && data) return data as AdminUser;
    } catch {
      // table doesn't exist — fall through to seed
    }

    // Fallback: match against hardcoded seed users
    return SEED_USERS.find(u => u.email === email && u.active) ?? null;
  }

  private issueTokenPair(user: AdminUser) {
    const now = Math.floor(Date.now() / 1000);
    const accessPayload: TokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      typ: 'access',
      jti: randomUUID(),
      iat: now,
      exp: now + ACCESS_TOKEN_EXPIRY_SECONDS,
    };
    const refreshPayload: TokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      typ: 'refresh',
      jti: randomUUID(),
      iat: now,
      exp: now + REFRESH_TOKEN_EXPIRY_SECONDS,
    };
    return {
      accessToken: this.signToken(accessPayload),
      refreshToken: this.signToken(refreshPayload),
      accessExpiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_EXPIRY_SECONDS,
    };
  }

  private buildUserProfile(user: AdminUser) {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      permissions: {
        role: user.role,
        matrix: getRolePermissions(user.role),
        visibleStatuses: getVisibleStatuses(user.role),
        nextStatus: NEXT_STATUS,
      },
    };
  }

  async login(email: string, password: string) {
    const user = await this.findUser(email.toLowerCase().trim());

    if (!user || user.password !== password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      ...this.issueTokenPair(user),
      ...this.buildUserProfile(user),
    };
  }

  async logout(token: string): Promise<{ success: true }> {
    try {
      const payload = this.verifyToken(token);
      if (payload.jti) REVOKED_JTI.add(payload.jti);
    } catch {
      // Token already invalid; no-op.
    }
    return { success: true };
  }

  async refresh(refreshToken: string) {
    const payload = this.verifyToken(refreshToken);
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }
    const user = await this.findUser(payload.email.toLowerCase());
    if (!user) throw new UnauthorizedException('User no longer exists');

    // Rotate: revoke old refresh jti and issue new pair
    if (payload.jti) REVOKED_JTI.add(payload.jti);
    return {
      ...this.issueTokenPair(user),
      ...this.buildUserProfile(user),
    };
  }

  async getMe(accessToken: string) {
    const payload = this.verifyToken(accessToken);
    if (payload.typ && payload.typ !== 'access') {
      throw new UnauthorizedException('Not an access token');
    }
    const user = await this.findUser(payload.email.toLowerCase());
    if (!user) throw new UnauthorizedException('User no longer exists');
    return this.buildUserProfile(user);
  }

  verifyToken(token: string): TokenPayload {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid token format');

      const [headerB64, payloadB64, signatureB64] = parts;
      const expectedSig = this.hmac(`${headerB64}.${payloadB64}`);

      const sigBuf = Buffer.from(signatureB64, 'base64url');
      const expectedBuf = Buffer.from(expectedSig, 'base64url');

      if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
        throw new Error('Invalid signature');
      }

      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString(),
      ) as TokenPayload;

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }

      if (payload.jti && REVOKED_JTI.has(payload.jti)) {
        throw new Error('Token revoked');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private signToken(payload: TokenPayload): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.hmac(`${header}.${body}`);
    return `${header}.${body}.${signature}`;
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.jwtSecret).update(data).digest('base64url');
  }
}
