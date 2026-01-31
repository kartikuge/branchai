// ui.js — screen-based rendering + event wiring (XSS-safe)
import { state, currentProject, currentBranch, persist, newProject, newBranch, deleteBranch, deleteProject } from './state.js';
import { escapeHtml, estimateTokens, getTokenLimit, now, timeAgo, pickDefaultEmoji } from './utils.js';
import { getProvider } from './providers/registry.js';
import { SCREENS, navigateTo, getCurrentScreen } from './router.js';
import { ICONS } from './icons.js';

const $ = (id) => document.getElementById(id);

// --- callbacks set by main.js ---
let _callbacks = {};
let _currentModelId = null;

// --- cached model status (survives header re-renders) ---
let _lastStatus = { text: 'starting...', level: '' };

export function setCurrentModelId(modelId) {
  _currentModelId = modelId;
}

export function setCallbacks(cbs) {
  _callbacks = cbs;
}

// --- status ---

export function setModelStatus(text, level = '') {
  _lastStatus = { text, level };
  const el = $('modelStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'status-pill ' + (level === 'ok' ? 'status-ok' : level === 'bad' ? 'status-bad' : 'status-connecting');
}

export function replayModelStatus() {
  setModelStatus(_lastStatus.text, _lastStatus.level);
}

// --- header rendering ---

function themeIcon() {
  return state.settings.darkMode ? ICONS.sun : ICONS.moon;
}

function renderHeader() {
  const header = $('appHeader');
  if (!header) return;
  const screen = getCurrentScreen();

  if (screen === SCREENS.HOME) {
    header.innerHTML = `
      <div class="header-left">
        <span class="header-logo" id="headerLogo">BranchAI</span>
      </div>
      <div class="header-right">
        <div class="view-toggle">
          <button id="viewGridBtn" class="${state.viewMode === 'grid' ? 'active' : ''}" title="Grid view">${ICONS.grid}</button>
          <button id="viewListBtn" class="${state.viewMode === 'list' ? 'active' : ''}" title="List view">${ICONS.list}</button>
        </div>
        <button class="icon-btn" id="themeToggle" title="Toggle theme">${themeIcon()}</button>
        <button class="icon-btn" id="settingsBtn" title="Settings">${ICONS.gear}</button>
        <button class="btn-primary" id="newProjectBtn">${ICONS.plus} New Project</button>
      </div>`;
  } else if (screen === SCREENS.PROJECT) {
    const p = currentProject();
    header.innerHTML = `
      <div class="header-left">
        <button class="back-btn" id="navBack" title="Back to projects">${ICONS.backArrow}</button>
        <div class="breadcrumb">
          <a id="navHome">Projects</a>
          <span class="sep">${ICONS.chevronRight}</span>
          <span class="current">${p ? escapeHtml(p.emoji) + ' ' + escapeHtml(p.name) : 'Project'}</span>
        </div>
      </div>
      <div class="header-right">
        <div class="view-toggle">
          <button id="viewGridBtn" class="${state.viewMode === 'grid' ? 'active' : ''}" title="Grid view">${ICONS.grid}</button>
          <button id="viewListBtn" class="${state.viewMode === 'list' ? 'active' : ''}" title="List view">${ICONS.list}</button>
        </div>
        <button class="icon-btn" id="themeToggle" title="Toggle theme">${themeIcon()}</button>
        <button class="icon-btn" id="settingsBtn" title="Settings">${ICONS.gear}</button>
        <button class="btn-primary" id="newBranchBtn">${ICONS.plus} New Branch</button>
      </div>`;
  } else if (screen === SCREENS.CHAT) {
    const p = currentProject();
    const b = currentBranch();
    header.innerHTML = `
      <div class="header-left">
        <button class="back-btn" id="navBack" title="Back to branches">${ICONS.backArrow}</button>
        <div class="breadcrumb">
          <a id="navHome">Projects</a>
          <span class="sep">${ICONS.chevronRight}</span>
          <a id="navProject">${p ? escapeHtml(p.emoji) + ' ' + escapeHtml(p.name) : 'Project'}</a>
          <span class="sep">${ICONS.chevronRight}</span>
          <span class="current">${b ? escapeHtml(b.emoji) + ' ' + escapeHtml(b.title) : 'Branch'}</span>
        </div>
      </div>
      <div class="header-right">
        <div class="header-select">
          <select id="providerSel"></select>
        </div>
        <div class="header-select">
          <select id="modelSel"><option>loading...</option></select>
        </div>
        <span id="modelStatus" class="status-pill status-connecting">starting...</span>
        <span id="tokenInfo" class="token-badge"></span>
        <button class="icon-btn" id="themeToggle" title="Toggle theme">${themeIcon()}</button>
        <button class="icon-btn" id="settingsBtn" title="Settings">${ICONS.gear}</button>
      </div>`;
  }

  wireHeaderEvents();
}

function wireHeaderEvents() {
  const screen = getCurrentScreen();

  // Logo click → home
  const logo = $('headerLogo');
  if (logo) logo.onclick = () => navigateTo(SCREENS.HOME);

  // Back button — goes one level up
  const navBack = $('navBack');
  if (navBack) {
    if (screen === SCREENS.PROJECT) navBack.onclick = () => navigateTo(SCREENS.HOME);
    else if (screen === SCREENS.CHAT) navBack.onclick = () => navigateTo(SCREENS.PROJECT);
  }

  // Breadcrumb links
  const navHome = $('navHome');
  if (navHome) navHome.onclick = () => navigateTo(SCREENS.HOME);
  const navProject = $('navProject');
  if (navProject) navProject.onclick = () => navigateTo(SCREENS.PROJECT);

  // View toggle
  const gridBtn = $('viewGridBtn');
  const listBtn = $('viewListBtn');
  if (gridBtn) gridBtn.onclick = () => { state.viewMode = 'grid'; persist(); renderAll(); };
  if (listBtn) listBtn.onclick = () => { state.viewMode = 'list'; persist(); renderAll(); };

  // Theme toggle (sun/moon)
  const themeToggle = $('themeToggle');
  if (themeToggle) themeToggle.onclick = () => _callbacks.onDarkModeChange?.(!state.settings.darkMode);

  // Settings
  const settingsBtn = $('settingsBtn');
  if (settingsBtn) settingsBtn.onclick = () => {
    openSettingsModal();
    const saveBtn = $('settSaveBtn');
    if (saveBtn) saveBtn.onclick = () => _callbacks.onSettingsSave?.();
  };

  // New project
  const newProjBtn = $('newProjectBtn');
  if (newProjBtn) newProjBtn.onclick = () => openNewProjectModal((name, desc, emoji) => {
    newProject(name, null, 'Main', { description: desc, emoji });
    navigateTo(SCREENS.PROJECT);
  });

  // New branch
  const newBrBtn = $('newBranchBtn');
  if (newBrBtn) newBrBtn.onclick = () => openNewBranchModal((name, desc, emoji) => {
    newBranch(name, [], null, { description: desc, emoji });
    navigateTo(SCREENS.CHAT);
  });

  // Provider/model selects (chat screen)
  if (screen === SCREENS.CHAT) {
    const provSel = $('providerSel');
    const modSel = $('modelSel');
    if (provSel) provSel.onchange = (e) => _callbacks.onProviderChange?.(e);
    if (modSel) modSel.onchange = (e) => _callbacks.onModelChange?.(e);
  }
}

// --- screen renderers ---

function renderProjectsScreen() {
  const el = $('home-content');
  if (!el) return;

  const projects = Array.isArray(state.projects) ? state.projects : [];

  let html = `<h1 class="page-title">Your Projects</h1>
    <p class="page-subtitle">Organize your AI conversations into projects</p>`;

  if (!projects.length) {
    html += `<div class="empty-state"><p>No projects yet. Create one to get started.</p></div>`;
    el.innerHTML = html;
    return;
  }

  if (state.viewMode === 'grid') {
    html += '<div class="cards-grid">';
    for (const p of projects) {
      const branchCount = (p.branches || []).length;
      html += `
        <div class="project-card" data-project="${escapeHtml(p.id)}">
          <button class="card-delete" data-del-project="${escapeHtml(p.id)}" title="Delete project">&times;</button>
          <div class="card-emoji">${escapeHtml(p.emoji || '')}</div>
          <div class="card-name">${escapeHtml(p.name)}</div>
          <div class="card-desc">${escapeHtml(p.description || '')}</div>
          <div class="card-meta">
            <span>${ICONS.gitBranch} ${branchCount} branch${branchCount !== 1 ? 'es' : ''}</span>
            <span>${ICONS.clock} ${timeAgo(p.updatedAt)}</span>
          </div>
        </div>`;
    }
    html += '</div>';
  } else {
    html += `<div class="data-table projects-table">
      <div class="table-header">
        <span class="col-name">Project</span>
        <span class="col-desc">Description</span>
        <span class="col-count">Branches</span>
        <span class="col-updated">Updated</span>
      </div>`;
    for (const p of projects) {
      const branchCount = (p.branches || []).length;
      html += `
      <div class="table-row" data-project="${escapeHtml(p.id)}">
        <span class="col-name"><span class="row-emoji">${escapeHtml(p.emoji || '')}</span> ${escapeHtml(p.name)}</span>
        <span class="col-desc">${escapeHtml(p.description || '')}</span>
        <span class="col-count">${ICONS.gitBranch} ${branchCount}</span>
        <span class="col-updated">${ICONS.clock} ${timeAgo(p.updatedAt)}</span>
        <button class="row-delete" data-del-project="${escapeHtml(p.id)}" title="Delete">&times;</button>
      </div>`;
    }
    html += '</div>';
  }

  el.innerHTML = html;

  // Wire clicks
  el.querySelectorAll('[data-project]').forEach(node => {
    if (node.classList.contains('row-delete') || node.classList.contains('card-delete')) return;
    node.addEventListener('click', (e) => {
      if (e.target.closest('.row-delete') || e.target.closest('.card-delete')) return;
      state.activeProjectId = node.dataset.project;
      const proj = state.projects.find(x => x.id === state.activeProjectId);
      if (proj?.branches?.[0]) state.activeBranchId = proj.branches[0].id;
      persist();
      navigateTo(SCREENS.PROJECT);
    });
  });

  el.querySelectorAll('[data-del-project]').forEach(btn => {
    if (!btn.classList.contains('row-delete') && !btn.classList.contains('card-delete')) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete this project and all its branches?')) return;
      deleteProject(btn.dataset.delProject);
      renderAll();
    });
  });
}

