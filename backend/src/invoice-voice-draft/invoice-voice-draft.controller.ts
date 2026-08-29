import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { VoiceDraftRequestDto } from './dto/voice-draft-request.dto';
import { VoiceDraftResult } from './entities/voice-invoice-draft.entity';
import { InvoiceVoiceDraftService } from './invoice-voice-draft.service';

@Controller('invoices')
export class InvoiceVoiceDraftController {
  constructor(private readonly voiceDraftService: InvoiceVoiceDraftService) {}

  // Tighter than the global 100/min/IP default, same reasoning as
  // SourcingController's routes: each call triggers a real, billable LLM
  // request — the per-company daily cap
  // (InvoiceVoiceDraftService/VOICE_DRAFT_DAILY_CAP) is the primary cost
  // guard, this is just a burst limiter on top.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('voice-draft')
  resolveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VoiceDraftRequestDto,
  ): Promise<VoiceDraftResult> {
    return this.voiceDraftService.resolveDraft(user.companyId, dto);
  }
}
