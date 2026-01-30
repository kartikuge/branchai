// ui.js — rendering + event wiring (XSS-safe)
import { state, currentProject, currentBranch, persist, newProject, newBranch, deleteBranch, deleteProject } from './state.js';
import { escapeHtml, estimateTokens, getTokenLimit, now } from './utils.js';
import { getProvider } from './providers/registry.js';

const $ = (id) => document.getElementById(id);

// --- static controls ---

let _onBranchSwitch = null;
let _currentModelId = null;

export function setCurrentModelId(modelId) {
  _currentModelId = modelId;
}

export function bindStaticControls({ onRun, onCopy, onImport, onExport, onProviderChange, onModelChange, onSettingsOpen, onBranchSwitch }) {
  _onBranchSwitch = onBranchSwitch || null;
  $('runBtn').onclick = onRun;
  $('copyBtn').onclick = onCopy;
  $('importBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = onImport;
  $('exportBtn').onclick = onExport;
  $('providerSel').onchange = onProviderChange;
  $('modelSel').onchange = onModelChange;
  $('settingsBtn').onclick = onSettingsOpen;

  $('newProjectBtn').onclick = () => {
    newProject();
    renderAll();
  };

  $('newBranchBtn').onclick = () => {
    const p = currentProject();
    if (!p) return alert('Create a project first.');
    newBranch('New Branch');
    renderAll();
  };

  $('projectName').onchange = () => {
    const p = currentProject();
    if (!p) return;
    p.name = $('projectName').value.trim() || 'Untitled';
    p.updatedAt = now();
    persist();
    renderProjects();
  };
}

// --- status displays ---

export function setModelStatus(text, level = '') {
  const el = $('modelStatus');
  el.textContent = text;
  el.className = 'pill ' + (level === 'ok' ? 'status-ok' : level === 'bad' ? 'status-bad' : '');
}

// --- render functions ---

export function renderAll() {
  const p = currentProject();

  if (!p) {
    if ($('projects')) $('projects').innerHTML = '<div class="muted">No project yet</div>';
    if ($('branches')) $('branches').innerHTML = '';
    if ($('transcript')) $('transcript').innerHTML = '';
    if ($('out')) $('out').textContent = '';
    return;
  }

  renderProjects();
  renderBranches();
  renderTranscript();
  updateTokenInfo();

  // Clear stale assistant output when switching branches
  if ($('out')) $('out').textContent = '';

  // Provider hint when no model is connected
  const modelSel = $('modelSel');
  let hint = $('providerHint');
  if (modelSel && (modelSel.value === '--' || modelSel.value === 'no models found')) {
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'providerHint';
      hint.className = 'muted';
      hint.style.fontSize = '12px';
      hint.style.marginTop = '4px';
      hint.textContent = 'Connect a provider in Settings';
      modelSel.parentNode.insertBefore(hint, modelSel.nextSibling);
    }
  } else if (hint) {
    hint.remove();
  }

  // Sync project name input
  const nameInput = $('projectName');
  if (nameInput) nameInput.value = p.name || '';

  // Notify main.js to sync provider/model for the active branch
  _onBranchSwitch?.();
}

export function renderProjects() {
  const projects = Array.isArray(state.projects) ? state.projects : [];
  const el = $('projects');
  if (!el) return;

  el.innerHTML = projects.map(p => `
    <div class="list-item ${p.id === state.activeProjectId ? 'active' : ''}" data-project="${escapeHtml(p.id)}">
      <span>${escapeHtml(p.name)}</span>
      <button class="del-btn" data-del-project="${escapeHtml(p.id)}" title="Delete project">&times;</button>
    </div>
  `).join('');

  el.querySelectorAll('.list-item').forEach(node => {
    node.addEventListener('click', (e) => {
      if (e.target.classList.contains('del-btn')) return;
      state.activeProjectId = node.dataset.project;
      const proj = projects.find(x => x.id === state.activeProjectId);
      if (proj && Array.isArray(proj.branches) && proj.branches[0]) {
        state.activeBranchId = proj.branches[0].id;
      } else {
        state.activeBranchId = null;
      }
      persist();
      renderAll();
    });
  });

  el.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete this project and all its branches?')) return;
      deleteProject(btn.dataset.delProject);
      renderAll();
    });
  });
}

export function renderBranches() {
  const p = currentProject();
  const branches = Array.isArray(p?.branches) ? p.branches : [];
  const el = $('branches');
  if (!el) return;

  if (!branches.length) {
    el.innerHTML = '<div class="muted">No branches yet</div>';
    return;
  }

  el.innerHTML = branches.map(b => `
    <div class="list-item ${b.id === state.activeBranchId ? 'active' : ''}" data-branch="${escapeHtml(b.id)}">
      <span>${escapeHtml(b.title)}</span>
      <button class="del-btn" data-del-branch="${escapeHtml(b.id)}" title="Delete branch">&times;</button>
    </div>
  `).join('');

  el.querySelectorAll('.list-item').forEach(node => {
    node.addEventListener('click', (e) => {
      if (e.target.classList.contains('del-btn')) return;
      state.activeBranchId = node.dataset.branch;
      persist();
      renderAll();
    });
  });

  el.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete this branch?')) return;
      deleteBranch(btn.dataset.delBranch);
      renderAll();
    });
  });
}

