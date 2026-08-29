import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetch as undiciFetch } from 'undici';
import { LlmUnavailableError } from './llm-unavailable.error';
import {
  LlmClient,
  LlmConversationMessage,
  LlmResponse,
  LlmToolDefinition,
} from './llm-client.interface';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// This provider's own default model — read from the generic LLM_MODEL env
// var when set, so picking a different Claude model is a config change,
// not a code change. Only meaningful to this implementation; nothing
// generic reads it.
const DEFAULT_MODEL = 'claude-sonnet-5';
// A tool-loop call can involve several searches before resolving —
// generous but still bounded, same reasoning as GroqClientService's
// REQUEST_TIMEOUT_MS.
const REQUEST_TIMEOUT_MS = 30_000;

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type AnthropicResponseContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

interface AnthropicMessageResponse {
  content: AnthropicResponseContentBlock[];
}

function isToolUseBlock(block: AnthropicResponseContentBlock): block is AnthropicToolUseBlock {
  return block.type === 'tool_use';
}

// Converts this app's provider-agnostic LlmConversationMessage[] into
// Anthropic's own alternating-role message format — the one place in this
// class that knows Anthropic represents a tool call as a `tool_use`
// content block on an assistant turn, and every result of one such turn as
// `tool_result` blocks batched into a single following user turn.
function toAnthropicMessages(messages: LlmConversationMessage[]): unknown[] {
  return messages.map((message) => {
    switch (message.role) {
      case 'user':
        return { role: 'user', content: message.text };
      case 'assistant':
        return {
          role: 'assistant',
          content: message.toolCalls.map((toolCall) => ({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
          })),
        };
      case 'tool_results':
        return {
          role: 'user',
          content: message.results.map((result) => ({
            type: 'tool_result',
            tool_use_id: result.toolCallId,
            content: result.content,
          })),
        };
    }
  });
}

function toAnthropicTools(tools: LlmToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

// One implementation of LlmClient (see llm-client.interface.ts) among
// possibly several — isolated from InvoiceVoiceDraftService on purpose,
// same "isolate the risky boundary" split as GroqClientService/
// SuperPdpClientService: this class only ever knows about the Anthropic
// HTTP call itself (auth, timeout, transport errors, wire-format
// conversion) and never touches tool definitions or prompt content beyond
// converting them. Talks to the Messages API directly via undici (already
// a dependency, see GroqClientService) rather than pulling in the
// @anthropic-ai/sdk package — no SDK-based external client exists
// anywhere else in this codebase, and one raw POST doesn't need one.
@Injectable()
export class AnthropicLlmClientService implements LlmClient {
  private readonly logger = new Logger(AnthropicLlmClientService.name);
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('LLM_API_KEY');
    this.model = config.get<string>('LLM_MODEL', DEFAULT_MODEL);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async sendMessage(params: {
    system: string;
    messages: LlmConversationMessage[];
    tools: LlmToolDefinition[];
    maxTokens: number;
  }): Promise<LlmResponse> {
    if (!this.apiKey) {
      throw new LlmUnavailableError('LLM_API_KEY is not configured');
    }

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          system: params.system,
          messages: toAnthropicMessages(params.messages),
          tools: toAnthropicTools(params.tools),
          max_tokens: params.maxTokens,
        }),
      });
    } catch (error) {
      this.logger.warn(`Anthropic request failed: ${String(error)}`);
      throw new LlmUnavailableError('Unable to reach Anthropic');
    }

    if (!response.ok) {
      this.logger.warn(`Anthropic request returned status ${response.status}`);
      throw new LlmUnavailableError(`Unexpected status ${response.status}`);
    }

    let body: AnthropicMessageResponse;
    try {
      body = (await response.json()) as AnthropicMessageResponse;
    } catch {
      throw new LlmUnavailableError('Malformed Anthropic response');
    }

    return {
      toolCalls: body.content.filter(isToolUseBlock).map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input,
      })),
    };
  }
}
