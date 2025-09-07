// WHY: single place to wire modules together (bootstrap).
import { loadInitial, persist, state, currentBranch } from './state.js';
import { bindStaticControls, renderAll, setModelStatus, updateStorageStatus } from './ui.js';
import { initModel, switchModel, sysPrompt, run, getCurrentModel } from './model.js';
import { exportCurrentProject, importFromFile } from './export_import.js';
import { now } from './utils.js';

const $ = (id) => document.getElementById(id);

bindStaticControls({
  onRun: runCurrent,
  onCopy: async () => {
    const text = $('out').textContent || ''; if (!text) return;
    await navigator.clipboard.writeText(text);
    const btn = $('copyBtn'); const old = btn.textContent; btn.textContent='Copied ✓'; setTimeout(()=>btn.textContent=old, 900);
  },
  onImport: async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    await importFromFile(file); e.target.value='';
  },
  onExport: exportCurrentProject,
  onBranchHere: branchFromLast,
  onModelChange: async (ev) => {
    await switchModel(ev.target.value, (txt, lvl)=>setModelStatus(txt,lvl));
  }
});

// Boot
(async function boot() {
  const injected = Array.isArray(window.__BRANCH_CONTEXT) ? window.__BRANCH_CONTEXT : null;
  await loadInitial(injected);
  renderAll();
  await initModel($('modelSel').value, (txt,lvl)=>setModelStatus(txt,lvl));
  updateStorageStatus('storage: local'); // local-first v1
})();

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
  const b = currentBranch();
  if (!b) { alert("Select or create a branch first."); return; }

  const extra = $('extra').value;
  const strategy = $('strategySel').value;
  $('out').textContent = '';

  try {
    const output = await run(buildMessages(extra, strategy), {
      temperature: 0.7,
      max_tokens: 1024,
      onToken: (txt) => { $('out').textContent = txt; }
    });

    if (extra?.trim()) b.messages.push({ role: 'user', content: extra.trim(), ts: now() });
    b.messages.push({ role: 'assistant', content: $('out').textContent || output, ts: now() });
    b.model = getCurrentModel(); b.updatedAt = now();
    await persist();
  } catch (e) {
    console.error('[StormAI] run error', e);
    $('out').textContent = 'error: ' + (e?.message || e);
  }
}

async function branchFromLast() {
  const b = currentBranch(); if (!b || !b.messages.length) return;
  // Reuse UI’s “branch from here” by simulating click on last index
  const btns = document.querySelectorAll('#transcript .btn[data-idx]');
  if (btns.length) btns[btns.length-1].click();
}
