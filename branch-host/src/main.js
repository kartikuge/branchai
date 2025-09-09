import { loadInitial, persist, state, currentBranch } from './state.js';
import { bindStaticControls, renderAll, setModelStatus, updateStorageStatus } from './ui.js';
import { initModel, switchModel, sysPrompt, run, getCurrentModel } from './model.js';
import { now } from './utils.js';

const $ = (id) => document.getElementById(id);

function getInjectedContext() {
  if (Array.isArray(window.__BRANCH_CONTEXT) && window.__BRANCH_CONTEXT.length) {
    return { ctx: window.__BRANCH_CONTEXT, anchor: window.__BRANCH_ANCHOR ?? (window.__BRANCH_CONTEXT.length - 1) };
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
  // 1) Load saved state and/or seeded transcript (if the extension injected it already)
  const inj = getInjectedContext();                 // may be null
  await loadInitial(inj?.ctx, inj?.anchor);         // creates project/branch if ctx exists, else Scratchpad
  renderAll();

  // 2) Bring model online (status banner updates via setModelStatus)
  const modelSel = document.getElementById('modelSel'); // adjust if your select has a different id
  const modelId = modelSel ? modelSel.value : 'Llama-3.2-3B-Instruct-q4f32_1-MLC';
  await initModel(modelId, (text, level) => setModelStatus(text, level));

  // 3) If context arrives a bit later (background inject after tab load), consume it and re-render
  window.addEventListener('stormai:ctx-ready', async () => {
    const late = getInjectedContext();
    if (late?.ctx?.length) {
      await loadInitial(late.ctx, late.anchor);     // prepends a new project with branched transcript
      renderAll();
    }
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