export function renderTranscript() {
  const b = currentBranch();
  const messages = Array.isArray(b?.messages) ? b.messages : [];
  const el = $('transcript');
  if (!el) return;

  if (!messages.length) {
    el.innerHTML = '<div class="muted">No messages yet. Type a message and click Run.</div>';
    return;
  }

  el.innerHTML = messages.map((m, idx) => `
    <div class="msg ${escapeHtml(m.role)}">
      <div class="role">${escapeHtml(m.role)}</div>
      <div class="content">${escapeHtml(m.content)}</div>
      <button class="branch-here-btn" data-idx="${idx}" title="Branch from here">branch here</button>
    </div>
  `).join('');

  // Wire "Branch from here" buttons
  el.querySelectorAll('.branch-here-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      const seed = messages.slice(0, i + 1);
      const nb = newBranch(`Branch @ msg ${i + 1}`, seed);
      if (nb) renderAll();
    });
  });

  // Auto-scroll to bottom
  el.scrollTop = el.scrollHeight;
}

function updateTokenInfo() {
  const b = currentBranch();
  const el = $('tokenInfo');
  if (!el) return;
  const tokens = estimateTokens(b?.messages);
  const limit = getTokenLimit(_currentModelId);
  const ratio = tokens / limit;
  el.textContent = `~${tokens} / ${limit} tokens`;
  el.classList.remove('token-ok', 'token-warn', 'token-danger');
  if (ratio > 0.8) {
    el.classList.add('token-danger');
  } else if (ratio >= 0.5) {
    el.classList.add('token-warn');
  } else {
    el.classList.add('token-ok');
  }
}

// --- settings modal ---

export function openSettingsModal() {
  let modal = $('settingsModal');
  if (modal) { modal.style.display = 'flex'; return; }

  modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Settings</h3>
        <button class="btn modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <label>Ollama URL</label>
        <div class="setting-row">
          <input type="text" id="settOllamaUrl" value="${escapeHtml(state.settings.ollama.url)}" placeholder="http://localhost:11434" />
          <button class="btn btn-sm" id="testOllama">Test</button>
          <span class="test-result" id="testOllamaResult"></span>
        </div>

        <label>OpenAI API Key</label>
        <div class="setting-row">
          <input type="password" id="settOpenaiKey" value="${escapeHtml(state.settings.openai.apiKey)}" placeholder="sk-..." />
          <button class="btn btn-sm" id="testOpenai">Test</button>
          <span class="test-result" id="testOpenaiResult"></span>
        </div>

        <label>Anthropic API Key</label>
        <div class="setting-row">
          <input type="password" id="settAnthropicKey" value="${escapeHtml(state.settings.anthropic.apiKey)}" placeholder="sk-ant-..." />
          <button class="btn btn-sm" id="testAnthropic">Test</button>
          <span class="test-result" id="testAnthropicResult"></span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="settSaveBtn">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.modal-close').onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  // Wire test buttons
  $('testOllama').onclick = () => _testProvider('ollama', { url: $('settOllamaUrl').value.trim() }, $('testOllamaResult'));
  $('testOpenai').onclick = () => _testProvider('openai', { apiKey: $('settOpenaiKey').value.trim() }, $('testOpenaiResult'));
  $('testAnthropic').onclick = () => _testProvider('anthropic', { apiKey: $('settAnthropicKey').value.trim() }, $('testAnthropicResult'));
}

async function _testProvider(providerId, config, resultEl) {
  resultEl.textContent = 'testing...';
  resultEl.className = 'test-result';
  try {
    const provider = getProvider(providerId, config);
    const result = await provider.testConnection();
    if (result.ok) {
      resultEl.textContent = '\u2713 ' + (result.info || 'OK');
      resultEl.className = 'test-result test-ok';
    } else {
      resultEl.textContent = '\u2717 ' + (result.error || 'Failed');
      resultEl.className = 'test-result test-fail';
    }
  } catch (e) {
    resultEl.textContent = '\u2717 ' + e.message;
    resultEl.className = 'test-result test-fail';
  }
}

export function getSettingsValues() {
  return {
    ollama: { url: $('settOllamaUrl')?.value.trim() || 'http://localhost:11434' },
    openai: { apiKey: $('settOpenaiKey')?.value.trim() || '' },
    anthropic: { apiKey: $('settAnthropicKey')?.value.trim() || '' },
  };
}
