// summarize.js — auto-generate branch summaries via provider.chat()

const MAX_CONTEXT_MESSAGES = 20;

// Small, cheap model used for summaries per provider.
// Avoids wasting tokens on reasoning models or expensive large models.
const SUMMARY_MODEL = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

/**
 * Generate a one-line summary of a branch's conversation.
 * @param {import('./providers/base.js').BaseProvider} provider
 * @param {string} model — user's selected model (used as fallback)
 * @param {{messages: Array, branchedFromMsg?: number|null}} branch
 * @returns {Promise<string>} summary text, or '' on failure
 */
export async function summarizeBranch(provider, model, branch) {
  const msgs = Array.isArray(branch.messages) ? branch.messages : [];
  if (!msgs.length) return '';

  const context = msgs.slice(0, MAX_CONTEXT_MESSAGES);

  // Use a small, cheap model for summaries — no need for large reasoning models
  const summaryModel = SUMMARY_MODEL[provider.id] || model;

  const systemPrompt = 'Summarize this conversation in one concise sentence (under 80 characters). Return ONLY the summary text, no quotes or extra formatting.';

  const prompt = [];
  prompt.push({ role: 'system', content: systemPrompt });

  if (branch.branchedFromMsg != null) {
    prompt.push({ role: 'user', content: `[Context: This conversation was branched from message ${branch.branchedFromMsg + 1} of a parent thread.]` });
  }

  for (const m of context) {
    prompt.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
  }

  prompt.push({ role: 'user', content: 'Now provide a one-sentence summary of the above conversation.' });

  const opts = { model: summaryModel, max_tokens: 600 };

  try {
    const result = await provider.chat(prompt, opts);
    return (result || '').trim().replace(/^["']|["']$/g, '');
  } catch (e) {
    console.warn('[summarize] failed for model', summaryModel, ':', e.message);
    throw e;
  }
}
