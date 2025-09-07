import { loadInitial, persist, state, currentBranch } from './state.js';
import { bindStaticControls, renderAll, setModelStatus, updateStorageStatus } from './ui.js';
import { initModel, switchModel, sysPrompt, run, getCurrentModel } from './model.js';
import { now } from './utils.js';

const $ = (id) => document.getElementById(id);

function getInjectedContext() {
  if (Array.isArray(window.__BRANCH_CONTEXT) && window.__BRANCH_CONTEXT.length) {
    return { ctx: window.__BRANCH_CONTEXT, anchor: window.__BRANCH_ANCHOR ?? window.__BRANCH_CONTEXT.length - 1 };
  }
  try {
    const raw = sessionStorage.getItem('stormai_ctx');
    const ctx = raw ? JSON.parse(raw) : null;
    const a = Number(sessionStorage.getItem('stormai_anchor') ?? (ctx ? ctx.length - 1 : 0));
    if (ctx?.length) return { ctx, anchor: a };
  } catch {}
  return null;
}

bindStaticControls({
  onRun: sendMessage,
  onCopy: async () => {
    const text = $('out').textContent || '';
    if (text) await navigator.clipboard.writeText(text);
  },
  onModelChange: async (ev) => switchModel(ev.target.value, (t,l)=>setModelStatus(t,l)),
  onImport: async (e) => { const mod = await import('./export_import.js'); await mod.importFromFile(e.target.files?.[0]); e.target.value=''; },
  onExport: async () => { const mod = await import('./export_import.js'); mod.exportCurrentProject(); },
});

(async function boot() {
  const inj = getInjectedContext();
  await loadInitial(inj?.ctx, inj?.anchor);   // <— seed project/branch
  renderAll();
  await initModel(document.getElementById('modelSel').value, (t,l)=>setModelStatus(t,l));
  updateStorageStatus('storage: local');

  // If context arrives a bit late
  window.addEventListener('stormai:ctx-ready', async () => {
    const late = getInjectedContext();
    if (late?.ctx?.length) {
      await loadInitial(late.ctx, late.anchor);
      renderAll();
    }
  });

  // Enter-to-send
  const ta = document.getElementById('extra');
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendMessage(); }
  });
})();

function buildMessages(userText, strategy) {
  const b = currentBranch(); if (!b) return [];
  const sys = sysPrompt(strategy);
  const msgs = [];
  if (sys) msgs.push({ role: 'system', content: sys });
  b.messages.slice(-12).forEach(m => msgs.push({ role: m.role, content: m.content }));
  if (userText?.trim()) msgs.push({ role: 'user', content: userText.trim() });
  return msgs;
}

async function sendMessage() {
  const b = currentBranch(); if (!b) return alert('Create/select a branch first.');
  const userText = $('extra').value;
  $('extra').value = '';
  $('out').textContent = '';

  if (userText?.trim()) {
    b.messages.push({ role: 'user', content: userText.trim(), ts: now() });
    await persist();
    renderAll();
  }

  try {
    const output = await run(buildMessages(null, document.getElementById('strategySel').value), {
      temperature: 0.7, max_tokens: 1024,
      onToken: (txt) => { $('out').textContent = txt; }
    });
    const assistantText = $('out').textContent || output || '(no content)';
    b.messages.push({ role: 'assistant', content: assistantText, ts: now() });
    b.model = getCurrentModel(); b.updatedAt = now();
    await persist();
    renderAll();
  } catch (e) {
    console.error('[StormAI] run error', e);
    $('out').textContent = 'error: ' + (e?.message || e);
  }
}
