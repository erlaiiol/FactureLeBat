import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

const PAGE_SIZE = 50;

// The exact shape AdminService needs per row — a User joined with its 1:1
// Company's billing fields and a count of its invoices, in one query
// rather than N+1.
const ADMIN_USER_ROW_SELECT = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  company: {
    select: {
      id: true,
      name: true,
      subscriptionStatus: true,
      premiumGrantedUntil: true,
      _count: { select: { invoices: true } },
    },
  },
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_ROW_SELECT }>;

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(
    search: string | undefined,
    page: number,
  ): Promise<{ rows: AdminUserRow[]; total: number }> {
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { company: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const safePage = Math.max(1, page);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_ROW_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total };
  }
}

export { PAGE_SIZE as ADMIN_USERS_PAGE_SIZE };
