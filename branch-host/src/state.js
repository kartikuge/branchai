// state.js

import { genId, now } from './utils.js';

export const state = { projects: [], activeProjectId: null, activeBranchId: null };

// --- add this helper near the top ---
function normalizeState() {
  if (!Array.isArray(state.projects)) state.projects = [];
  for (const p of state.projects) {
    if (!Array.isArray(p.branches)) p.branches = [];
  }
  // fix active ids
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

export function currentProject() {
  return state.projects.find(p => p.id === state.activeProjectId) || null;
}
export function currentBranch() {
  const p = currentProject(); if (!p) return null;
  return p.branches.find(b => b.id === state.activeBranchId) || null;
}

export async function persist() {
  localStorage.setItem('stormai_state_v1', JSON.stringify(state));
}

/** Create a new project. If seedMessages are provided, also create the first branch. */
export function newProject(
  name = 'New Project',
  seedMessages = null,                 // Array<{role, content, ts?}> | null
  firstBranchTitle = 'Branched from Chat'
) {
  const pid = genId('prj');
  const proj = { id: pid, name, createdAt: now(), branches: [] };

  // If we received a transcript, create the first branch populated with it.
  if (Array.isArray(seedMessages) && seedMessages.length) {
    const bid = genId('br');
    const branch = {
      id: bid,
      title: firstBranchTitle,
      createdAt: now(),
      messages: [...seedMessages],
    };
    proj.branches.push(branch);
    state.activeBranchId = bid;
  }

  // Put newest project on top and set active
  state.projects = [proj, ...state.projects];
  state.activeProjectId = pid;

  normalizeState();
  persist(); // fire-and-forget
  return proj;
}


export async function loadInitial(injectedTranscript, anchorIdx = null) {
  // 1) load any saved state
  const raw = localStorage.getItem('stormai_state_v1');
  if (raw) Object.assign(state, JSON.parse(raw));
  normalizeState();

  // 2) if we got a transcript, create a new project + seeded first branch
  if (Array.isArray(injectedTranscript) && injectedTranscript.length) {
    const cut = Number.isFinite(anchorIdx)
      ? Math.max(0, Math.min(anchorIdx, injectedTranscript.length - 1))
      : injectedTranscript.length - 1;
    const seed = injectedTranscript.slice(0, cut + 1);
    newProject('New Project', seed, 'Branched from Chat'); // sets actives & persists
  }

  // 3) if still nothing to render, create an empty scratch project
  if (!state.projects.length) {
    newProject('Scratchpad');
  }

  // 4) final normalize + persist
  normalizeState();
  await persist();
}

/**
 * Create a new branch in the current project.
 * @param {string} title - Branch title
 * @param {Array<{role:string, content:string, ts?:number}>} seedMessages - Initial messages (optional)
 * @returns {object|null} new branch
 */
export function newBranch(title = 'New Branch', seedMessages = []) {
  const p = currentProject();
  if (!p) return null;
  const br = {
    id: genId('br'),
    title,
    createdAt: now(),
    messages: Array.isArray(seedMessages) ? [...seedMessages] : []
  };
  // put newest on top
  p.branches = [br, ...(p.branches || [])];
  state.activeBranchId = br.id;
  normalizeState();
  persist(); // fire-and-forget
  return br;
}
