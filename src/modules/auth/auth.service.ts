import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../config/database';

const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

if (!ACCESS_TOKEN_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}
if (!REFRESH_TOKEN_SECRET) {
  throw new Error('REFRESH_TOKEN_SECRET environment variable is not set');
}

// In-memory blacklist for refresh tokens
const refreshTokenBlacklist = new Set<string>();

export class AuthService {
  generateAccessToken(user: { id: string; email: string; role: string }): string {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      ACCESS_TOKEN_SECRET as string,
      { expiresIn: '15m' }
    );
  }

  generateRefreshToken(userId: string): string {
    return jwt.sign(
      { id: userId },
      REFRESH_TOKEN_SECRET as string,
      { expiresIn: '30d' }
    );
  }

  addToBlacklist(token: string): void {
    refreshTokenBlacklist.add(token);
  }

  isBlacklisted(token: string): boolean {
    return refreshTokenBlacklist.has(token);
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    if (this.isBlacklisted(refreshToken)) {
      throw { statusCode: 401, message: 'Refresh token has been revoked' };
    }

    let decoded: { id: string };
    try {
      decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET as string) as { id: string };
    } catch {
      throw { statusCode: 401, message: 'Invalid or expired refresh token' };
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw { statusCode: 401, message: 'User not found' };
    }

    return this.generateAccessToken(user);
  }

  invalidateRefreshToken(token: string): void {
    this.addToBlacklist(token);
  }

  async register(data: { name: string; email: string; password: string }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw { statusCode: 409, message: 'Email already registered' };
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: 'MEMBER',
      },
      select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true },
    });

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user.id);
    return { user, accessToken, refreshToken };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw { statusCode: 401, message: 'Invalid credentials' };
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw { statusCode: 401, message: 'Invalid credentials' };
    }

    const accessToken = this.generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = this.generateRefreshToken(user.id);

    const { password: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, accessToken, refreshToken };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true },
    });

    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }

    return user;
  }

  async updateProfile(userId: string, data: { name?: string; email?: string; currentPassword?: string; newPassword?: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }

    if (data.email && data.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        throw { statusCode: 409, message: 'Email already in use' };
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;

    if (data.newPassword) {
      if (!data.currentPassword) {
        throw { statusCode: 400, message: 'Current password is required to change password' };
      }
      const isValid = await bcrypt.compare(data.currentPassword, user.password);
      if (!isValid) {
        throw { statusCode: 401, message: 'Current password is incorrect' };
      }
      updateData.password = await bcrypt.hash(data.newPassword, 10);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true },
    });

    return updated;
  }
}
