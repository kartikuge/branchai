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
