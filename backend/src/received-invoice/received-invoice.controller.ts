import { Controller, Get, Header, Param, Post, StreamableFile } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { mapSuperPdpError } from '../invoice/e-invoicing/map-super-pdp-error.util';
import { ReceivedInvoiceModel as ReceivedInvoice } from '../../generated/prisma/models';
import { ReceivedInvoiceService } from './received-invoice.service';

// Phase 1.2-5 (2026 e-invoicing reform): read-only supplier-invoice inbox —
// no reply/dispute/payment-initiation actions, see docs/roadmap.md Phase
// 1.2-5's own non-goals.
@Controller('received-invoices')
export class ReceivedInvoiceController {
  constructor(private readonly receivedInvoiceService: ReceivedInvoiceService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<ReceivedInvoice[]> {
    return this.receivedInvoiceService.list(user.companyId);
  }

  // Manual refresh action, not automatic on every GET — same "on-demand,
  // not polled" posture as Phase 1.2-4's transmission-status endpoint. 503
  // if SUPER PDP isn't configured/connected (see mapSuperPdpError).
  @Post('sync')
  async sync(@CurrentUser() user: AuthenticatedUser): Promise<ReceivedInvoice[]> {
    try {
      return await this.receivedInvoiceService.sync(user.companyId);
    } catch (error) {
      throw mapSuperPdpError(error);
    }
  }

  @Get(':id/download')
  @Header('Content-Type', 'application/pdf')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    try {
      const buffer = await this.receivedInvoiceService.downloadDocument(user.companyId, id);
      return new StreamableFile(buffer, { disposition: 'inline; filename="facture-recue.pdf"' });
    } catch (error) {
      throw mapSuperPdpError(error);
    }
  }
}
