import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UNIT_LABELS } from '../common/unit.util';
import { SearchSuppliersDto } from './dto/search-suppliers.dto';
import { SuggestComplementaryDto } from './dto/suggest-complementary.dto';
import { ComplementarySuggestion } from './entities/complementary-suggestion.entity';
import { SourcingSearchResult } from './entities/sourcing-search-result.entity';
import { SupplierCandidate } from './entities/supplier-candidate.entity';
import { GroqClientService } from './groq/groq-client.service';
import { parseComplementarySuggestions, parseSupplierCandidates } from './groq/groq-response.util';
import { GroqUnavailableError } from './groq/groq-unavailable.error';
import { hashQuery } from './query-hash.util';
import { SourcingRepository } from './sourcing.repository';
import {
  COMPLEMENTARY_SUGGESTION_MODEL,
  DEFAULT_DAILY_SEARCH_CAP,
  SUPPLIER_SEARCH_MODEL,
  VERIFY_BEFORE_ORDERING_NOTICE,
} from './sourcing.constants';
import { SourcingSearchKind } from '../../generated/prisma/enums';

// Orchestration only, same role as InvoiceService/ProductImportService:
// builds the prompt, delegates the call to GroqClientService, delegates
// parsing/validation to groq-response.util, and owns the two cross-cutting
// concerns both kinds of search share — the cache and the daily cap (see
// SourcingRepository). No Prisma access, no raw HTTP here.
@Injectable()
export class SourcingService {
  private readonly dailyCap: number;

  constructor(
    private readonly repository: SourcingRepository,
    private readonly groqClient: GroqClientService,
    config: ConfigService,
  ) {
    this.dailyCap = config.get<number>('SOURCING_DAILY_SEARCH_CAP', DEFAULT_DAILY_SEARCH_CAP);
  }

  async searchSuppliers(
    companyId: string,
    dto: SearchSuppliersDto,
  ): Promise<SourcingSearchResult<SupplierCandidate>> {
    const queryHash = hashQuery({
      productName: dto.productName,
      quantity: dto.quantity,
      unit: dto.unit,
      customerLocation: dto.customerLocation,
      jobDate: dto.jobDate,
    });
    return this.run(companyId, SourcingSearchKind.SUPPLIER_SEARCH, queryHash, () =>
      this.callSupplierSearch(dto),
    );
  }

  async suggestComplementary(
    companyId: string,
    dto: SuggestComplementaryDto,
  ): Promise<SourcingSearchResult<ComplementarySuggestion>> {
    const queryHash = hashQuery({ productName: dto.productName, unit: dto.unit });
    return this.run(companyId, SourcingSearchKind.COMPLEMENTARY_SUGGESTIONS, queryHash, () =>
      this.callComplementarySuggestions(dto),
    );
  }

  private async run<T>(
    companyId: string,
    kind: SourcingSearchKind,
    queryHash: string,
    execute: () => Promise<T[]>,
  ): Promise<SourcingSearchResult<T>> {
    const cached = await this.repository.findFresh<T>(companyId, kind, queryHash);
    if (cached) {
      const usedToday = await this.repository.countToday(companyId);
      return this.toResult(cached, true, usedToday);
    }

    if (!this.groqClient.isConfigured()) {
      throw new ServiceUnavailableException(
        "L'assistant fournisseurs n'est pas configuré pour le moment.",
      );
    }

    const usedToday = await this.repository.countToday(companyId);
    if (usedToday >= this.dailyCap) {
      throw new HttpException(
        'Quota quotidien de recherches atteint. Réessayez demain.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let results: T[];
    try {
      results = await execute();
    } catch (error) {
      if (error instanceof GroqUnavailableError) {
        throw new ServiceUnavailableException(
          'La recherche a échoué. Vous pouvez réessayer dans quelques instants.',
        );
      }
      throw error;
    }

    await this.repository.save(companyId, kind, queryHash, results);
    return this.toResult(results, false, usedToday + 1);
  }

  private toResult<T>(results: T[], cached: boolean, usedToday: number): SourcingSearchResult<T> {
    return {
      results,
      cached,
      searchesRemainingToday: Math.max(0, this.dailyCap - usedToday),
      disclaimer: VERIFY_BEFORE_ORDERING_NOTICE,
    };
  }

  private async callSupplierSearch(dto: SearchSuppliersDto): Promise<SupplierCandidate[]> {
    const unitLabel = UNIT_LABELS[dto.unit];
    const locationLine = dto.customerLocation
      ? `Zone géographique cible pour la livraison/l'achat : ${dto.customerLocation}.`
      : 'Aucune zone géographique précisée : privilégier des fournisseurs qui livrent en France.';
    const dateLine = dto.jobDate ? `Date du chantier visée : ${dto.jobDate}.` : '';

    const systemPrompt =
      'Tu es un assistant qui aide un artisan du bâtiment français à trouver des fournisseurs réels ' +
      'avec un prix, en utilisant la recherche web. Réponds UNIQUEMENT avec un objet JSON de la forme ' +
      '{"candidates": [{"name": string, "priceRaw": string|null, "sourceName": string|null, "sourceUrl": string|null}]}, ' +
      "avec au maximum 5 candidats triés du plus au moins pertinent. N'invente jamais un fournisseur ou un prix : " +
      "si tu n'es pas sûr d'une information, laisse le champ correspondant à null plutôt que de deviner. " +
      "priceRaw doit être copié tel qu'affiché sur la page trouvée, jamais recalculé.";
    const userPrompt =
      `Trouve des fournisseurs vendant : "${dto.productName}", pour une quantité d'environ ` +
      `${dto.quantity} ${unitLabel}. ${locationLine} ${dateLine}`.trim();

    const raw = await this.groqClient.complete({
      model: SUPPLIER_SEARCH_MODEL,
      systemPrompt,
      userPrompt,
    });
    return parseSupplierCandidates(raw);
  }

  private async callComplementarySuggestions(
    dto: SuggestComplementaryDto,
  ): Promise<ComplementarySuggestion[]> {
    const unitLine = dto.unit ? ` (unité de vente habituelle : ${UNIT_LABELS[dto.unit]})` : '';

    const systemPrompt =
      'Tu es un assistant qui aide un artisan du bâtiment français à ne rien oublier sur un chantier. ' +
      'Réponds UNIQUEMENT avec un objet JSON de la forme {"suggestions": [{"name": string, "reason": string, "category": string|null}]}, ' +
      'avec au maximum 5 suggestions de matériaux ou produits complémentaires nécessaires pour poser/installer ' +
      "le produit donné (colle, sous-couche, produit de finition, plinthes, etc.). N'utilise pas la recherche web, " +
      'réponds à partir de tes connaissances générales du métier.';
    const userPrompt = `Produit principal du chantier : "${dto.productName}"${unitLine}. Quels matériaux complémentaires sont généralement nécessaires ?`;

    const raw = await this.groqClient.complete({
      model: COMPLEMENTARY_SUGGESTION_MODEL,
      systemPrompt,
      userPrompt,
    });
    return parseComplementarySuggestions(raw);
  }
}
