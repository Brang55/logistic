import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { refreshTokens, User, UserRole, users } from "../db/schema";
import { AuthUser } from "./auth-user";

const DAY_MS = 24 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string, role: UserRole = "dispatcher"): Promise<AuthUser> {
    const [user] = await this.db
      .insert(users)
      .values({ email: email.toLowerCase(), passwordHash: await argon2.hash(password), role })
      .returning();
    return toAuthUser(user);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.issueTokens(user);
  }

  // Refresh tokens are opaque "<id>.<secret>" strings, single-use and rotated on every refresh.
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const [id, secret] = refreshToken.split(".");
    const stored = id && secret
      ? await this.db.query.refreshTokens.findFirst({ where: eq(refreshTokens.id, id) }).catch(() => undefined)
      : undefined;
    if (!stored || !timingSafeEqual(sha256(secret), Buffer.from(stored.tokenHash, "hex"))) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (stored.revokedAt) {
      // A rotated token was replayed: treat as theft and end every session for this user.
      await this.revokeAll(stored.userId);
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));
    const user = await this.db.query.users.findFirst({ where: eq(users.id, stored.userId) });
    if (!user) throw new UnauthorizedException("Invalid refresh token");
    return this.issueTokens(user);
  }

  async logout(refreshToken: string) {
    const [id] = refreshToken.split(".");
    if (!id) return;
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
      .catch(() => undefined);
  }

  private async revokeAll(userId: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const authUser = toAuthUser(user);
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });

    const secret = randomBytes(32).toString("base64url");
    const ttlDays = Number(this.config.get("REFRESH_TTL_DAYS") ?? 7);
    const [row] = await this.db
      .insert(refreshTokens)
      .values({
        userId: user.id,
        tokenHash: sha256(secret).toString("hex"),
        expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
      })
      .returning({ id: refreshTokens.id });

    return { accessToken, refreshToken: `${row.id}.${secret}`, user: authUser };
  }
}

const toAuthUser = (user: User): AuthUser => ({ id: user.id, email: user.email, role: user.role });