function renderBranchesScreen() {
  const el = $('project-content');
  if (!el) return;

  const p = currentProject();
  if (!p) {
    el.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
    return;
  }

  const branches = Array.isArray(p.branches) ? p.branches : [];

  let html = `<h1 class="page-title">Branches</h1>
    <p class="page-subtitle">${escapeHtml(p.description || p.name)}</p>`;

  if (!branches.length) {
    html += '<div class="empty-state"><p>No branches yet. Create one to start a conversation.</p></div>';
    el.innerHTML = html;
    return;
  }

  if (state.viewMode === 'grid') {
    html += '<div class="cards-grid">';
    for (const b of branches) {
      const msgCount = (b.messages || []).length;
      const isActive = b.id === state.activeBranchId;
      const branchedMeta = b.branchedFromMsg != null ? `<span>${ICONS.gitFork} msg ${b.branchedFromMsg + 1}</span>` : '';
      html += `
        <div class="branch-card" data-branch="${escapeHtml(b.id)}">
          ${isActive ? '<div class="active-dot"></div>' : ''}
          <button class="card-delete" data-del-branch="${escapeHtml(b.id)}" title="Delete branch">&times;</button>
          <div class="card-emoji">${escapeHtml(b.emoji || '')}</div>
          <div class="card-name">${escapeHtml(b.title)}</div>
          <div class="card-desc">${escapeHtml(b.description || '')}</div>
          <div class="card-meta">
            <span>${ICONS.message} ${msgCount} msg${msgCount !== 1 ? 's' : ''}</span>
            <span>${ICONS.clock} ${timeAgo(b.updatedAt)}</span>
            ${branchedMeta}
          </div>
        </div>`;
    }
    html += '</div>';
  } else {
    html += `<div class="data-table branches-table">
      <div class="table-header">
        <span class="col-name">Branch</span>
        <span class="col-desc">Summary</span>
        <span class="col-count">Messages</span>
        <span class="col-origin">Origin</span>
        <span class="col-updated">Updated</span>
      </div>`;
    for (const b of branches) {
      const msgCount = (b.messages || []).length;
      const isActive = b.id === state.activeBranchId;
      const origin = b.branchedFromMsg != null
        ? `${ICONS.gitFork} from msg ${b.branchedFromMsg + 1}`
        : '<span class="muted">root</span>';
      html += `
      <div class="table-row${isActive ? ' row-active' : ''}" data-branch="${escapeHtml(b.id)}">
        <span class="col-name"><span class="row-emoji">${escapeHtml(b.emoji || '')}</span> ${escapeHtml(b.title)}</span>
        <span class="col-desc">${escapeHtml(b.description || '')}</span>
        <span class="col-count">${ICONS.message} ${msgCount}</span>
        <span class="col-origin">${origin}</span>
        <span class="col-updated">${timeAgo(b.updatedAt)}</span>
        <button class="row-delete" data-del-branch="${escapeHtml(b.id)}" title="Delete">&times;</button>
      </div>`;
    }
    html += '</div>';
  }

  el.innerHTML = html;

  // Wire clicks
  el.querySelectorAll('[data-branch]').forEach(node => {
    if (node.classList.contains('row-delete') || node.classList.contains('card-delete')) return;
    node.addEventListener('click', (e) => {
      if (e.target.closest('.row-delete') || e.target.closest('.card-delete')) return;
      state.activeBranchId = node.dataset.branch;
      persist();
      navigateTo(SCREENS.CHAT);
    });
  });

  el.querySelectorAll('[data-del-branch]').forEach(btn => {
    if (!btn.classList.contains('row-delete') && !btn.classList.contains('card-delete')) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete this branch?')) return;
      deleteBranch(btn.dataset.delBranch);
      renderAll();
    });
  });
}

