/**
 * Unit tests for ClientsService.
 * Prisma is mocked — no real DB connection is made.
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

import { prismaMock, prismaMockModule, resetPrismaMock } from './mocks/prisma.mock';

jest.mock('../config/database', () => prismaMockModule);

import { ClientsService } from '../modules/clients/clients.service';

describe('ClientsService', () => {
  let service: ClientsService;

  beforeEach(() => {
    service = new ClientsService();
    resetPrismaMock();
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------
  describe('create()', () => {
    it('calls prisma.client.create with the provided data', async () => {
      const input = {
        name: 'Acme Corp',
        email: 'contact@acme.com',
        createdById: 'user-1',
      };
      const createdClient = { id: 'client-1', ...input, createdAt: new Date() };
      prismaMock.client.create.mockResolvedValue(createdClient);

      const result = await service.create(input);

      expect(prismaMock.client.create).toHaveBeenCalledWith({ data: input });
      expect(result).toEqual(createdClient);
    });

    it('passes createdById through to Prisma without modification', async () => {
      const input = { name: 'Corp', email: 'a@b.com', createdById: 'user-42' };
      prismaMock.client.create.mockResolvedValue({ id: 'c1', ...input });

      await service.create(input);

      const callArg = prismaMock.client.create.mock.calls[0][0];
      expect(callArg.data.createdById).toBe('user-42');
    });
  });

  // ---------------------------------------------------------------------------
  // findAll()
  // ---------------------------------------------------------------------------
  describe('findAll()', () => {
    it('calls findMany with no where clauses when query is empty', async () => {
      prismaMock.client.findMany.mockResolvedValue([]);

      await service.findAll({});

      const callArg = prismaMock.client.findMany.mock.calls[0][0];
      expect(callArg.where).toEqual({});
    });

    it('includes status in the where clause when status filter is provided', async () => {
      prismaMock.client.findMany.mockResolvedValue([]);

      await service.findAll({ status: 'ACTIVE' });

      const callArg = prismaMock.client.findMany.mock.calls[0][0];
      expect(callArg.where.status).toBe('ACTIVE');
    });

    it('uses contains with insensitive mode for name search', async () => {
      prismaMock.client.findMany.mockResolvedValue([]);

      await service.findAll({ search: 'acme' });

      const callArg = prismaMock.client.findMany.mock.calls[0][0];
      expect(callArg.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: { contains: 'acme', mode: 'insensitive' } }),
        ])
      );
    });

    it('combines status and search filters together', async () => {
      prismaMock.client.findMany.mockResolvedValue([]);

      await service.findAll({ status: 'ACTIVE', search: 'acme' });

      const callArg = prismaMock.client.findMany.mock.calls[0][0];
      expect(callArg.where.status).toBe('ACTIVE');
      expect(callArg.where.OR).toBeDefined();
    });

    it('returns the array returned by prisma.client.findMany', async () => {
      const clients = [
        { id: 'c1', name: 'Alpha', status: 'ACTIVE' },
        { id: 'c2', name: 'Beta', status: 'ACTIVE' },
      ];
      prismaMock.client.findMany.mockResolvedValue(clients);

      const result = await service.findAll({ status: 'ACTIVE' });

      expect(result).toEqual(clients);
    });
  });

  // ---------------------------------------------------------------------------
  // delete()
  // ---------------------------------------------------------------------------
  describe('delete()', () => {
    it('calls prisma.client.delete with the correct id', async () => {
      const existingClient = { id: 'client-1', name: 'Acme' };
      prismaMock.client.findUnique.mockResolvedValue(existingClient);
      prismaMock.client.delete.mockResolvedValue(existingClient);

      await service.delete('client-1');

      expect(prismaMock.client.delete).toHaveBeenCalledWith({ where: { id: 'client-1' } });
    });

    it('throws 404 when client does not exist', async () => {
      prismaMock.client.findUnique.mockResolvedValue(null);

      await expect(service.delete('nonexistent-id')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Client not found',
      });
    });

    it('does not call prisma.client.delete when client is not found', async () => {
      prismaMock.client.findUnique.mockResolvedValue(null);

      await expect(service.delete('bad-id')).rejects.toBeDefined();
      expect(prismaMock.client.delete).not.toHaveBeenCalled();
    });
  });
});
