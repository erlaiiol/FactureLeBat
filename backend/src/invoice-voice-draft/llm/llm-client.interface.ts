// Phase 1.4-1's provider boundary. InvoiceVoiceDraftService (and
// voice-draft-tools.ts) talk only to these shapes and the LlmClient
// interface below — never to a specific provider's wire format. Today's
// only implementation is Anthropic's Messages API
// (anthropic-llm-client.service.ts), but nothing outside this file knows
// that: swapping to another hosted provider, or a self-hosted model later,
// means writing one new class that implements LlmClient and rebinding the
// LLM_CLIENT token in invoice-voice-draft.module.ts — no change anywhere
// else in this feature.

export interface LlmToolDefinition {
  name: string;
  description: string;
  // JSON Schema describing the tool's arguments — every provider's
  // function/tool-calling API accepts this same shape (Anthropic calls it
  // input_schema, OpenAI calls it parameters; the schema itself is
  // standard JSON Schema either way).
  inputSchema: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// One turn of the conversation, in a shape every provider's own message
// format can be converted to/from — an assistant turn is either plain text
// or one-or-more tool calls (never both, in this app's usage: the loop
// always either gets a tool call from the model or treats a text-only
// reply as "nothing to build a draft from"), and a tool-results turn
// batches every result from the assistant turn just before it (this app's
// loop always resolves every pending tool call before its next model
// call, same as the results of one search round-trip belong together).
export type LlmConversationMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; toolCalls: LlmToolCall[] }
  | { role: 'tool_results'; results: Array<{ toolCallId: string; content: string }> };

export interface LlmResponse {
  toolCalls: LlmToolCall[];
}

export interface LlmClient {
  isConfigured(): boolean;

  // No `model` param on purpose — which model (and which provider's own
  // default) to call is that implementation's own config concern, not
  // something the orchestrator should have to know or pass through.
  sendMessage(params: {
    system: string;
    messages: LlmConversationMessage[];
    tools: LlmToolDefinition[];
    maxTokens: number;
  }): Promise<LlmResponse>;
}

// DI token for LlmClient — an interface has no runtime identity of its own
// to inject by, so every consumer asks for this token
// (`@Inject(LLM_CLIENT)`) and invoice-voice-draft.module.ts is the one
// place that decides which concrete class answers it.
export const LLM_CLIENT = Symbol('LLM_CLIENT');
