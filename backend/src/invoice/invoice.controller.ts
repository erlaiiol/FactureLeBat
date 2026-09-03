import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Body,
  Query,
  Res,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { PlanGateService } from '../billing/plan-gate.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import {
  ALLOWED_RASTER_IMAGE_MIME_TYPES,
  matchesDeclaredImageType,
} from '../common/raster-image-upload.util';
import { ConvertToDevisDto } from './dto/convert-to-devis.dto';
import { ConvertToFactureDto } from './dto/convert-to-facture.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { GetNextNumberQueryDto } from './dto/get-next-number-query.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { UpdateManuallySignedDto } from './dto/update-manually-signed.dto';
import { UploadInvoiceSignatureDto } from './dto/upload-invoice-signature.dto';
import { InvoiceWithTotals } from './entities/invoice.entity';
import { EInvoiceTransmissionService } from './e-invoicing/e-invoice-transmission.service';
import { mapSuperPdpError } from './e-invoicing/map-super-pdp-error.util';
import { FacturXService } from './facturx/facturx.service';
import { InvoiceService } from './invoice.service';
import { SendInvoiceEmailDto } from './mail/dto/send-invoice-email.dto';
import { InvoiceMailTemplate } from './mail/invoice-mail-template.util';
import { InvoiceMailService } from './mail/invoice-mail.service';
import { PdfService } from './pdf/pdf.service';

// A generous bound for a signature image, not a real limit — the "Importer
// une photo" tab already compresses/resizes client-side before upload (see
// SignatureModalComponent), and a drawn signature is a small canvas PNG; this
// just keeps a single attachment (base64-embedded into every render of this
// document, see InvoiceMapper.signatureField) from bloating the PDF.
const MAX_SIGNATURE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB

@Controller('invoices')
export class InvoiceController {
  // Same FRONTEND_URL convention as AuthService's own verification/reset
  // links — see createShareLink below.
  private readonly frontendUrl: string;

  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly pdfService: PdfService,
    private readonly invoiceMailService: InvoiceMailService,
    private readonly facturXService: FacturXService,
    private readonly eInvoiceTransmissionService: EInvoiceTransmissionService,
    private readonly planGate: PlanGateService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:4200');
  }

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
    @Body() dto: ConvertToFactureDto,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.convertToFacture(user.companyId, id, dto);
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

  // Phase 1.3-7: "Partager" — lazily issues (or returns the existing) share
  // token, then builds the full public URL from FRONTEND_URL, same
  // convention as AuthService's own email-verification/reset links. The
  // frontend embeds this in the native share sheet's text and the mail
  // template (see InvoiceMailService), never in a query param on the app's
  // own JWT-gated routes.
  @Post(':id/share-link')
  async createShareLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ url: string }> {
    const token = await this.invoiceService.getOrCreateShareLink(user.companyId, id);
    return { url: `${this.frontendUrl}/partage/${token}` };
  }

  // Invalidates the current link immediately — the only way one ever stops
  // working, see schema.prisma's comment on Invoice.shareToken.
  @Delete(':id/share-link')
  async revokeShareLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.invoiceService.revokeShareLink(user.companyId, id);
  }

  // The @Public() counterpart of downloadPdf above, reachable by anyone
  // holding the link — no @CurrentUser(), keyed on the token instead of a
  // session. Throttled tighter than this app's 100/60s default: the token
  // is the only thing standing between a stranger and this document, so
  // brute-forcing attempts should be slowed hard, not just logged.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('share/:token/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadSharedPdf(@Param('token') token: string): Promise<StreamableFile> {
    const data = await this.invoiceService.getPdfDataByShareToken(token);
    const buffer = await this.pdfService.generateInvoicePdf(data);
    const filePrefix = data.documentType === 'DEVIS' ? 'devis' : 'facture';
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${filePrefix}-${data.number}.pdf"`,
    });
  }

  // Phase 1.2-3 (2026 e-invoicing reform): the same rendered PDF, but as a
  // Factur-X (BASIC profile) PDF/A-3 hybrid with the CII XML embedded.
  // FACTURE-only — a DEVIS is a quote, not a fiscal invoice, and neither the
  // reform nor Factur-X's own document-type semantics apply to one (see
  // facturx-invoice.mapper.ts's header comment).
  @Get(':id/facturx')
  @Header('Content-Type', 'application/pdf')
  async downloadFacturX(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const data = await this.invoiceService.getPdfData(user.companyId, id);
    if (data.documentType !== 'FACTURE') {
      throw new BadRequestException(
        "La facture électronique n'est disponible que pour une FACTURE, pas un DEVIS.",
      );
    }
    // 1.2/facturx-monthly-quota revision: checked after the FACTURE/DEVIS
    // guard above (a DEVIS should always 400, quota or not), before any
    // rendering work — see PlanGateService.assertCanUseFacturX.
    await this.planGate.assertCanUseFacturX(user.companyId, id);
    const pdfBuffer = await this.pdfService.generateInvoicePdf(data);
    const hybridBuffer = await this.facturXService.generateHybridPdf(pdfBuffer, data);
    await this.planGate.recordFacturXUsed(user.companyId, id);
    return new StreamableFile(hybridBuffer, {
      disposition: `attachment; filename="facture-${data.number}-factur-x.pdf"`,
    });
  }

  // Phase 1.2-4 (2026 e-invoicing reform): generates the Factur-X hybrid
  // (same pipeline as downloadFacturX above) and submits it through the
  // connected PA — FACTURE-only, same gate (enforced inside
  // EInvoiceTransmissionService.transmit). 503 if SUPER PDP isn't
  // configured on this deployment or this company hasn't connected it yet.
  @Post(':id/transmit')
  async transmit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InvoiceWithTotals> {
    try {
      return await this.eInvoiceTransmissionService.transmit(user.companyId, id);
    } catch (error) {
      throw mapSuperPdpError(error);
    }
  }

  // Re-fetches this invoice's latest status from the connected PA — an
  // on-demand refresh action, not a background poll (see
  // EInvoiceTransmissionService.refreshStatus's own comment).
  @Post(':id/transmission-status')
  async refreshTransmissionStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InvoiceWithTotals> {
    try {
      return await this.eInvoiceTransmissionService.refreshStatus(user.companyId, id);
    } catch (error) {
      throw mapSuperPdpError(error);
    }
  }

  // Phase 1.3-3 (2026 e-invoicing reform, workflow automation): cancels a
  // still-pending automatic transmission (Company.autoTransmitViaPa) from
  // the invoice board — never errors for a "too late"/already-cancelled
  // invoice, only for one that doesn't exist for this company (see
  // InvoiceService.cancelAutoTransmit's own comment).
  @Post(':id/cancel-auto-transmit')
  cancelAutoTransmit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.cancelAutoTransmit(user.companyId, id);
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

  // Phase 1.1-1: "Signer" — attaches a drawn or photographed signature,
  // replacing any existing one for this document. Same PNG/JPEG allow-list +
  // magic-byte validation as CompanyController.uploadLogo, factored into
  // common/raster-image-upload.util.ts.
  @Post(':id/signature')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIGNATURE_SIZE_BYTES },
    }),
  )
  async uploadSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UploadInvoiceSignatureDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<InvoiceWithTotals> {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }
    if (!ALLOWED_RASTER_IMAGE_MIME_TYPES[file.mimetype]) {
      throw new UnsupportedMediaTypeException('La signature doit être une image PNG ou JPEG.');
    }
    if (!matchesDeclaredImageType(file.buffer, file.mimetype)) {
      throw new UnsupportedMediaTypeException("Ce fichier n'est pas une image PNG ou JPEG valide.");
    }
    return this.invoiceService.uploadSignature(user.companyId, id, {
      image: file.buffer,
      mimeType: file.mimetype,
      method: dto.method,
    });
  }

  @Delete(':id/signature')
  deleteSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.deleteSignature(user.companyId, id);
  }

  // "Voir la signature" — streams the raw image bytes, mirrors
  // CompanyController.serveLogo.
  @Get(':id/signature')
  async serveSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const signature = await this.invoiceService.getSignatureImage(user.companyId, id);
    if (!signature) {
      throw new NotFoundException('Aucune signature attachée à ce document.');
    }
    res.setHeader('Content-Type', signature.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(signature.image);
  }

  // The freehand fallback checkbox — see schema.prisma's comment on
  // Invoice.manuallySigned.
  @Patch(':id/manually-signed')
  setManuallySigned(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateManuallySignedDto,
  ): Promise<InvoiceWithTotals> {
    return this.invoiceService.setManuallySigned(user.companyId, id, dto.manuallySigned);
  }
}