function renderChatScreen() {
  const b = currentBranch();
  const messages = Array.isArray(b?.messages) ? b.messages : [];

  // Subtitle bar
  const subtitleEl = $('chatSubtitle');
  if (subtitleEl && b) {
    const parts = [];
    if (b.branchedFromMsg != null) parts.push(`Branched from msg ${b.branchedFromMsg + 1}`);
    parts.push(`${messages.length} message${messages.length !== 1 ? 's' : ''}`);
    subtitleEl.textContent = parts.join(' \u00B7 ');
  }

  // Messages
  const chatEl = $('chatMessages');
  if (!chatEl) return;

  if (!messages.length) {
    chatEl.innerHTML = '<div class="empty-state"><p>Start the conversation by typing a message below.</p></div>';
    return;
  }

  chatEl.innerHTML = messages.map((m, idx) => {
    const isUser = m.role === 'user';
    const avatar = isUser ? 'You' : 'AI';
    const copyBtn = !isUser ? `<button class="msg-action-btn" data-copy="${idx}" title="Copy">${ICONS.copy}</button>` : '';
    return `
      <div class="msg-row ${escapeHtml(m.role)}">
        <div class="msg-avatar">${avatar}</div>
        <div class="msg-bubble">${escapeHtml(m.content)}</div>
        <div class="msg-actions">
          <button class="msg-action-btn" data-branch-idx="${idx}" title="Branch from here">${ICONS.gitFork}</button>
          ${copyBtn}
        </div>
      </div>`;
  }).join('');

  // Wire branch-here buttons
  chatEl.querySelectorAll('[data-branch-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.branchIdx);
      const seed = messages.slice(0, i + 1);
      newBranch(`Branch @ msg ${i + 1}`, seed, i);
      navigateTo(SCREENS.PROJECT);
    });
  });

  // Wire copy buttons
  chatEl.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = Number(btn.dataset.copy);
      const text = messages[i]?.content || '';
      if (text) await navigator.clipboard.writeText(text);
    });
  });

  // Auto-scroll
  chatEl.scrollTop = chatEl.scrollHeight;

  // Update token info
  updateTokenInfo();

  // Send button icon
  const sendBtn = $('sendBtn');
  if (sendBtn) sendBtn.innerHTML = ICONS.arrowUp;
}

