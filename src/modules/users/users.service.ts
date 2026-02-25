import bcrypt from 'bcryptjs';
import prisma from '../../config/database';

export class UsersService {
  async findAll(query: { search?: string; role?: string }) {
    const where: any = {};

    if (query.role) where.role = query.role;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true, avatar: true, createdAt: true, updatedAt: true,
        _count: { select: { tasks: true, calendarEvents: true } },
      },
    });
    if (!user) throw { statusCode: 404, message: 'User not found' };
    return user;
  }

  async create(data: { name: string; email: string; password: string; role?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw { statusCode: 409, message: 'Email already registered' };

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: (data.role as any) || 'MEMBER',
      },
      select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true },
    });
  }

  async update(id: string, data: { name?: string; email?: string; role?: string }) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw { statusCode: 404, message: 'User not found' };

    if (data.email && data.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) throw { statusCode: 409, message: 'Email already in use' };
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;

    return prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true },
    });
  }

  async delete(id: string, requesterId: string, requesterRole: string) {
    if (id === requesterId) throw { statusCode: 400, message: 'Cannot delete your own account' };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw { statusCode: 404, message: 'User not found' };
    if (user.role === 'ADMIN' && requesterRole !== 'ADMIN') {
      throw { statusCode: 403, message: 'Only admins can delete other admins' };
    }
    return prisma.user.delete({ where: { id } });
  }
}
