import { Controller, Get, Header, Param, Post, Body, StreamableFile } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
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
  create(@Body() dto: CreateInvoiceDto): Promise<InvoiceWithTotals> {
    return this.invoiceService.create(dto);
  }

  @Get()
  findAll(): Promise<InvoiceWithTotals[]> {
    return this.invoiceService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<InvoiceWithTotals> {
    return this.invoiceService.findById(id);
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(@Param('id') id: string): Promise<StreamableFile> {
    const data = await this.invoiceService.getPdfData(id);
    const buffer = await this.pdfService.generateInvoicePdf(data);
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="facture-${data.number}.pdf"`,
    });
  }

  // Phase 6: renders a PDF from a not-yet-saved draft so the artisan can
  // preview an invoice from any step of the creation flow — never persists
  // anything (see InvoiceService.previewPdf).
  @Post('preview')
  @Header('Content-Type', 'application/pdf')
  async previewPdf(@Body() dto: CreateInvoiceDto): Promise<StreamableFile> {
    const data = await this.invoiceService.previewPdf(dto);
    const buffer = await this.pdfService.generateInvoicePdf(data);
    return new StreamableFile(buffer, {
      disposition: 'inline; filename="apercu-facture.pdf"',
    });
  }

  // Phase 12: the exact subject/text that will be used if the artisan sends
  // without touching them — lets the frontend show an editable draft
  // without duplicating the template copy client-side.
  @Get(':id/mail-template')
  getMailTemplate(@Param('id') id: string): Promise<InvoiceMailTemplate> {
    return this.invoiceMailService.getDefaultTemplate(id);
  }

  // Phase 12: sends the already-generated PDF by email through the
  // artisan's own configured SMTP account (see InvoiceMailService) and
  // records sentAt/sentToEmail on success.
  @Post(':id/send-email')
  sendEmail(@Param('id') id: string, @Body() dto: SendInvoiceEmailDto): Promise<InvoiceWithTotals> {
    return this.invoiceMailService.send(id, dto);
  }
}
