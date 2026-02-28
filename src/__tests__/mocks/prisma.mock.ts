/**
 * Prisma mock helper.
 * Import this and then call jest.mock('../../config/database', () => prismaMockModule)
 * from within each test file, OR use the exported prismaMock to set return values.
 *
 * Usage pattern (in test files):
 *   import { prismaMock } from './__tests__/mocks/prisma.mock';
 *   jest.mock('../../config/database', () => require('../mocks/prisma.mock').prismaMockModule);
 */

export const prismaMock = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  client: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  invoice: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  budget: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  $disconnect: jest.fn(),
};

/** The module factory to pass to jest.mock() */
export const prismaMockModule = {
  __esModule: true,
  default: prismaMock,
};

/** Reset all mocks between tests */
export function resetPrismaMock(): void {
  Object.values(prismaMock).forEach((model) => {
    if (typeof model === 'object' && model !== null) {
      Object.values(model).forEach((fn) => {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as jest.Mock).mockReset();
        }
      });
    }
  });
}
