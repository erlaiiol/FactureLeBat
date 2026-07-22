import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { SourcingSearchKind } from '../../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import { CACHE_TTL_MS } from './sourcing.constants';

// Isolated Prisma access for the sourcing domain (see docs/development-
// rules.md #7) — also where the cache/daily-cap logic lives, since both read
// the same SourcingSearch rows (see schema.prisma's SourcingSearch comment).
@Injectable()
export class SourcingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findFresh<T>(
    companyId: string,
    kind: SourcingSearchKind,
    queryHash: string,
  ): Promise<T[] | null> {
    const row = await this.prisma.sourcingSearch.findUnique({
      where: { companyId_kind_queryHash: { companyId, kind, queryHash } },
    });
    if (!row || Date.now() - row.createdAt.getTime() > CACHE_TTL_MS) {
      return null; // absent, or stale enough to force a fresh Groq call
    }
    return row.resultJson as T[];
  }

  async countToday(companyId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.sourcingSearch.count({
      where: { companyId, createdAt: { gte: startOfDay } },
    });
  }

  // Upsert, not create: a fresh search for an expired cache row must replace
  // it in place rather than fight the @@unique([companyId, kind, queryHash])
  // constraint with a duplicate insert.
  async save<T>(
    companyId: string,
    kind: SourcingSearchKind,
    queryHash: string,
    result: T[],
  ): Promise<void> {
    // Every domain type stored here (SupplierCandidate[], ComplementarySuggestion[])
    // is a plain interface of string/number/boolean/null fields — always
    // structurally valid JSON, hence this cast rather than a generic <T
    // extends Prisma.InputJsonValue> bound that would leak Prisma types into
    // every caller's signature.
    const resultJson = result as unknown as Prisma.InputJsonValue;
    await this.prisma.sourcingSearch.upsert({
      where: { companyId_kind_queryHash: { companyId, kind, queryHash } },
      update: { resultJson, createdAt: new Date() },
      create: { companyId, kind, queryHash, resultJson },
    });
  }
}
