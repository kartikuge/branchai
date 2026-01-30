// providers/base.js — abstract provider interface
export class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /** @returns {string} provider identifier */
  get id() { throw new Error('not implemented'); }

  /** @returns {string} display name */
  get name() { throw new Error('not implemented'); }

  /**
   * List available models.
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  async listModels() { throw new Error('not implemented'); }

  /**
   * Non-streaming chat completion.
   * @param {Array<{role: string, content: string}>} messages
   * @param {{model?: string, temperature?: number, max_tokens?: number}} options
   * @returns {Promise<string>} assistant reply
   */
  async chat(messages, options = {}) { throw new Error('not implemented'); }

  /**
   * Streaming chat completion.
   * @param {Array<{role: string, content: string}>} messages
   * @param {{model?: string, temperature?: number, max_tokens?: number, onToken?: (accumulated: string) => void}} options
   * @returns {Promise<string>} full assistant reply
   */
  async chatStream(messages, options = {}) {
    // Default fallback: use non-streaming
    return this.chat(messages, options);
  }

  /**
   * Test whether the provider is reachable / configured.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async testConnection() {
    try {
      await this.listModels();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}
