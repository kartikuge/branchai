// providers/registry.js — provider factory and instance cache
import { OllamaProvider } from './ollama.js';

const providerClasses = {
  ollama: OllamaProvider,
};

const instances = new Map();

/**
 * Get or create a provider instance.
 * @param {string} providerId
 * @param {object} config - settings from state (API keys, URLs, etc.)
 * @returns {import('./base.js').BaseProvider}
 */
export function getProvider(providerId, config = {}) {
  const key = providerId;
  if (instances.has(key)) {
    const inst = instances.get(key);
    inst.config = config; // update config in case settings changed
    return inst;
  }
  const Cls = providerClasses[providerId];
  if (!Cls) throw new Error(`Unknown provider: ${providerId}`);
  const inst = new Cls(config);
  instances.set(key, inst);
  return inst;
}

/**
 * Register a new provider class (used when adding OpenAI/Anthropic later).
 */
export function registerProvider(id, cls) {
  providerClasses[id] = cls;
  instances.delete(id); // clear cached instance
}

/** @returns {Array<{id: string, name: string}>} */
export function listProviders() {
  return Object.entries(providerClasses).map(([id, Cls]) => {
    const tmp = new Cls();
    return { id, name: tmp.name };
  });
}
