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

const DEFAULT_EMOJIS = ['\uD83D\uDE80', '\uD83D\uDCA1', '\uD83C\uDFA8', '\u26A1', '\uD83D\uDCCA', '\uD83D\uDD27', '\uD83C\uDF1F', '\uD83D\uDCDD'];
let _emojiIdx = 0;
export function pickDefaultEmoji() {
  const emoji = DEFAULT_EMOJIS[_emojiIdx % DEFAULT_EMOJIS.length];
  _emojiIdx++;
  return emoji;
}

export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
