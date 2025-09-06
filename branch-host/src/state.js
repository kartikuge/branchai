// WHY: central in-memory state + load/save to DB to keep modules decoupled.
import * as db from './db.js';
import { genId, now } from './utils.js';

export const state = {
  projects: [],   // [{id,name,updatedAt}]
  branches: [],   // [{id,projectId,parentId,title,model,updatedAt,messages:[]}]
  currentProjectId: null,
  currentBranchId: null,
  updatedAt: null
};

export async function loadInitial(injectedTranscript) {
  const cached = await db.get('stormai');
  if (cached) Object.assign(state, cached);

  if (Array.isArray(injectedTranscript) && injectedTranscript.length) {
    const pid = genId('p'); const bid = genId('b');
    state.projects.push({ id: pid, name: 'New Project', updatedAt: now() });
    state.branches.push({
      id: bid, projectId: pid, parentId: null, title: 'Branched from Chat',
      model: null, updatedAt: now(), messages: injectedTranscript
    });
    state.currentProjectId = pid;
    state.currentBranchId  = bid;
  }
  await persist();
}

export async function persist() {
  state.updatedAt = now();
  await db.put('stormai', state);
}

export function currentProject() {
  return state.projects.find(p=>p.id===state.currentProjectId) || null;
}
export function currentBranch() {
  return state.branches.find(b=>b.id===state.currentBranchId) || null;
}

export function newProject(name='New Project') {
  const pid = genId('p');
  const p = { id: pid, name, updatedAt: now() };
  state.projects.unshift(p);
  state.currentProjectId = pid;
  state.currentBranchId = null;
  return p;
}

export function newBranch({projectId, parentId=null, title='New Branch', model=null, messages=[]}) {
  const bid = genId('b');
  const b = { id: bid, projectId, parentId, title, model, updatedAt: now(), messages };
  state.branches.unshift(b);
  state.currentBranchId = bid;
  return b;
}
