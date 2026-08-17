import {
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Body,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ConvertToDevisDto } from './dto/convert-to-devis.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { GetNextNumberQueryDto } from './dto/get-next-number-query.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { InvoiceWithTotals } from './entities/invoice.entity';
import { InvoiceService } from './invoice.service';
import { SendInvoiceEmailDto } from './mail/dto/send-invoice-email.dto';
import { InvoiceMailTemplate } from './mail/invoice-mail-template.util';
import { InvoiceMailService } from './mail/invoice-mail.service';
import { PdfService } from './pdf/pdf.service';

@Controller('invoices')
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly pdfService: PdfService,
    private readonly invoiceMailService: InvoiceMailService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.create(user.companyId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<InvoiceWithTotals[]> {
    return this.invoiceService.findAll(user.companyId);
  }

  // Phase 27: the suggested "numéro" pre-filled on the apercu step (mode
  // rapide) and the manual canvas — see InvoiceService.getNextNumber. Must
  // be declared before `:id` below, or Nest would match "next-number" as an
  // invoice id instead.
  @Get('next-number')
  getNextNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetNextNumberQueryDto,
  ): Promise<{ number: string }> {
    return this.invoiceService.getNextNumber(user.companyId, query.documentType);
  }

  // Phase 14.3: turns a devis into a real, independently-numbered facture —
  // see InvoiceService.convertToFacture.
  @Post(':id/convert-to-facture')
  convertToFacture(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.convertToFacture(user.companyId, id);
  }

  // Retroactive devis creation: an untouched clone of the facture, numbered
  // by the artisan — see InvoiceService.convertToDevis.
  @Post(':id/convert-to-devis')
  convertToDevis(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConvertToDevisDto,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.convertToDevis(user.companyId, id, dto.number);
  }

  // Phase 16: the board's drag/button status changes (Non payées <-> Payées
  // <-> Annulées) and due-date-only edits — see InvoiceService.updateStatus.
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.updateStatus(user.companyId, id, dto);
  }

  @Get(':id')
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.findById(user.companyId, id);
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const data = await this.invoiceService.getPdfData(user.companyId, id);
    const buffer = await this.pdfService.generateInvoicePdf(data);
    const filePrefix = data.documentType === 'DEVIS' ? 'devis' : 'facture';
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${filePrefix}-${data.number}.pdf"`,
    });
  }

  // Phase 6: renders a PDF from a not-yet-saved draft so the artisan can
  // preview an invoice from any step of the creation flow — never persists
  // anything (see InvoiceService.previewPdf).
  @Post('preview')
  @Header('Content-Type', 'application/pdf')
  async previewPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ): Promise<StreamableFile> {
    const data = await this.invoiceService.previewPdf(user.companyId, dto);
    const buffer = await this.pdfService.generateInvoicePdf(data);
    return new StreamableFile(buffer, {
      disposition: 'inline; filename="apercu-facture.pdf"',
    });
  }

  // Phase 15: same not-yet-persisted draft as previewPdf above, but as JSON
  // — feeds the mandatory preview screen's HTML mirror (per-line technical
  // detail is toggleable there, see InvoiceMapper.toPreviewInvoiceWithTotals).
  @Post('preview-data')
  previewData(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.previewData(user.companyId, dto);
  }

  // Phase 12: the exact subject/text that will be used if the artisan sends
  // without touching them — lets the frontend show an editable draft
  // without duplicating the template copy client-side.
  @Get(':id/mail-template')
  getMailTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InvoiceMailTemplate> {
    return this.invoiceMailService.getDefaultTemplate(user.companyId, id);
  }

  // Phase 12: sends the already-generated PDF by email through the
  // artisan's own configured SMTP account (see InvoiceMailService) and
  // records sentAt/sentToEmail on success.
  @Post(':id/send-email')
  sendEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendInvoiceEmailDto,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceMailService.send(user.companyId, id, dto);
  }
}
