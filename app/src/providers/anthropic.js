// providers/anthropic.js — Anthropic provider
import { BaseProvider } from './base.js';

const MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-haiku-235-20241022', name: 'Claude Haiku 3.5' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
];

export class AnthropicProvider extends BaseProvider {
  get id() { return 'anthropic'; }
  get name() { return 'Anthropic'; }

  get baseUrl() { return 'https://api.anthropic.com/v1'; }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  /**
   * Prepare messages for the Anthropic API:
   * - Extract system messages into a separate string
   * - Merge consecutive same-role messages (Anthropic requires alternating roles)
   */
  _prepareMessages(messages) {
    const systemParts = [];
    const nonSystem = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemParts.push(m.content);
      } else {
        nonSystem.push({ role: m.role, content: m.content });
      }
    }

    // Merge consecutive same-role messages
    const merged = [];
    for (const m of nonSystem) {
      if (merged.length && merged[merged.length - 1].role === m.role) {
        merged[merged.length - 1].content += '\n\n' + m.content;
      } else {
        merged.push({ ...m });
      }
    }

    return {
      system: systemParts.join('\n\n') || undefined,
      messages: merged,
    };
  }

  async listModels() {
    return MODELS.map(m => ({ ...m }));
  }

  async chat(messages, options = {}) {
    const { system, messages: prepared } = this._prepareMessages(messages);

    const body = {
      model: options.model || this.config.defaultModel || 'claude-sonnet-4-20250514',
      messages: prepared,
      max_tokens: options.max_tokens ?? 4096,
      stream: false,
    };
    if (system) body.system = system;
    if (options.temperature != null) body.temperature = options.temperature;

    let res;
    try {
      res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Cannot reach Anthropic API');
    }
    if (res.status === 401) throw new Error('Invalid Anthropic API key');
    if (res.status === 429) throw new Error('Rate limited — try again shortly');
    if (res.status === 400) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch {}
      throw new Error(detail || 'Bad request');
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error (${res.status}): ${err}`);
    }
    const data = await res.json();
    // Extract text from content blocks
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
    return text;
  }

  async chatStream(messages, options = {}) {
    const { system, messages: prepared } = this._prepareMessages(messages);

    const body = {
      model: options.model || this.config.defaultModel || 'claude-sonnet-4-20250514',
      messages: prepared,
      max_tokens: options.max_tokens ?? 4096,
      stream: true,
    };
    if (system) body.system = system;
    if (options.temperature != null) body.temperature = options.temperature;

    let res;
    try {
      res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Cannot reach Anthropic API');
    }
    if (res.status === 401) throw new Error('Invalid Anthropic API key');
    if (res.status === 429) throw new Error('Rate limited — try again shortly');
    if (res.status === 400) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch {}
      throw new Error(detail || 'Bad request');
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error (${res.status}): ${err}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      let currentEvent = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { currentEvent = ''; continue; }

        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7);
          if (currentEvent === 'message_stop') break;
          continue;
        }

        if (trimmed.startsWith('data: ') && currentEvent === 'content_block_delta') {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.delta?.type === 'text_delta' && data.delta.text) {
              accumulated += data.delta.text;
              options.onToken?.(accumulated);
            }
          } catch { /* skip malformed */ }
        }
      }
    }

    return accumulated;
  }

  async testConnection() {
    try {
      // Send a minimal request to validate the API key
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(err).error?.message || msg; } catch {}
        return { ok: false, error: msg };
      }
      return { ok: true, info: `${MODELS.length} models available` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}
