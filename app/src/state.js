// state.js — IndexedDB + chrome.storage.local backed state with provider settings

import { genId, now } from './utils.js';
import { encrypt, decrypt, isEncrypted } from './crypto.js';
import {
  getAllProjects, getBranchesForProject, getMessagesForBranch,
  putProject, putBranch, replaceMessages,
  deleteProjectFromDB, deleteBranchFromDB, putProjectWithChildren,
} from './db.js';
import { SETTINGS_KEY } from './migration.js';

export const state = {
  projects: [],
  activeProjectId: null,
  activeBranchId: null,
  viewMode: 'list',
  sidebarCollapsed: false,
  _sidebarExpanded: true,
  settings: {
    activeProvider: 'openai',
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
      activeProvider: 'openai',
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
    if (!p.emoji) p.emoji = '';
    if (!p.updatedAt) p.updatedAt = p.createdAt || now();
    for (const b of p.branches) {
      if (!b.description) b.description = '';
      if (!b.emoji) b.emoji = '';
      if (!b.updatedAt) b.updatedAt = b.createdAt || now();
      if (b.branchedFromMsg === undefined) b.branchedFromMsg = null;
      if (!b.summary) b.summary = '';
      if (b.summaryMsgCount == null) b.summaryMsgCount = 0;
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

// --- encryption helpers ---

async function encryptApiKeys(settings) {
  if (settings?.openai?.apiKey && typeof settings.openai.apiKey === 'string' && settings.openai.apiKey !== '') {
    settings.openai.apiKey = await encrypt(settings.openai.apiKey);
  }
  if (settings?.anthropic?.apiKey && typeof settings.anthropic.apiKey === 'string' && settings.anthropic.apiKey !== '') {
    settings.anthropic.apiKey = await encrypt(settings.anthropic.apiKey);
  }
}

async function decryptApiKeys(settings) {
  if (isEncrypted(settings?.openai?.apiKey)) {
    settings.openai.apiKey = await decrypt(settings.openai.apiKey);
  }
  if (isEncrypted(settings?.anthropic?.apiKey)) {
    settings.anthropic.apiKey = await decrypt(settings.anthropic.apiKey);
  }
}

// --- persistence ---

export async function persistSettings() {
  try {
    const clone = JSON.parse(JSON.stringify(state.settings));
    await encryptApiKeys(clone);
    const data = {
      settings: clone,
      viewMode: state.viewMode,
      activeProjectId: state.activeProjectId,
      activeBranchId: state.activeBranchId,
    };
    await chrome.storage.local.set({ [SETTINGS_KEY]: data });
  } catch (e) {
    console.error('[BranchAI] persistSettings', e);
  }
}

export async function persistProject(projectId) {
  const p = state.projects.find(x => x.id === projectId);
  if (!p) return;
  // Write entire project tree to IDB
  await putProjectWithChildren(p);
}

export async function persistBranchMessages(branchId) {
  // Find the branch in state
  for (const p of state.projects) {
    const b = p.branches.find(x => x.id === branchId);
    if (b) {
      // Write branch metadata to IDB
      const { messages, ...branchRecord } = b;
      branchRecord.projectId = p.id;
      await putBranch(branchRecord);
      // Write messages to IDB
      await replaceMessages(branchId, messages || []);
      return;
    }
  }
}

export async function persistBranchMetadata(branch, projectId) {
  const { messages, ...branchRecord } = branch;
  branchRecord.projectId = projectId;
  await putBranch(branchRecord);
}

// Compat shim — called by ui.js for viewMode/activeId changes
export async function persist() {
  await persistSettings();
}

// --- loading ---

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    const saved = result[SETTINGS_KEY];
    if (saved) {
      if (saved.settings) {
        await decryptApiKeys(saved.settings);
        Object.assign(state.settings, saved.settings);
      }
      if (saved.viewMode) state.viewMode = saved.viewMode;
      if (saved.activeProjectId) state.activeProjectId = saved.activeProjectId;
      if (saved.activeBranchId) state.activeBranchId = saved.activeBranchId;
    }
  } catch (e) {
    console.error('[BranchAI] loadSettings', e);
  }
}

async function reloadFromDB() {
  try {
    const projects = await getAllProjects();
    // Reconstruct nested tree
    const nested = [];
    for (const proj of projects) {
      const branches = await getBranchesForProject(proj.id);
      for (const b of branches) {
        const rawMsgs = await getMessagesForBranch(b.id);
        // Dedup: keep only the first message per seq value
        const seen = new Set();
        const uniqueMsgs = [];
        for (const m of rawMsgs) {
          if (!seen.has(m.seq)) {
            seen.add(m.seq);
            uniqueMsgs.push(m);
          }
        }
        // If duplicates were found, repair the IDB data
        if (uniqueMsgs.length < rawMsgs.length) {
          console.warn(`[BranchAI] Deduped branch ${b.id}: ${rawMsgs.length} → ${uniqueMsgs.length} messages`);
          const cleaned = uniqueMsgs.map(({ branchId, seq, ...msg }) => msg);
          await replaceMessages(b.id, cleaned);
          b.messages = cleaned;
        } else {
          b.messages = uniqueMsgs.map(({ branchId, seq, ...msg }) => msg);
        }
        delete b.projectId;
      }
      proj.branches = branches;
      nested.push(proj);
    }
    // Sort projects by updatedAt descending (most recent first)
    nested.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    state.projects = nested;
  } catch (e) {
    console.error('[BranchAI] reloadFromDB', e);
    state.projects = [];
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
    emoji: emoji || '',
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
      emoji: '',
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
  persistProject(pid);
  persistSettings();
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
    emoji: emoji || '',
    createdAt: ts,
    updatedAt: ts,
    branchedFromMsg,
    messages: Array.isArray(seedMessages) ? seedMessages.map(m => ({ ...m })) : [],
  };
  p.branches = [br, ...(p.branches || [])];
  p.updatedAt = ts;
  state.activeBranchId = br.id;
  normalizeState();
  persistProject(p.id);
  persistSettings();
  return br;
}

export function deleteProject(projectId) {
  state.projects = state.projects.filter(p => p.id !== projectId);
  normalizeState();
  deleteProjectFromDB(projectId);
  persistSettings();
}

export function deleteBranch(branchId) {
  const p = currentProject();
  if (!p) return;
  p.branches = p.branches.filter(b => b.id !== branchId);
  normalizeState();
  deleteBranchFromDB(branchId);
  persistSettings();
}

export function updateSettings(partial) {
  Object.assign(state.settings, partial);
  if (partial.ollama) Object.assign(state.settings.ollama, partial.ollama);
  if (partial.openai) Object.assign(state.settings.openai, partial.openai);
  if (partial.anthropic) Object.assign(state.settings.anthropic, partial.anthropic);
  persistSettings();
}

// --- boot ---

export async function loadInitial(injectedTranscript, anchorIdx = null, title = null) {
  // 1) load settings from chrome.storage.local
  await loadSettings();

  // 2) load projects/branches/messages from IndexedDB
  await reloadFromDB();

  normalizeState();

  // 3) if we got a transcript from the extension, create a new project
  if (Array.isArray(injectedTranscript) && injectedTranscript.length) {
    const cut = Number.isFinite(anchorIdx)
      ? Math.max(0, Math.min(anchorIdx, injectedTranscript.length - 1))
      : injectedTranscript.length - 1;
    const seed = injectedTranscript.slice(0, cut + 1);
    newProject(title || 'Branched Chat', seed, 'Branched from Chat');
  }

  // 4) if nothing exists, create a scratch project with an empty branch
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
  await persistSettings();
}
