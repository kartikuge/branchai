// providers/ollama.js — Ollama local provider
import { BaseProvider } from './base.js';

export class OllamaProvider extends BaseProvider {
  get id() { return 'ollama'; }
  get name() { return 'Ollama (local)'; }

  get baseUrl() {
    return (this.config.url || 'http://localhost:11434').replace(/\/+$/, '');
  }

  async listModels() {
    let res;
    try {
      res = await fetch(`${this.baseUrl}/api/tags`);
    } catch {
      throw new Error(`Ollama not running at ${this.baseUrl}`);
    }
    if (!res.ok) throw new Error(`Ollama unreachable (${res.status})`);
    const data = await res.json();
    return (data.models || []).map(m => ({ id: m.name, name: m.name }));
  }

  async chat(messages, options = {}) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || this.config.defaultModel || 'llama3.2',
          messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.max_tokens ?? 2048,
          },
        }),
      });
    } catch {
      throw new Error(`Ollama not running at ${this.baseUrl}`);
    }
    if (res.status === 404) throw new Error('Model not found');
    if (res.status === 403) throw new Error('Ollama rejected request (403). Try setting OLLAMA_ORIGINS=* when starting Ollama');
    if (!res.ok) throw new Error(`Ollama error (${res.status})`);
    const data = await res.json();
    return data.message?.content || '';
  }

  async chatStream(messages, options = {}) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || this.config.defaultModel || 'llama3.2',
          messages,
          stream: true,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.max_tokens ?? 2048,
          },
        }),
      });
    } catch {
      throw new Error(`Ollama not running at ${this.baseUrl}`);
    }
    if (res.status === 404) throw new Error('Model not found');
    if (res.status === 403) throw new Error('Ollama rejected request (403). Try setting OLLAMA_ORIGINS=* when starting Ollama');
    if (!res.ok) throw new Error(`Ollama error (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Ollama streams NDJSON (one JSON object per line)
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            accumulated += chunk.message.content;
            options.onToken?.(accumulated);
          }
        } catch { /* skip malformed lines */ }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        if (chunk.message?.content) {
          accumulated += chunk.message.content;
          options.onToken?.(accumulated);
        }
      } catch { /* ignore */ }
    }

    return accumulated;
  }

  async testConnection() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      const count = data.models?.length ?? 0;
      return { ok: true, info: `${count} model${count !== 1 ? 's' : ''} available` };
    } catch (e) {
      return { ok: false, error: 'Ollama not running' };
    }
  }
}
