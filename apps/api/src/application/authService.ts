import bcrypt from 'bcryptjs';
import type { AuthResponse, User } from '@campusar/shared';
import { AppError } from '../domain/errors';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../infrastructure/auth/jwt';
import { userRepository } from '../infrastructure/repositories/userRepository';

function toPublicUser(user: User & { passwordHash?: string | null }): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function tokensFor(user: User) {
  const payload = {
    sub: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export const authService = {
  async register(input: { email: string; password: string; name: string }): Promise<AuthResponse> {
    const existing = await userRepository.findByEmail(input.email.toLowerCase());
    if (existing) throw new AppError('EMAIL_TAKEN', 'Email already registered', 409);
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await userRepository.create({
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      role: 'user',
    });
    return { user: toPublicUser(user), tokens: tokensFor(user) };
  },

  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    const user = await userRepository.findByEmail(input.email.toLowerCase());
    if (!user?.passwordHash)
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    return { user: toPublicUser(user), tokens: tokensFor(user) };
  },

  async guest(name?: string): Promise<AuthResponse> {
    const user = await userRepository.create({
      email: null,
      passwordHash: null,
      name: name?.trim() || 'Guest Visitor',
      role: 'guest',
    });
    return { user: toPublicUser(user), tokens: tokensFor(user) };
  },

  async refresh(refreshToken: string): Promise<AuthResponse> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await userRepository.findById(payload.sub);
      if (!user) throw new AppError('UNAUTHORIZED', 'User not found', 401);
      return { user: toPublicUser(user), tokens: tokensFor(user) };
    } catch {
      throw new AppError('UNAUTHORIZED', 'Invalid refresh token', 401);
    }
  },
};
