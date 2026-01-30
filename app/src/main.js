// main.js — provider-based orchestration
import { loadInitial, persist, state, currentBranch, updateSettings } from './state.js';
import { bindStaticControls, renderAll, setModelStatus, openSettingsModal, getSettingsValues, setCurrentModelId } from './ui.js';
import { getProvider, listProviders } from './providers/registry.js';
import { now } from './utils.js';

const $ = (id) => document.getElementById(id);

let activeProvider = null;
let currentModelId = null;

// --- injected context (from content script via background) ---

async function getInjectedContext() {
  try {
    const result = await chrome.storage.session.get('branchai_pending');
    if (result.branchai_pending) {
      await chrome.storage.session.remove('branchai_pending');
      const { transcript, anchorIndex, title } = result.branchai_pending;
      if (Array.isArray(transcript) && transcript.length) {
        return { ctx: transcript, anchor: anchorIndex ?? transcript.length - 1, title: title || null };
      }
    }
  } catch { /* not in extension context */ }

  // Fallback: window globals / sessionStorage (dev mode)
  if (Array.isArray(window.__BRANCH_CONTEXT) && window.__BRANCH_CONTEXT.length) {
    return { ctx: window.__BRANCH_CONTEXT, anchor: window.__BRANCH_ANCHOR ?? (window.__BRANCH_CONTEXT.length - 1) };
  }
  try {
    const raw = sessionStorage.getItem('branchai_ctx');
    const ctx = raw ? JSON.parse(raw) : null;
    const a = Number(sessionStorage.getItem('branchai_anchor') ?? (ctx ? ctx.length - 1 : 0));
    if (ctx?.length) return { ctx, anchor: a };
  } catch { /* ignore */ }
  return null;
}

// --- provider/model management ---

function populateProviders() {
  const sel = $('providerSel');
  if (!sel) return;
  sel.innerHTML = '';
  for (const p of listProviders()) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === state.settings.activeProvider) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function activateProvider(providerId) {
  state.settings.activeProvider = providerId;
  const config = state.settings[providerId] || {};
  activeProvider = getProvider(providerId, config);

  setModelStatus(`connecting to ${activeProvider.name}...`);
  const test = await activeProvider.testConnection();
  if (!test.ok) {
    setModelStatus(`${activeProvider.name}: ${test.error}`, 'bad');
    $('modelSel').innerHTML = '<option>--</option>';
    return;
  }

  setModelStatus(`${activeProvider.name}: connected`, 'ok');
  await populateModels();
}

async function populateModels(selectModelId) {
  const sel = $('modelSel');
  if (!sel || !activeProvider) return;
  try {
    const models = await activeProvider.listModels();
    sel.innerHTML = '';
    if (!models.length) {
      sel.innerHTML = '<option>no models found</option>';
      return;
    }
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      sel.appendChild(opt);
    }
    // Use explicit model if provided, then branch model, then global default
    const target = selectModelId || state.settings.defaultModel;
    if (target && models.some(m => m.id === target)) {
      sel.value = target;
    }
    currentModelId = sel.value;
    setCurrentModelId(currentModelId);
  } catch (e) {
    sel.innerHTML = '<option>error loading models</option>';
    setModelStatus(`model list failed: ${e.message}`, 'bad');
  }
}

/**
 * Restore the branch's saved provider/model into the header dropdowns.
 * Called after renderAll (branch switch).
 */
async function syncBranchProvider() {
  const b = currentBranch();
  const branchProvider = b?.provider || state.settings.activeProvider;
  const branchModel = b?.model || null;

  // If branch uses a different provider than what's active, switch
  if (branchProvider !== activeProvider?.id) {
    $('providerSel').value = branchProvider;
    await activateProvider(branchProvider);
    // activateProvider calls populateModels; now set the model
    if (branchModel) {
      const sel = $('modelSel');
      if (sel && [...sel.options].some(o => o.value === branchModel)) {
        sel.value = branchModel;
        currentModelId = branchModel;
        setCurrentModelId(currentModelId);
      }
    }
  } else if (branchModel) {
    // Same provider, just select the model
    const sel = $('modelSel');
    if (sel && [...sel.options].some(o => o.value === branchModel)) {
      sel.value = branchModel;
      currentModelId = branchModel;
      setCurrentModelId(currentModelId);
    }
  }
}

// --- message building ---