// --- streaming support ---

export function appendStreamingBubble() {
  const chatEl = $('chatMessages');
  if (!chatEl) return;
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-bubble streaming-cursor" id="streaming-content"></div>`;
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

export function updateStreamingContent(text) {
  const el = $('streaming-content');
  if (el) {
    el.textContent = text;
    const chatEl = $('chatMessages');
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  }
}

// --- token info ---

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

// --- screen activation ---

function activateScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen-${screen}`);
  if (target) target.classList.add('active');
}

// --- main render ---

export function renderAll() {
  const screen = getCurrentScreen();
  activateScreen(screen);
  renderHeader();

  if (screen === SCREENS.HOME) {
    renderProjectsScreen();
  } else if (screen === SCREENS.PROJECT) {
    renderBranchesScreen();
  } else if (screen === SCREENS.CHAT) {
    renderChatScreen();
    replayModelStatus();
  }
}

// --- settings modal ---

export function openSettingsModal() {
  let modal = $('settingsModal');
  if (modal) {
    // Update dark mode checkbox to current state
    const cb = $('settDarkMode');
    if (cb) cb.checked = state.settings.darkMode;
    modal.style.display = 'flex';
    return;
  }

  modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Settings</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <label>Ollama URL</label>
        <div class="setting-row">
          <input type="text" id="settOllamaUrl" value="${escapeHtml(state.settings.ollama.url)}" placeholder="http://localhost:11434" />
          <button class="btn-sm" id="testOllama">Test</button>
          <span class="test-result" id="testOllamaResult"></span>
        </div>

        <label>OpenAI API Key</label>
        <div class="setting-row">
          <input type="password" id="settOpenaiKey" value="${escapeHtml(state.settings.openai.apiKey)}" placeholder="sk-..." />
          <button class="btn-sm" id="testOpenai">Test</button>
          <span class="test-result" id="testOpenaiResult"></span>
        </div>

        <label>Anthropic API Key</label>
        <div class="setting-row">
          <input type="password" id="settAnthropicKey" value="${escapeHtml(state.settings.anthropic.apiKey)}" placeholder="sk-ant-..." />
          <button class="btn-sm" id="testAnthropic">Test</button>
          <span class="test-result" id="testAnthropicResult"></span>
        </div>
      </div>
      <div class="modal-footer">
        <div class="modal-footer-left">
          <button class="btn-secondary" id="settExportBtn">Export</button>
          <button class="btn-secondary" id="settImportBtn">Import</button>
        </div>
        <button class="btn-primary" id="settSaveBtn">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Close handlers
  modal.querySelector('.modal-close').onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  // Test buttons
  $('testOllama').onclick = () => _testProvider('ollama', { url: $('settOllamaUrl').value.trim() }, $('testOllamaResult'));
  $('testOpenai').onclick = () => _testProvider('openai', { apiKey: $('settOpenaiKey').value.trim() }, $('testOpenaiResult'));
  $('testAnthropic').onclick = () => _testProvider('anthropic', { apiKey: $('settAnthropicKey').value.trim() }, $('testAnthropicResult'));

  // Export / Import
  $('settExportBtn').onclick = () => _callbacks.onExport?.();
  $('settImportBtn').onclick = () => $('fileInput')?.click();
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

// --- new project/branch modals ---

const EMOJI_OPTIONS = ['\uD83D\uDE80', '\uD83D\uDCA1', '\uD83C\uDFA8', '\u26A1', '\uD83D\uDCCA', '\uD83D\uDD27', '\uD83C\uDF1F', '\uD83D\uDCDD'];

function openNewProjectModal(onSave) {
  _openCreateModal('New Project', 'Project name', onSave);
}

function openNewBranchModal(onSave) {
  _openCreateModal('New Branch', 'Branch name', onSave);
}

function _openCreateModal(title, namePlaceholder, onSave) {
  const existing = $('createModal');
  if (existing) existing.remove();

  const defaultEmoji = pickDefaultEmoji();
  let selectedEmoji = defaultEmoji;

  const modal = document.createElement('div');
  modal.id = 'createModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="create-form">
          <input type="text" id="createName" placeholder="${escapeHtml(namePlaceholder)}" autofocus />
          <textarea id="createDesc" placeholder="Description (optional)" rows="2"></textarea>
          <label>Icon</label>
          <div class="emoji-grid" id="emojiGrid">
            ${EMOJI_OPTIONS.map(e => `<div class="emoji-option ${e === defaultEmoji ? 'selected' : ''}" data-emoji="${e}">${e}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <div></div>
        <button class="btn-primary" id="createSaveBtn">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.modal-close').onclick = () => modal.remove();
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelectorAll('.emoji-option').forEach(opt => {
    opt.addEventListener('click', () => {
      modal.querySelectorAll('.emoji-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedEmoji = opt.dataset.emoji;
    });
  });

  $('createSaveBtn').onclick = () => {
    const name = $('createName').value.trim() || 'Untitled';
    const desc = $('createDesc').value.trim();
    modal.remove();
    onSave(name, desc, selectedEmoji);
  };

  $('createName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('createSaveBtn').click();
    }
  });

  setTimeout(() => $('createName')?.focus(), 50);
}
