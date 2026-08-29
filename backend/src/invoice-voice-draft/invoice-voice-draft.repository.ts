import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

// Counts, not caches — every voice-draft call reaches whichever LlmClient
// is bound (see llm/llm-client.interface.ts) and is billed the same
// regardless of outcome (resolved or rejected), so a row
// is written for each one and this repository's only job is the daily-cap
// count. See SourcingRepository.countToday for the identical pattern; no
// resultJson/queryHash here since a voice draft is never reused across
// requests the way a sourcing search result is.
@Injectable()
export class InvoiceVoiceDraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countToday(companyId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.voiceDraftRequest.count({
      where: { companyId, createdAt: { gte: startOfDay } },
    });
  }

  async recordUsage(companyId: string): Promise<void> {
    await this.prisma.voiceDraftRequest.create({ data: { companyId } });
  }
}
