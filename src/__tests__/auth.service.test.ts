/**
 * Unit tests for AuthService.
 * Prisma is mocked — no real DB connection is made.
 * JWT_SECRET and REFRESH_TOKEN_SECRET are set before the module loads.
 */

// Must be set before importing auth.service (module-level guard throws if absent)
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

import { prismaMock, prismaMockModule, resetPrismaMock } from './mocks/prisma.mock';

jest.mock('../config/database', () => prismaMockModule);

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AuthService } from '../modules/auth/auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    resetPrismaMock();
  });

  // ---------------------------------------------------------------------------
  // register()
  // ---------------------------------------------------------------------------
  describe('register()', () => {
    it('creates a user and returns accessToken + refreshToken', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'MEMBER',
        avatar: null,
        createdAt: new Date(),
      });

      const result = await service.register({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'plaintext123',
      });

      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('stores a hashed password — not the plaintext password', async () => {
      const plaintext = 'plaintext123';
      let capturedData: any;

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockImplementation(async ({ data }: { data: any }) => {
        capturedData = data;
        return {
          id: 'user-1',
          name: 'Alice',
          email: 'alice@example.com',
          role: 'MEMBER',
          avatar: null,
          createdAt: new Date(),
        };
      });

      await service.register({ name: 'Alice', email: 'alice@example.com', password: plaintext });

      expect(capturedData.password).toBeDefined();
      expect(capturedData.password).not.toBe(plaintext);
      // Verify it is a valid bcrypt hash
      const isHash = await bcrypt.compare(plaintext, capturedData.password);
      expect(isHash).toBe(true);
    });

    it('throws 409 when email is already registered', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'alice@example.com',
      });

      await expect(
        service.register({ name: 'Alice', email: 'alice@example.com', password: 'pass' })
      ).rejects.toMatchObject({ statusCode: 409, message: 'Email already registered' });
    });

    it('returns a valid JWT access token signed with JWT_SECRET', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'MEMBER',
        avatar: null,
        createdAt: new Date(),
      });

      const result = await service.register({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'pass123',
      });

      const decoded = jwt.verify(result.accessToken, 'test-jwt-secret') as any;
      expect(decoded.id).toBe('user-1');
      expect(decoded.email).toBe('alice@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // login()
  // ---------------------------------------------------------------------------
  describe('login()', () => {
    it('returns accessToken and refreshToken with correct credentials', async () => {
      const plaintext = 'correct-password';
      const hashed = await bcrypt.hash(plaintext, 10);

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        password: hashed,
        role: 'MEMBER',
        avatar: null,
        createdAt: new Date(),
      });

      const result = await service.login('alice@example.com', plaintext);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).not.toHaveProperty('password');
    });

    it('throws 401 when password is wrong', async () => {
      const hashed = await bcrypt.hash('correct-password', 10);

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'alice@example.com',
        password: hashed,
        role: 'MEMBER',
      });

      await expect(service.login('alice@example.com', 'wrong-password')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid credentials',
      });
    });

    it('throws 401 when email does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.login('nobody@example.com', 'any-pass')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid credentials',
      });
    });

    it('does not expose the password field in the returned user', async () => {
      const hashed = await bcrypt.hash('pass', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        password: hashed,
        role: 'MEMBER',
        avatar: null,
        createdAt: new Date(),
      });

      const result = await service.login('alice@example.com', 'pass');
      expect(result.user).not.toHaveProperty('password');
    });
  });
});
