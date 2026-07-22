import { Controller, Get, Header, Param, Post, Body, StreamableFile } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceWithTotals } from './entities/invoice.entity';
import { InvoiceService } from './invoice.service';
import { PdfService } from './pdf/pdf.service';

@Controller('invoices')
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly pdfService: PdfService,
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
}
