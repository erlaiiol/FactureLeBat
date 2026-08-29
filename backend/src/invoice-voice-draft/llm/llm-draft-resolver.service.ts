import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyRepository } from '../../company/company.repository';
import { CustomerService } from '../../customer/customer.service';
import { ProductService } from '../../product/product.service';
import { ServiceCatalogService } from '../../service-catalog/service-catalog.service';
import { DraftResolver, DraftResolverOutcome } from '../draft-resolver.interface';
import { REJECTED_MESSAGE } from '../invoice-voice-draft.constants';
import { InvoiceVoiceDraftRepository } from '../invoice-voice-draft.repository';
import {
  DAILY_CAP_MESSAGE,
  DEFAULT_DAILY_CAP,
  FAILED_MESSAGE,
  MAX_TOKENS,
  MAX_TOOL_ITERATIONS,
  UNAVAILABLE_MESSAGE,
} from './llm-draft-resolver.constants';
import { LLM_CLIENT } from './llm-client.interface';
import type { LlmClient, LlmConversationMessage, LlmToolCall } from './llm-client.interface';
import { LlmUnavailableError } from './llm-unavailable.error';
import { parseResolveDraftInput } from './voice-draft-response.util';
import { buildVoiceDraftSystemPrompt, buildVoiceDraftTools } from './voice-draft-tools';

// One DraftResolver implementation (see draft-resolver.interface.ts) among
// possibly several — an LLM tool-use loop against whichever LlmClient is
// bound (Anthropic today, see llm-client.interface.ts). **Currently
// unbound / "dormant"**: invoice-voice-draft.module.ts binds
// DRAFT_RESOLVER to RuleBasedDraftResolverService instead, per the
// 2026-08-29 decision that an invoicing app shouldn't require an LLM
// subscription just to exist (see docs/1.4/1.4-1's revision note). This
// class stays fully wired as a provider and fully tested so re-enabling it
// later — as a fallback when the rule-based engine can't resolve enough,
// or as a Premium-tier upgrade — is a one-line rebinding, not a rebuild.
//
// Owns the one cost-bearing concern in this feature: the per-company daily
// cap (InvoiceVoiceDraftRepository/VoiceDraftRequest) is meaningful only
// here, since this is the only resolver that spends money per call — the
// rule-based resolver has no equivalent because it costs nothing to run.
@Injectable()
export class LlmDraftResolverService implements DraftResolver {
  private readonly logger = new Logger(LlmDraftResolverService.name);
  private readonly dailyCap: number;

  constructor(
    @Inject(LLM_CLIENT) private readonly llmClient: LlmClient,
    private readonly usageRepository: InvoiceVoiceDraftRepository,
    private readonly customerService: CustomerService,
    private readonly productService: ProductService,
    private readonly serviceCatalogService: ServiceCatalogService,
    private readonly companyRepository: CompanyRepository,
    config: ConfigService,
  ) {
    this.dailyCap = config.get<number>('VOICE_DRAFT_DAILY_CAP', DEFAULT_DAILY_CAP);
  }

  isAvailable(): boolean {
    return this.llmClient.isConfigured();
  }

  async resolve(companyId: string, transcript: string): Promise<DraftResolverOutcome> {
    if (!this.llmClient.isConfigured()) {
      throw new HttpException(UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
    }

    const usedToday = await this.usageRepository.countToday(companyId);
    if (usedToday >= this.dailyCap) {
      throw new HttpException(DAILY_CAP_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Recorded before the call resolves, not after: every attempt reaches
    // the LLM and is billed the same regardless of outcome (resolved,
    // rejected, or a mid-loop failure).
    await this.usageRepository.recordUsage(companyId);

    const company = await this.companyRepository.findById(companyId);
    const tools = buildVoiceDraftTools();
    const system = buildVoiceDraftSystemPrompt(company.defaultDepositPercentageBasisPoints);
    const messages: LlmConversationMessage[] = [{ role: 'user', text: transcript }];

    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const response = await this.llmClient.sendMessage({
          system,
          messages,
          tools,
          maxTokens: MAX_TOKENS,
        });

        const terminal = response.toolCalls.find(
          (call) => call.name === 'resolve_draft' || call.name === 'reject',
        );
        if (terminal) {
          if (terminal.name === 'reject') {
            return { status: 'rejected', message: REJECTED_MESSAGE };
          }
          const parsed = parseResolveDraftInput(terminal.input);
          if (!parsed) {
            this.logger.warn('LLM draft resolver: resolve_draft called with malformed input');
            return { status: 'rejected', message: FAILED_MESSAGE };
          }
          return { status: 'resolved', draft: parsed };
        }

        if (response.toolCalls.length === 0) {
          // The model answered with plain text instead of a tool call —
          // treated the same as an explicit reject: never a draft built
          // from unstructured text.
          return { status: 'rejected', message: REJECTED_MESSAGE };
        }

        messages.push({ role: 'assistant', toolCalls: response.toolCalls });
        const results = await Promise.all(
          response.toolCalls.map((call) => this.executeSearchTool(companyId, call)),
        );
        messages.push({ role: 'tool_results', results });
      }
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        this.logger.warn(`LLM draft resolver failed: ${error.message}`);
        throw new HttpException(FAILED_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw error;
    }

    this.logger.warn(`LLM draft resolver exceeded ${MAX_TOOL_ITERATIONS} tool iterations`);
    return { status: 'rejected', message: FAILED_MESSAGE };
  }

  private async executeSearchTool(
    companyId: string,
    call: LlmToolCall,
  ): Promise<{ toolCallId: string; content: string }> {
    const query = typeof call.input.query === 'string' ? call.input.query : '';
    let results: unknown[];
    switch (call.name) {
      case 'search_customers': {
        const customers = await this.customerService.searchFuzzy(companyId, query);
        results = customers.map(({ row, score }) => ({
          id: row.id,
          name: row.name,
          companyName: row.companyName,
          address: row.address,
          score,
        }));
        break;
      }
      case 'search_products': {
        const products = await this.productService.searchFuzzy(companyId, query);
        results = products.map(({ row, score }) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          unit: row.unit,
          priceCents: row.priceCents,
          score,
        }));
        break;
      }
      case 'search_services': {
        const services = await this.serviceCatalogService.searchFuzzy(companyId, query);
        results = services.map(({ row, score }) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          pricingMode: row.pricingMode,
          priceCents: row.priceCents,
          score,
        }));
        break;
      }
      default:
        // An unknown tool name from the model — degrade to an empty result
        // rather than throw, same "never crash on unexpected model output"
        // posture as parseResolveDraftInput.
        results = [];
    }
    return { toolCallId: call.id, content: JSON.stringify(results) };
  }
}
