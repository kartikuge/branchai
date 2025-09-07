import { loadInitial, persist, state, currentBranch } from './state.js';
import { bindStaticControls, renderAll, setModelStatus, updateStorageStatus } from './ui.js';
import { initModel, switchModel, sysPrompt, run, getCurrentModel } from './model.js';
import { now } from './utils.js';

const $ = (id) => document.getElementById(id);

// NEW: fetch injected context from multiple places
function getInjectedContext() {
  if (Array.isArray(window.__BRANCH_CONTEXT) && window.__BRANCH_CONTEXT.length) {
    return window.__BRANCH_CONTEXT;
  }
  try {
    const raw = sessionStorage.getItem('stormai_ctx');
    if (raw) return JSON.parse(raw);
  } catch {}
  // optional: URL hash ?ctx=<base64>
  if (location.hash.startsWith('#ctx=')) {
    try {
      const b64 = location.hash.slice(5);
      const json = decodeURIComponent(escape(atob(b64)));
      return JSON.parse(json);
    } catch {}
  }
  return null;
}

bindStaticControls({
  onRun: runCurrent,
  onCopy: async () => {
    const text = $('out').textContent || ''; if (!text) return;
    await navigator.clipboard.writeText(text);
    const btn = $('copyBtn'); const old = btn.textContent; btn.textContent='Copied ✓'; setTimeout(()=>btn.textContent=old, 900);
  },
  onImport: async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const mod = await import('./export_import.js'); await mod.importFromFile(file); e.target.value='';
  },
  onExport: async () => { const mod = await import('./export_import.js'); mod.exportCurrentProject(); },
  onBranchHere: branchFromLast,
  onModelChange: async (ev) => { await switchModel(ev.target.value, (t,l)=>setModelStatus(t,l)); }
});

(async function boot() {
  await loadInitial(getInjectedContext());
  renderAll();
  await initModel(document.getElementById('modelSel').value, (t,l)=>setModelStatus(t,l));
  updateStorageStatus('storage: local');
})();

// NEW: if context arrives after boot (background inject), consume it
window.addEventListener('stormai:ctx-ready', async () => {
  const ctx = getInjectedContext();
  if (ctx && ctx.length) {
    await loadInitial(ctx); // will create a new project/branch focused on this context
    renderAll();
  }
});

function buildMessages(extra, strategy) {
  const b = currentBranch(); if (!b) return [];
  const lastTurns = b.messages.slice(-8);
  const msgs = [];
  const sys = sysPrompt(strategy); if (sys) msgs.push({ role:'system', content: sys });
  lastTurns.forEach(m => msgs.push({ role: m.role==='assistant'?'assistant':'user', content: m.content }));
  if (extra?.trim()) msgs.push({ role: 'user', content: extra.trim() });
  return msgs;
}

async function runCurrent() {
  const b = currentBranch(); if (!b) return alert('Select or create a branch first.');
  const extra = $('extra').value; const strategy = document.getElementById('strategySel').value;
  document.getElementById('out').textContent = '';
  try {
    const output = await run(buildMessages(extra, strategy), {
      temperature: 0.7, max_tokens: 1024,
      onToken: (txt) => { document.getElementById('out').textContent = txt; }
    });
    if (extra?.trim()) b.messages.push({ role:'user', content: extra.trim(), ts: now() });
    b.messages.push({ role:'assistant', content: document.getElementById('out').textContent || output, ts: now() });
    b.model = getCurrentModel(); b.updatedAt = now();
    await persist();
  } catch (e) {
    console.error('[StormAI] run error', e);
    document.getElementById('out').textContent = 'error: ' + (e?.message || e);
  }
}

async function branchFromLast() {
  const btns = document.querySelectorAll('#transcript .btn[data-idx]');
  if (btns.length) btns[btns.length-1].click();
}
