/**
 * Smoke test — verifies the Express app boots and GET /api/health responds 200.
 * All heavy dependencies (Prisma, agents) are mocked so no real DB is needed.
 */

// Must set env vars before importing server
process.env.JWT_SECRET = 'test-secret';
process.env.GROQ_API_KEY = 'test-key';
// Use port 0 so the OS assigns a free port — avoids EADDRINUSE when dev server is running
process.env.PORT = '0';

// Mock Prisma to avoid real DB connections
jest.mock('../config/database', () => ({
  __esModule: true,
  default: {
    $disconnect: jest.fn().mockResolvedValue(undefined),
    user: { findUnique: jest.fn() },
    message: { create: jest.fn() },
  },
}));

// Mock agent scheduler and logger to avoid side-effects on boot
jest.mock('../agents/scheduler.agent', () => ({
  startAllAgents: jest.fn(),
}));

jest.mock('../agents/agent-logger', () => ({
  setAgentLoggerIo: jest.fn(),
}));


import request from 'supertest';
import app from '../server';

describe('Smoke test — health endpoint', () => {
  it('GET /api/health returns 200 and { status: "ok" }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});
