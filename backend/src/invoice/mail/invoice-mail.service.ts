import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MailSettingsService } from '../../mail-settings/mail-settings.service';
import { MailerService } from '../../mailer/mailer.service';
import { InvoiceWithTotals } from '../entities/invoice.entity';
import { InvoiceMapper } from '../invoice.mapper';
import { InvoiceRepository, InvoiceWithLines } from '../invoice.repository';
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
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly mapper: InvoiceMapper,
    private readonly pdfService: PdfService,
    private readonly mailSettingsService: MailSettingsService,
    private readonly mailerService: MailerService,
  ) {}

  // Lets the frontend show (and let the artisan edit) the exact copy that
  // would be used if they send without touching subject/message — no
  // separate copy of the template logic duplicated client-side.
  async getDefaultTemplate(invoiceId: string): Promise<InvoiceMailTemplate> {
    const { raw, invoice } = await this.loadInvoice(invoiceId);
    return buildDefaultInvoiceMailTemplate({
      companyName: raw.company.name,
      customerName: invoice.customerName,
      invoiceNumber: invoice.number,
      totalInclVatCents: invoice.totalInclVatCents,
    });
  }

  async send(invoiceId: string, dto: SendInvoiceEmailDto): Promise<InvoiceWithTotals> {
    const { raw, invoice } = await this.loadInvoice(invoiceId);

    const to = dto.to ?? invoice.customerEmail;
    if (!to) {
      throw new BadRequestException(
        "Aucune adresse email destinataire : renseignez-en une ou ajoutez l'email du client.",
      );
    }

    const smtp = await this.mailSettingsService.getDecryptedCredentials();
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
    });

    const pdfData = this.mapper.toPdfData(raw);
    const pdfBuffer = await this.pdfService.generateInvoicePdf(pdfData);

    await this.mailerService.send({
      smtp,
      from: { name: raw.company.name, address: smtp.user },
      to,
      subject: dto.subject ?? defaultTemplate.subject,
      text: dto.message ?? defaultTemplate.text,
      attachments: [{ filename: `facture-${invoice.number}.pdf`, content: pdfBuffer }],
    });

    const updated = await this.invoiceRepository.markSent(invoiceId, to);
    return this.mapper.toInvoiceWithTotals(updated);
  }

  private async loadInvoice(
    invoiceId: string,
  ): Promise<{ raw: InvoiceWithLines; invoice: InvoiceWithTotals }> {
    const raw = await this.invoiceRepository.findById(invoiceId);
    if (!raw) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }
    return { raw, invoice: this.mapper.toInvoiceWithTotals(raw) };
  }
}
