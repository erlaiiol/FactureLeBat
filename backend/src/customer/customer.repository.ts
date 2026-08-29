import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CustomerModel as Customer } from '../../generated/prisma/models';
import { FuzzyMatch } from '../common/fuzzy-match';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Capped rather than paginated for now — same trade-off as
  // InvoiceRepository.findAll(): bounds query cost and response size as
  // customers accumulate instead of ever fetching an unbounded table.
  // Revisit with real pagination once an artisan's customer list is large
  // enough that "first 500 alphabetically" stops being everything.
  private static readonly MAX_LISTED_CUSTOMERS = 500;

  // Phase 1.4-1: how many fuzzy candidates the voice-draft endpoint ever
  // needs to consider for one reference — small on purpose, this feeds an
  // LLM prompt, not a picker UI.
  private static readonly FUZZY_SEARCH_LIMIT = 5;
  // Below this pg_trgm similarity score a "match" is closer to noise than
  // a real candidate — tuned generously low (French names are short, so
  // trigram scores run low even for a genuine match) rather than tight,
  // since a false positive here just becomes one more candidate for the
  // LLM to weigh, while a false negative silently hides a real customer.
  private static readonly FUZZY_SIMILARITY_THRESHOLD = 0.2;

  // Phase 14.5: matches name, companyName, address, and description — not
  // name alone (see docs/roadmap.md Phase 14.5). Same plain substring
  // pattern as ProductRepository's search, no fuzzy matching.
  findAll(companyId: string, search?: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({
      where: {
        companyId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: CustomerRepository.MAX_LISTED_CUSTOMERS,
    });
  }

  // Phase 14.5: "date du dernier devis" / "dernière facture" per customer —
  // derived from Invoice at read time, never persisted (same rule as
  // invoice totals). One grouped query for every customer already loaded by
  // findAll above, rather than N+1 per-customer queries.
  async findLastDocumentDatesByCustomer(
    companyId: string,
    customerIds: string[],
  ): Promise<Map<string, { lastDevisDate: Date | null; lastFactureDate: Date | null }>> {
    const result = new Map<string, { lastDevisDate: Date | null; lastFactureDate: Date | null }>();
    if (customerIds.length === 0) {
      return result;
    }

    const groups = await this.prisma.invoice.groupBy({
      by: ['customerId', 'documentType'],
      where: { companyId, customerId: { in: customerIds } },
      _max: { date: true },
    });

    for (const group of groups) {
      if (!group.customerId) {
        continue;
      }
      const entry = result.get(group.customerId) ?? { lastDevisDate: null, lastFactureDate: null };
      if (group.documentType === 'DEVIS') {
        entry.lastDevisDate = group._max.date;
      } else {
        entry.lastFactureDate = group._max.date;
      }
      result.set(group.customerId, entry);
    }

    return result;
  }

  // Phase 1.4-1: typo/voice-transcription-tolerant search, additive to
  // findAll's plain substring match above — used only by the voice-draft
  // endpoint (see docs/1.4/1.4-1's scope decision: this app's other search
  // surfaces stay plain-substring on purpose, this one specifically needs
  // the tolerance voice transcription requires). Raw SQL because Prisma's
  // query builder has no pg_trgm similarity() operator; both interpolated
  // values are still safely parameterized by $queryRaw's tagged template,
  // not string-concatenated.
  async searchFuzzy(companyId: string, query: string): Promise<FuzzyMatch<Customer>[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<Array<Customer & { score: number }>>`
      SELECT *, similarity(lower(name), lower(${trimmed})) AS score
      FROM "Customer"
      WHERE "companyId" = ${companyId}
        AND similarity(lower(name), lower(${trimmed})) > ${CustomerRepository.FUZZY_SIMILARITY_THRESHOLD}
      ORDER BY score DESC
      LIMIT ${CustomerRepository.FUZZY_SEARCH_LIMIT}
    `;
    return rows.map(({ score, ...row }) => ({ row: row, score: Number(score) }));
  }

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the row exists for someone else.
  findById(companyId: string, id: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({ where: { id, companyId } });
  }

  create(companyId: string, data: CreateCustomerDto): Promise<Customer> {
    return this.prisma.customer.create({ data: { ...data, companyId } });
  }

  // updateMany (not update) since the unique `where` Prisma's typed
  // .update() accepts can't also carry companyId as an extra filter — the
  // affected count is how a genuine 404 is told apart from a cross-tenant
  // id (see NoRowsAffectedError).
  //
  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place: Prisma omits
  // `undefined` keys from an update entirely, which would otherwise turn
  // this into a partial patch despite the "full replace" PATCH contract.
  async update(companyId: string, id: string, data: UpdateCustomerDto): Promise<Customer> {
    const { count } = await this.prisma.customer.updateMany({
      where: { id, companyId },
      data: {
        name: data.name,
        companyName: data.companyName ?? null,
        address: data.address ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        siret: data.siret ?? null,
        isProfessional: data.isProfessional ?? false,
        description: data.description ?? null,
      },
    });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
    return this.prisma.customer.findFirstOrThrow({ where: { id, companyId } });
  }
}
