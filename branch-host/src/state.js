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
    // Create a project and a first branch from the imported chat
    const pid = genId('prj');
    const bid = genId('br');
    const baseName = 'Branched from Chat';
    const cut = Number.isFinite(anchorIdx) ? Math.max(0, Math.min(anchorIdx, injectedTranscript.length-1)) : injectedTranscript.length-1;
    const initialMessages = injectedTranscript.slice(0, cut + 1);

    state.projects.unshift({
      id: pid,
      name: 'New Project',
      createdAt: now(),
      branches: [{
        id: bid,
        title: baseName,
        createdAt: now(),
        messages: initialMessages
      }]
    });
    state.activeProjectId = pid;
    state.activeBranchId = bid;
    await persist();
  }
}
