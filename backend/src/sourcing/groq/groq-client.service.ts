import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetch as undiciFetch } from 'undici';
import { GroqUnavailableError } from './groq-unavailable.error';

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
// The compound (web-search) model can take noticeably longer than a plain
// completion while it browses — generous but still bounded so a slow/stuck
// upstream call can never hang a request indefinitely.
const REQUEST_TIMEOUT_MS = 25_000;

interface GroqChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

// Isolated from SourcingService on purpose, same "isolate the risky
// boundary" split as SafeFetcherService/ProductExtractionService: this class
// only ever knows about the Groq HTTP call itself (auth, timeout, transport
// errors) and never touches prompt content, caching, or the daily cap.
// Talks to Groq's OpenAI-compatible endpoint directly via undici (already a
// dependency for SafeFetcherService) rather than pulling in a dedicated SDK.
@Injectable()
export class GroqClientService {
  private readonly logger = new Logger(GroqClientService.name);
  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GROQ_API_KEY');
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  // Returns the model's raw text content — SourcingService/groq-response.util
  // are responsible for treating it as untrusted external input from there.
  async complete(params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
  }): Promise<string> {
    if (!this.apiKey) {
      throw new GroqUnavailableError('GROQ_API_KEY is not configured');
    }

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model,
          messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });
    } catch (error) {
      this.logger.warn(`Groq request failed: ${String(error)}`);
      throw new GroqUnavailableError('Unable to reach Groq');
    }

    if (!response.ok) {
      this.logger.warn(`Groq request returned status ${response.status}`);
      throw new GroqUnavailableError(`Unexpected status ${response.status}`);
    }

    let body: GroqChatCompletionResponse;
    try {
      body = (await response.json()) as GroqChatCompletionResponse;
    } catch {
      throw new GroqUnavailableError('Malformed Groq response');
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new GroqUnavailableError('Empty Groq response');
    }
    return content;
  }
}
