import { Injectable } from '@nestjs/common';
import { Prisma, PushPlatform } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  buildLateInvoiceWhere,
  buildUnpaidNotLateInvoiceWhere,
  buildUnsentEInvoiceWhere,
} from './reminder-query.util';

const PAGE_SIZE = 50;

// The exact shape the admin devices list needs per row — a PushDevice
// joined with its owning User's email and 1:1 Company name, in one query
// rather than N+1. Same typed-select convention as AdminRepository's
// ADMIN_USER_ROW_SELECT.
const PUSH_DEVICE_ROW_SELECT = {
  id: true,
  platform: true,
  token: true,
  lastActiveAt: true,
  createdAt: true,
  user: {
    select: {
      email: true,
      company: { select: { name: true } },
    },
  },
} satisfies Prisma.PushDeviceSelect;

export type PushDeviceRow = Prisma.PushDeviceGetPayload<{ select: typeof PUSH_DEVICE_ROW_SELECT }>;

// One company's daily digest counts — resolved separately from its device
// tokens (see findDeviceTokensByCompanyIds) since a company with zero
// registered devices still needs to be excluded from the "who gets a push"
// set without needing a join at the counting stage.
export interface ReminderCounts {
  companyId: string;
  lateCount: number;
  unpaidCount: number;
  // Phase 1.3-5 (2026 e-invoicing reform, workflow automation): FACTUREs
  // sitting un-transmitted for a company that's connected to SUPER PDP —
  // see reminder-query.util.ts's buildUnsentEInvoiceWhere for the exact
  // eligibility rule.
  unsentEInvoiceCount: number;
}

@Injectable()
export class PushNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Upsert on the unique token: a re-registration (reinstall, token
  // refresh, or a different artisan logging into the same physical device)
  // must repoint userId/platform on the existing row, never accumulate a
  // stale duplicate for a device nobody uses under that identity anymore.
  async upsertDevice(userId: string, platform: PushPlatform, token: string): Promise<void> {
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, platform, token },
      update: { userId, platform, lastActiveAt: new Date() },
    });
  }

  // Scoped to the requesting user — an artisan can only ever unregister
  // their own device, never someone else's by guessing a token.
  async deleteByToken(userId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
  }

  async findById(id: string): Promise<PushDeviceRow | null> {
    return this.prisma.pushDevice.findUnique({ where: { id }, select: PUSH_DEVICE_ROW_SELECT });
  }

  async listForAdmin(
    search: string | undefined,
    page: number,
  ): Promise<{ rows: PushDeviceRow[]; total: number }> {
    const where: Prisma.PushDeviceWhereInput = search
      ? {
          OR: [
            { user: { email: { contains: search, mode: 'insensitive' } } },
            { user: { company: { name: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {};

    const safePage = Math.max(1, page);
    const [rows, total] = await Promise.all([
      this.prisma.pushDevice.findMany({
        where,
        select: PUSH_DEVICE_ROW_SELECT,
        orderBy: { lastActiveAt: 'desc' },
        skip: (safePage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.pushDevice.count({ where }),
    ]);
    return { rows, total };
  }

  // Per-company late/unpaid/unsent-e-invoice counts for the daily digest —
  // only companies with at least one invoice in any bucket are returned, so
  // ReminderCronService never has to filter out zero-count rows itself.
  async findReminderCounts(now: Date): Promise<ReminderCounts[]> {
    const [late, unpaid, unsentEInvoice] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['companyId'],
        where: buildLateInvoiceWhere(now),
        _count: { _all: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['companyId'],
        where: buildUnpaidNotLateInvoiceWhere(now),
        _count: { _all: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['companyId'],
        where: buildUnsentEInvoiceWhere(now),
        _count: { _all: true },
      }),
    ]);

    const counts = new Map<string, ReminderCounts>();
    const empty = (companyId: string): ReminderCounts => ({
      companyId,
      lateCount: 0,
      unpaidCount: 0,
      unsentEInvoiceCount: 0,
    });
    for (const row of late) {
      counts.set(row.companyId, { ...empty(row.companyId), lateCount: row._count._all });
    }
    for (const row of unpaid) {
      const existing = counts.get(row.companyId) ?? empty(row.companyId);
      existing.unpaidCount = row._count._all;
      counts.set(row.companyId, existing);
    }
    for (const row of unsentEInvoice) {
      const existing = counts.get(row.companyId) ?? empty(row.companyId);
      existing.unsentEInvoiceCount = row._count._all;
      counts.set(row.companyId, existing);
    }
    return Array.from(counts.values());
  }

  // Company is 1:1 with User (schema.prisma), so "this company's devices"
  // is just "this company's one user's devices" — no fan-out to worry about.
  async findDeviceTokensByCompanyIds(companyIds: string[]): Promise<Map<string, string[]>> {
    if (companyIds.length === 0) {
      return new Map();
    }
    const devices = await this.prisma.pushDevice.findMany({
      where: { user: { companyId: { in: companyIds } } },
      select: { token: true, user: { select: { companyId: true } } },
    });
    const byCompany = new Map<string, string[]>();
    for (const device of devices) {
      const tokens = byCompany.get(device.user.companyId) ?? [];
      tokens.push(device.token);
      byCompany.set(device.user.companyId, tokens);
    }
    return byCompany;
  }

  // Bumped once per company after its digest push is sent — guards only
  // against double-notifying if the cron is ever manually re-run within the
  // same day (see Invoice.lastPushReminderAt's comment in schema.prisma).
  // Phase 1.3-5: the OR now also covers an un-transmitted FACTURE — any
  // company in `companyIds` had a non-empty digest sent successfully today,
  // so every invoice that could have contributed to it (late/unpaid OR
  // unsent-e-invoice) is fairly stamped as "reminded about," not just the
  // two original buckets.
  async markReminded(companyIds: string[], now: Date): Promise<void> {
    if (companyIds.length === 0) {
      return;
    }
    await this.prisma.invoice.updateMany({
      where: {
        companyId: { in: companyIds },
        OR: [
          { status: 'NON_PAYEE' },
          { documentType: 'FACTURE', eInvoiceTransmissionStatus: 'NOT_SENT' },
        ],
      },
      data: { lastPushReminderAt: now },
    });
  }
}
