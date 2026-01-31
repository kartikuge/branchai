// providers/openai.js — OpenAI provider
import { BaseProvider } from './base.js';

export class OpenAIProvider extends BaseProvider {
  get id() { return 'openai'; }
  get name() { return 'OpenAI'; }

  get baseUrl() { return 'https://api.openai.com/v1'; }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  async listModels() {
    let res;
    try {
      res = await fetch(`${this.baseUrl}/models`, {
        headers: this._headers(),
      });
    } catch {
      throw new Error('Cannot reach OpenAI API');
    }
    if (res.status === 401) throw new Error('Invalid OpenAI API key');
    if (!res.ok) throw new Error(`OpenAI error (${res.status})`);
    const data = await res.json();
    return (data.data || [])
      .filter(m => m.id.startsWith('gpt-'))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(m => ({ id: m.id, name: m.id }));
  }

  _buildBody(messages, options, stream) {
    const model = options.model || this.config.defaultModel || 'gpt-4o';
    const body = {
      model,
      messages,
      stream,
      max_completion_tokens: options.max_tokens ?? 2048,
    };
    // Only include temperature if explicitly provided — reasoning models
    // (o1, o3, o4-mini, etc.) and some newer models reject non-default values
    if (options.temperature != null) {
      body.temperature = options.temperature;
    }
    return body;
  }

  async chat(messages, options = {}) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(this._buildBody(messages, options, false)),
      });
    } catch {
      throw new Error('Cannot reach OpenAI API');
    }
    if (res.status === 401) throw new Error('Invalid API key');
    if (res.status === 429) throw new Error('Rate limited — try again shortly');
    if (res.status === 404) throw new Error('Model not found');
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error (${res.status}): ${err}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async chatStream(messages, options = {}) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(this._buildBody(messages, options, true)),
      });
    } catch {
      throw new Error('Cannot reach OpenAI API');
    }
    if (res.status === 401) throw new Error('Invalid API key');
    if (res.status === 429) throw new Error('Rate limited — try again shortly');
    if (res.status === 404) throw new Error('Model not found');
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error (${res.status}): ${err}`);
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

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') break;
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            options.onToken?.(accumulated);
          }
        } catch { /* skip malformed lines */ }
      }
    }

    return accumulated;
  }

  async testConnection() {
    try {
      const models = await this.listModels();
      return { ok: true, info: `${models.length} model${models.length !== 1 ? 's' : ''} available` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}
