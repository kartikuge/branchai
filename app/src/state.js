// state.js — chrome.storage.local backed state with provider settings

import { genId, now } from './utils.js';

export const state = {
  projects: [],
  activeProjectId: null,
  activeBranchId: null,
  settings: {
    activeProvider: 'ollama',
    defaultModel: null,
    ollama: { url: 'http://localhost:11434' },
    openai: { apiKey: '' },
    anthropic: { apiKey: '' },
  },
};

// --- helpers ---

function normalizeState() {
  if (!Array.isArray(state.projects)) state.projects = [];
  if (!state.settings) {
    state.settings = {
      activeProvider: 'ollama',
      defaultModel: null,
      ollama: { url: 'http://localhost:11434' },
      openai: { apiKey: '' },
      anthropic: { apiKey: '' },
    };
  }
  for (const p of state.projects) {
    if (!Array.isArray(p.branches)) p.branches = [];
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

export function newProject(name = 'New Project', seedMessages = null, firstBranchTitle = 'Branched from Chat') {
  const pid = genId('prj');
  const proj = { id: pid, name, createdAt: now(), branches: [] };

  if (Array.isArray(seedMessages) && seedMessages.length) {
    const bid = genId('br');
    proj.branches.push({
      id: bid,
      title: firstBranchTitle,
      createdAt: now(),
      messages: [...seedMessages],
    });
    state.activeBranchId = bid;
  }

  state.projects = [proj, ...state.projects];
  state.activeProjectId = pid;
  normalizeState();
  persist();
  return proj;
}

export function newBranch(title = 'New Branch', seedMessages = []) {
  const p = currentProject();
  if (!p) return null;
  const br = {
    id: genId('br'),
    title,
    createdAt: now(),
    messages: Array.isArray(seedMessages) ? [...seedMessages] : [],
  };
  p.branches = [br, ...(p.branches || [])];
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

export async function loadInitial(injectedTranscript, anchorIdx = null) {
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
    newProject('New Project', seed, 'Branched from Chat');
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
