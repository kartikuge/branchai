// state.js

import { genId, now } from './utils.js';

export const state = { projects: [], activeProjectId: null, activeBranchId: null };

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

export async function loadInitial(injectedTranscript, anchorIdx = null) {
  const raw = localStorage.getItem('stormai_state_v1');
  if (raw) Object.assign(state, JSON.parse(raw));

  if (!state.projects.length) {
    state.projects = [];
    state.activeProjectId = null;
    state.activeBranchId = null;
  }

  if (injectedTranscript?.length) {
    const pid = genId('prj');
    const bid = genId('br');
    const cut = Number.isFinite(anchorIdx)
      ? Math.max(0, Math.min(anchorIdx, injectedTranscript.length - 1))
      : injectedTranscript.length - 1;

    state.projects.unshift({
      id: pid,
      name: 'New Project',
      createdAt: now(),
      branches: [{
        id: bid,
        title: 'Branched from Chat',
        createdAt: now(),
        messages: injectedTranscript.slice(0, cut + 1)
      }]
    });
    state.activeProjectId = pid;
    state.activeBranchId = bid;
    await persist();
  }
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
  persist(); // fire-and-forget
  return br;
}
