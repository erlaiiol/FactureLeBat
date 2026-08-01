import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanGateService } from '../billing/plan-gate.service';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CustomerRepository } from './customer.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerProfile, CustomerSearchResult } from './entities/customer.entity';

// Phase 14.5: sort options beyond today's alphabetical (the repository's own
// default orderBy). Not persisted anywhere — purely a read-time ordering
// choice.
export type CustomerSortBy = 'alphabetique' | 'derniereFacture' | 'dernierDevis' | 'dateCreation';

// How much context to show around a description match, in characters each
// side — enough to read the surrounding sentence without dumping the whole
// field.
const SNIPPET_RADIUS = 40;

function buildMatchSnippet(description: string, search: string): string {
  const index = description.toLowerCase().indexOf(search.toLowerCase());
  if (index === -1) {
    return description;
  }
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(description.length, index + search.length + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${description.slice(start, end)}${end < description.length ? '…' : ''}`;
}

function compareDatesMostRecentFirst(a: Date | null, b: Date | null): number {
  if (a === null) {
    return b === null ? 0 : 1;
  }
  if (b === null) {
    return -1;
  }
  return b.getTime() - a.getTime();
}

function sortCustomers(
  customers: CustomerSearchResult[],
  sortBy: CustomerSortBy | undefined,
): CustomerSearchResult[] {
  switch (sortBy) {
    case 'derniereFacture':
      return [...customers].sort((a, b) =>
        compareDatesMostRecentFirst(a.lastFactureDate, b.lastFactureDate),
      );
    case 'dernierDevis':
      return [...customers].sort((a, b) =>
        compareDatesMostRecentFirst(a.lastDevisDate, b.lastDevisDate),
      );
    case 'dateCreation':
      return [...customers].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case 'alphabetique':
    default:
      // Already alphabetical — CustomerRepository.findAll orders by name.
      return customers;
  }
}

@Injectable()
export class CustomerService {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly planGateService: PlanGateService,
  ) {}

  // Phase 14.5: search matches name/companyName/address/description (see
  // CustomerRepository.findAll); each result carries its last devis/facture
  // date (derived from Invoice, never persisted) and, when the match came
  // from free text rather than a fixed field, the matching snippet — so the
  // artisan sees *why* a result matched, not just that it did.
  async findAll(
    companyId: string,
    search?: string,
    sortBy?: CustomerSortBy,
  ): Promise<CustomerSearchResult[]> {
    const customers = await this.customerRepository.findAll(companyId, search);
    const datesByCustomer = await this.customerRepository.findLastDocumentDatesByCustomer(
      companyId,
      customers.map((customer) => customer.id),
    );

    const normalizedSearch = search?.toLowerCase();
    const results: CustomerSearchResult[] = customers.map((customer) => {
      const dates = datesByCustomer.get(customer.id) ?? {
        lastDevisDate: null,
        lastFactureDate: null,
      };

      const matchedAFixedField =
        !!normalizedSearch &&
        [customer.name, customer.companyName, customer.address].some((field) =>
          field?.toLowerCase().includes(normalizedSearch),
        );
      const matchSnippet =
        normalizedSearch &&
        !matchedAFixedField &&
        customer.description?.toLowerCase().includes(normalizedSearch)
          ? buildMatchSnippet(customer.description, search!)
          : null;

      return { ...customer, ...dates, matchSnippet };
    });

    return sortCustomers(results, sortBy);
  }

  async findById(companyId: string, id: string): Promise<CustomerProfile> {
    const customer = await this.customerRepository.findById(companyId, id);
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  // Phase 30: catalog-size cap, one of the 3 tier axes — see
  // docs/roadmap.md Phase 30. Checked before the write, never on list/
  // search/edit of already-saved customers, same "never earlier than the
  // action actually being refused" posture as PlanGateService's other
  // checks.
  async create(companyId: string, dto: CreateCustomerDto): Promise<CustomerProfile> {
    await this.planGateService.assertCatalogCapacity(companyId, 'customer');
    return this.customerRepository.create(companyId, dto);
  }

  // Reports "not found" from the write itself rather than a separate
  // findById pre-check: a check-then-act pair leaves a window where a
  // concurrent request could remove the row between the two calls, turning
  // a legitimate 404 into an unhandled 500 from Prisma's own not-found
  // error. Catching it here closes that race and saves a round trip.
  async update(companyId: string, id: string, dto: UpdateCustomerDto): Promise<CustomerProfile> {
    try {
      return await this.customerRepository.update(companyId, id, dto);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`Customer ${id} not found`);
      }
      throw error;
    }
  }
}
