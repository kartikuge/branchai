// state.js — chrome.storage.local backed state with provider settings

import { genId, now, pickDefaultEmoji } from './utils.js';

export const state = {
  projects: [],
  activeProjectId: null,
  activeBranchId: null,
  viewMode: 'list',
  settings: {
    activeProvider: 'ollama',
    defaultModel: null,
    darkMode: true,
    ollama: { url: 'http://localhost:11434' },
    openai: { apiKey: '' },
    anthropic: { apiKey: '' },
  },
};

// --- helpers ---

function normalizeState() {
  if (!Array.isArray(state.projects)) state.projects = [];
  if (!state.viewMode) state.viewMode = 'list';
  if (!state.settings) {
    state.settings = {
      activeProvider: 'ollama',
      defaultModel: null,
      darkMode: true,
      ollama: { url: 'http://localhost:11434' },
      openai: { apiKey: '' },
      anthropic: { apiKey: '' },
    };
  }
  if (typeof state.settings.darkMode !== 'boolean') state.settings.darkMode = true;

  for (const p of state.projects) {
    if (!Array.isArray(p.branches)) p.branches = [];
    if (!p.description) p.description = '';
    if (!p.emoji) p.emoji = pickDefaultEmoji();
    if (!p.updatedAt) p.updatedAt = p.createdAt || now();
    for (const b of p.branches) {
      if (!b.description) b.description = '';
      if (!b.emoji) b.emoji = pickDefaultEmoji();
      if (!b.updatedAt) b.updatedAt = b.createdAt || now();
      if (b.branchedFromMsg === undefined) b.branchedFromMsg = null;
    }
  }

  const p = state.projects.find(x => x.id === state.activeProjectId) || state.projects[0] || null;
  if (p) {
    state.activeProjectId = p.id;
    const b = p.branches.find(x => x.id === state.activeBranchId) || p.branches[0] || null;
    state.activeBranchId = b ? b.id : null;
  } else {
    state.activeProjectId = null;
    state.activeBranchId = null;
  }
}

// --- getters ---

export function currentProject() {
  return state.projects.find(p => p.id === state.activeProjectId) || null;
}

export function currentBranch() {
  const p = currentProject();
  if (!p) return null;
  return p.branches.find(b => b.id === state.activeBranchId) || null;
}

// --- persistence (chrome.storage.local) ---

const STORAGE_KEY = 'branchai_state_v2';

export async function persist() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: JSON.parse(JSON.stringify(state)) });
  } catch {
    // Fallback for development outside extension context
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

async function loadFromStorage() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  } catch {
    // Fallback
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}

// --- mutations ---

export function newProject(name = 'New Project', seedMessages = null, firstBranchTitle = 'Branched from Chat', { description = '', emoji = '' } = {}) {
  const pid = genId('prj');
  const ts = now();
  const proj = {
    id: pid,
    name,
    description,
    emoji: emoji || pickDefaultEmoji(),
    createdAt: ts,
    updatedAt: ts,
    branches: [],
  };

  if (Array.isArray(seedMessages) && seedMessages.length) {
    const bid = genId('br');
    proj.branches.push({
      id: bid,
      title: firstBranchTitle,
      description: '',
      emoji: pickDefaultEmoji(),
      createdAt: ts,
      updatedAt: ts,
      branchedFromMsg: null,
      messages: seedMessages.map(m => ({ ...m })),
    });
    state.activeBranchId = bid;
  }

  state.projects = [proj, ...state.projects];
  state.activeProjectId = pid;
  normalizeState();
  persist();
  return proj;
}

export function newBranch(title = 'New Branch', seedMessages = [], branchedFromMsg = null, { description = '', emoji = '' } = {}) {
  const p = currentProject();
  if (!p) return null;
  const ts = now();
  const br = {
    id: genId('br'),
    title,
    description,
    emoji: emoji || pickDefaultEmoji(),
    createdAt: ts,
    updatedAt: ts,
    branchedFromMsg,
    messages: Array.isArray(seedMessages) ? seedMessages.map(m => ({ ...m })) : [],
  };
  p.branches = [br, ...(p.branches || [])];
  p.updatedAt = ts;
  state.activeBranchId = br.id;
  normalizeState();
  persist();
  return br;
}

export function deleteProject(projectId) {
  state.projects = state.projects.filter(p => p.id !== projectId);
  normalizeState();
  persist();
}

export function deleteBranch(branchId) {
  const p = currentProject();
  if (!p) return;
  p.branches = p.branches.filter(b => b.id !== branchId);
  normalizeState();
  persist();
}

export function updateSettings(partial) {
  Object.assign(state.settings, partial);
  if (partial.ollama) Object.assign(state.settings.ollama, partial.ollama);
  if (partial.openai) Object.assign(state.settings.openai, partial.openai);
  if (partial.anthropic) Object.assign(state.settings.anthropic, partial.anthropic);
  persist();
}

// --- boot ---

export async function loadInitial(injectedTranscript, anchorIdx = null, title = null) {
  // 1) load saved state
  const saved = await loadFromStorage();
  if (saved) {
    Object.assign(state, saved);
  }
  normalizeState();

  // 2) if we got a transcript from the extension, create a new project
  if (Array.isArray(injectedTranscript) && injectedTranscript.length) {
    const cut = Number.isFinite(anchorIdx)
      ? Math.max(0, Math.min(anchorIdx, injectedTranscript.length - 1))
      : injectedTranscript.length - 1;
    const seed = injectedTranscript.slice(0, cut + 1);
    newProject(title || 'Branched Chat', seed, 'Branched from Chat');
  }

  // 3) if nothing exists, create a scratch project with an empty branch
  if (!state.projects.length) {
    const proj = newProject('Scratchpad');
    if (!proj.branches.length) {
      newBranch('Main');
    }
  }

  // Ensure active project always has at least one branch
  const ap = currentProject();
  if (ap && !ap.branches.length) {
    newBranch('Main');
  }

  normalizeState();
  await persist();
}