function buildMessages(userText) {
  const b = currentBranch();
  if (!b) return [];

  const msgs = [];
  msgs.push({ role: 'system', content: 'You are a helpful assistant. Continue the conversation naturally.' });

  // Send ALL messages (no cap)
  for (const m of b.messages) {
    msgs.push({ role: m.role, content: m.content });
  }

  if (userText?.trim()) {
    msgs.push({ role: 'user', content: userText.trim() });
  }
  return msgs;
}

// --- send ---

async function sendMessage() {
  const b = currentBranch();
  if (!b) return alert('Create/select a branch first.');
  if (!activeProvider) return alert('No provider connected. Check settings.');

  const userText = $('extra').value;
  $('extra').value = '';
  $('out').textContent = '';

  if (userText?.trim()) {
    b.messages.push({ role: 'user', content: userText.trim(), ts: now() });
    await persist();
    renderAll();
  }

  // Use branch provider/model if set, falling back to current UI selection
  const providerId = b.provider || activeProvider.id;
  let provider = activeProvider;
  if (providerId !== activeProvider.id) {
    const config = state.settings[providerId] || {};
    provider = getProvider(providerId, config);
  }
  const model = b.model || $('modelSel').value;
  if (!model || model === '--' || model === 'no models found') {
    return alert('No model selected.');
  }

  setModelStatus(`${provider.name}: generating...`);
  $('runBtn').disabled = true;

  try {
    const messages = buildMessages(null);
    const output = await provider.chatStream(messages, {
      model,
      max_tokens: 2048,
      onToken: (txt) => { $('out').textContent = txt; },
    });

    const assistantText = $('out').textContent || output || '(no content)';
    b.messages.push({ role: 'assistant', content: assistantText, ts: now() });
    b.model = model;
    b.provider = providerId;
    b.updatedAt = now();
    await persist();
    renderAll();
    setModelStatus(`${provider.name}: connected`, 'ok');
  } catch (e) {
    console.error('[BranchAI] run error', e);
    $('out').textContent = 'Error: ' + (e?.message || e);
    setModelStatus(`${provider.name}: error`, 'bad');
  } finally {
    $('runBtn').disabled = false;
  }
}

// --- settings ---

function handleSettingsSave() {
  const vals = getSettingsValues();
  updateSettings(vals);
  const modal = $('settingsModal');
  if (modal) modal.style.display = 'none';
  // Re-activate provider with new settings
  activateProvider(state.settings.activeProvider);
}

// --- boot ---

bindStaticControls({
  onRun: sendMessage,
  onCopy: async () => {
    const text = $('out').textContent || '';
    if (text) await navigator.clipboard.writeText(text);
  },
  onProviderChange: async (e) => {
    const id = e.target.value;
    await activateProvider(id);
    // Save to current branch
    const b = currentBranch();
    if (b) {
      b.provider = id;
      b.model = $('modelSel').value || null;
      persist();
    }
  },
  onModelChange: (e) => {
    currentModelId = e.target.value;
    setCurrentModelId(currentModelId);
    state.settings.defaultModel = currentModelId;
    // Save to current branch
    const b = currentBranch();
    if (b) {
      b.model = currentModelId;
      persist();
    }
  },
  onImport: async (e) => {
    const mod = await import('./export_import.js');
    try {
      await mod.importFromFile(e.target.files?.[0]);
      renderAll();
    } catch (err) {
      $('out').textContent = 'Import error: ' + (err?.message || err);
    }
    e.target.value = '';
  },
  onExport: async () => {
    const mod = await import('./export_import.js');
    mod.exportCurrentProject();
  },
  onBranchSwitch: () => syncBranchProvider(),
  onSettingsOpen: () => {
    openSettingsModal();
    // Wire save button after modal is created
    const saveBtn = $('settSaveBtn');
    if (saveBtn) saveBtn.onclick = handleSettingsSave;
  },
});

(async function boot() {
  // 1) Load state + any injected context
  const inj = await getInjectedContext();
  await loadInitial(inj?.ctx, inj?.anchor, inj?.title);
  renderAll();

  // 2) Populate provider dropdown and connect
  populateProviders();
  await activateProvider(state.settings.activeProvider);

  // 3) Listen for late context injection (from branchai:ctx-ready custom event)
  window.addEventListener('branchai:ctx-ready', async () => {
    const late = await getInjectedContext();
    if (late?.ctx?.length) {
      await loadInitial(late.ctx, late.anchor, late.title);
      renderAll();
    }
  });

  // 4) Listen for CTX_READY message from background (tab reuse path)
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'CTX_READY') {
        window.dispatchEvent(new Event('branchai:ctx-ready'));
      }
    });
  } catch { /* not in extension context */ }
})();
