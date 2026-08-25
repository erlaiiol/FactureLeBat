import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DocumentType, InvoiceStatus } from '../../../generated/prisma/enums';
import { CompanyService } from '../../company/company.service';
import { MailSettingsService } from '../../mail-settings/mail-settings.service';
import { MailerService, SendMailAttachment } from '../../mailer/mailer.service';
import { InvoiceWithTotals } from '../entities/invoice.entity';
import { FacturXService } from '../facturx/facturx.service';
import { InvoiceMapper } from '../invoice.mapper';
import { InvoiceRepository, InvoiceWithLines } from '../invoice.repository';
import { InvoicePdfData } from '../pdf/invoice-pdf-data.interface';
import { PdfService } from '../pdf/pdf.service';
import { SendInvoiceEmailDto } from './dto/send-invoice-email.dto';
import { buildDefaultInvoiceMailTemplate, InvoiceMailTemplate } from './invoice-mail-template.util';

// Orchestration only, same role as InvoiceService: resolves recipient/
// subject/text (dto override, falling back to the invoice's own data and
// the default template), delegates the PDF render to PdfService and the
// actual delivery to MailerService, then records the send. No Prisma calls,
// no SMTP transport code, no template copy live directly here.
@Injectable()
export class InvoiceMailService {
  private readonly logger = new Logger(InvoiceMailService.name);

  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly mapper: InvoiceMapper,
    private readonly pdfService: PdfService,
    private readonly companyService: CompanyService,
    private readonly mailSettingsService: MailSettingsService,
    private readonly mailerService: MailerService,
    private readonly facturXService: FacturXService,
  ) {}

  // Lets the frontend show (and let the artisan edit) the exact copy that
  // would be used if they send without touching subject/message — no
  // separate copy of the template logic duplicated client-side.
  async getDefaultTemplate(companyId: string, invoiceId: string): Promise<InvoiceMailTemplate> {
    const { raw, invoice } = await this.loadInvoice(companyId, invoiceId);
    return buildDefaultInvoiceMailTemplate({
      companyName: raw.company.name,
      customerName: invoice.customerName,
      invoiceNumber: invoice.number,
      totalInclVatCents: invoice.totalInclVatCents,
      documentType: invoice.documentType,
      customMessage: raw.company.invoiceMailCustomMessage,
    });
  }

  async send(
    companyId: string,
    invoiceId: string,
    dto: SendInvoiceEmailDto,
  ): Promise<InvoiceWithTotals> {
    const { raw, invoice } = await this.loadInvoice(companyId, invoiceId);

    const to = dto.to ?? invoice.customerEmail;
    if (!to) {
      throw new BadRequestException(
        "Aucune adresse email destinataire : renseignez-en une ou ajoutez l'email du client.",
      );
    }

    const smtp = await this.mailSettingsService.getDecryptedCredentials(companyId);
    if (!smtp) {
      throw new ServiceUnavailableException(
        "Configurez votre serveur d'envoi d'email dans les réglages avant d'envoyer une facture.",
      );
    }

    const defaultTemplate = buildDefaultInvoiceMailTemplate({
      companyName: raw.company.name,
      customerName: invoice.customerName,
      invoiceNumber: invoice.number,
      totalInclVatCents: invoice.totalInclVatCents,
      documentType: invoice.documentType,
      customMessage: raw.company.invoiceMailCustomMessage,
    });

    const [logo, signature] = await Promise.all([
      this.companyService.getLogo(companyId),
      this.invoiceRepository.findSignatureImage(companyId, invoiceId),
    ]);
    const pdfData = this.mapper.toPdfData(raw, logo, signature);
    const pdfBuffer = await this.pdfService.generateInvoicePdf(pdfData);
    const filePrefix = invoice.documentType === 'DEVIS' ? 'devis' : 'facture';

    const attachment = await this.buildAttachment(
      raw.company.autoAttachFacturX,
      invoice.documentType,
      pdfBuffer,
      pdfData,
      filePrefix,
      invoice.number,
    );

    await this.mailerService.send({
      smtp,
      from: { name: raw.company.name, address: smtp.user },
      to,
      subject: dto.subject ?? defaultTemplate.subject,
      text: dto.message ?? defaultTemplate.text,
      attachments: [attachment],
    });

    // Phase 16: a send while the invoice is still unpaid counts as a
    // "renvoyer un mail" reminder for the board — bumps lastReminderAt in
    // the same write, reusing this exact pipeline as-is (no new endpoint).
    const updated = await this.invoiceRepository.markSent(companyId, invoiceId, to, {
      bumpReminder: raw.status === InvoiceStatus.NON_PAYEE,
    });
    return this.mapper.toInvoiceWithTotals(updated);
  }

  // Phase 1.3-2 (2026 e-invoicing reform, workflow automation): attaches the
  // Factur-X hybrid instead of the plain PDF when the company opted in
  // (Company.autoAttachFacturX) and this is a FACTURE — same rule as every
  // other e-invoicing action, a DEVIS never gets a Factur-X attachment
  // regardless of the toggle. A genuine Factur-X generation failure (a real
  // Schematron/XSD error — this never talks to SUPER PDP, so a PA outage
  // can't be the cause) falls back to the plain PDF and logs a warning
  // rather than blocking the send: getting *something* to the client on
  // time matters more here than always sending the structured version.
  private async buildAttachment(
    autoAttachFacturX: boolean,
    documentType: DocumentType,
    pdfBuffer: Buffer,
    pdfData: InvoicePdfData,
    filePrefix: string,
    invoiceNumber: string,
  ): Promise<SendMailAttachment> {
    if (autoAttachFacturX && documentType === 'FACTURE') {
      try {
        const hybridBuffer = await this.facturXService.generateHybridPdf(pdfBuffer, pdfData);
        return { filename: `${filePrefix}-${invoiceNumber}-factur-x.pdf`, content: hybridBuffer };
      } catch (error) {
        this.logger.warn(
          `Factur-X auto-attach failed for invoice ${invoiceNumber}, falling back to plain PDF: ${String(error)}`,
        );
      }
    }
    return { filename: `${filePrefix}-${invoiceNumber}.pdf`, content: pdfBuffer };
  }

  private async loadInvoice(
    companyId: string,
    invoiceId: string,
  ): Promise<{ raw: InvoiceWithLines; invoice: InvoiceWithTotals }> {
    const raw = await this.invoiceRepository.findById(companyId, invoiceId);
    if (!raw) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }
    return { raw, invoice: this.mapper.toInvoiceWithTotals(raw) };
  }
}
