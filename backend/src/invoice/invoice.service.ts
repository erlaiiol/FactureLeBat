import { Injectable, NotFoundException } from '@nestjs/common';
import { CompanyService } from '../company/company.service';
import { isVatApplicable } from '../company/legal-status.util';
import { CustomerService } from '../customer/customer.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceWithTotals } from './entities/invoice.entity';
import { InvoiceMapper } from './invoice.mapper';
import { InvoiceRepository, InvoiceWithLines } from './invoice.repository';
import { InvoicePdfData } from './pdf/invoice-pdf-data.interface';

// Orchestration only: loads the company profile, delegates numbering +
// persistence to the repository, delegates response shaping to the mapper.
// No calculation logic and no Prisma calls live here directly.
@Injectable()
export class InvoiceService {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly companyService: CompanyService,
    private readonly customerService: CustomerService,
    private readonly mapper: InvoiceMapper,
  ) {}

  async create(dto: CreateInvoiceDto): Promise<InvoiceWithTotals> {
    const company = await this.companyService.getProfile();

    // Confirms the id exists (a clean 404 instead of a raw DB foreign-key
    // error on a stale/typo'd id) without ever overwriting the customer
    // fields below — those stay exactly what the artisan typed/edited on
    // the invoice, even if they diverged from the saved customer record.
    // Unlike CustomerService.update()/ProductService.update(), this
    // check-then-act pair is NOT a TOCTOU race: there is no DELETE
    // /customers endpoint, so nothing can remove the row between this
    // check and the insert below. Revisit this comment if that changes.
    if (dto.customerId) {
      await this.customerService.findById(dto.customerId);
    }

    const invoice = await this.invoiceRepository.createWithSequentialNumber({
      companyId: company.id,
      customerName: dto.customerName,
      customerAddress: dto.customerAddress,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      customerId: dto.customerId,
      vatApplicable: isVatApplicable(company.legalStatus),
      vatRateBasisPoints: company.vatRateBasisPoints,
      lines: dto.lines.map((line) => ({
        description: line.description,
        unit: line.unit,
        mode: line.mode,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        wasteSurcharge: line.wasteSurcharge,
      })),
    });

    return this.mapper.toInvoiceWithTotals(invoice);
  }

  async findAll(): Promise<InvoiceWithTotals[]> {
    const invoices = await this.invoiceRepository.findAll();
    return invoices.map((invoice) => this.mapper.toInvoiceWithTotals(invoice));
  }

  async findById(id: string): Promise<InvoiceWithTotals> {
    const invoice = await this.findRawById(id);
    return this.mapper.toInvoiceWithTotals(invoice);
  }

  async getPdfData(id: string): Promise<InvoicePdfData> {
    const invoice = await this.findRawById(id);
    return this.mapper.toPdfData(invoice);
  }

  private async findRawById(id: string): Promise<InvoiceWithLines> {
    const invoice = await this.invoiceRepository.findById(id);
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }
}
