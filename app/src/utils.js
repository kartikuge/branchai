// app/src/utils.js
export const genId = (p='id') => p + '_' + Math.random().toString(36).slice(2,8);
export const now = () => Date.now();
export function escapeHtml(s){
  return (s||"").replace(/[&<>'"]/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
export function estimateTokens(messages){
  const chars = (messages||[]).reduce((a,m)=>a+(m.content?.length||0),0);
  return Math.ceil(chars/4);
}

const TOKEN_LIMITS = [
  ['claude-', 200000],
  ['gpt-4', 128000],
  ['gpt-3.5', 16385],
];
const DEFAULT_TOKEN_LIMIT = 8192;

export function getTokenLimit(modelId) {
  if (!modelId) return DEFAULT_TOKEN_LIMIT;
  for (const [prefix, limit] of TOKEN_LIMITS) {
    if (modelId.startsWith(prefix)) return limit;
  }
  return DEFAULT_TOKEN_LIMIT;
}
