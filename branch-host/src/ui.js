// WHY: pure rendering + event wiring. Keeps DOM concerns out of state/model.
import { state, currentProject, currentBranch, persist, newProject, newBranch } from './state.js';
import { escapeHtml, estimateTokens, now } from './utils.js';

const $ = (id) => document.getElementById(id);

export function bindStaticControls({ onRun, onCopy, onImport, onExport, onBranchHere, onModelChange }) {
  $('runBtn').onclick = onRun;
  $('copyBtn').onclick = onCopy;
  $('importBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = onImport;
  $('exportBtn').onclick = onExport;
  $('branchHereBtn').onclick = onBranchHere;
  $('modelSel').onchange = onModelChange;
  $('newProjectBtn').onclick = async () => { newProject(); await persist(); renderAll(); };
  $('newBranchBtn').onclick = async () => {
    const pid = state.currentProjectId || state.projects[0]?.id;
    if (!pid) return alert('Create a project first.');
    newBranch({ projectId: pid, title: 'New Branch' });
    await persist(); renderAll();
  };
  $('projectName').onchange = async () => {
    const p = currentProject(); if (!p) return;
    p.name = $('projectName').value.trim() || 'Untitled';
    p.updatedAt = now(); await persist(); renderProjects();
  };
}

export function updateStorageStatus(text='storage: local') {
  const el = $('storageStatus'); el.textContent = text; el.className = 'pill muted';
}

export function setModelStatus(text, level='') {
  const el = $('modelStatus'); el.textContent = text;
  el.className = 'pill ' + (level==='ok'?'status-ok':level==='bad'?'status-bad':'');
}

export function renderAll() { renderProjects(); renderBranches(); renderTranscript(); }

export function renderProjects() {
  const wrap = $('projects'); wrap.innerHTML = '';
  state.projects.sort((a,b)=>b.updatedAt-a.updatedAt).forEach(p => {
    const div = document.createElement('div');
    div.className = 'list-item' + (p.id===state.currentProjectId?' active':'');
    div.textContent = p.name || '(unnamed)'; div.title = new Date(p.updatedAt).toLocaleString();
    div.onclick = async () => { state.currentProjectId = p.id; state.currentBranchId = null; await persist(); renderAll(); };
    wrap.appendChild(div);
  });
  const cp = currentProject();
  $('projectName').value = cp ? cp.name : '';
}

export function renderBranches() {
  const wrap = $('branches'); wrap.innerHTML = '';
  const list = state.branches.filter(b=>b.projectId===state.currentProjectId);
  list.sort((a,b)=>b.updatedAt-a.updatedAt).forEach(b => {
    const div = document.createElement('div');
    div.className = 'list-item' + (b.id===state.currentBranchId?' active':'');
    div.textContent = b.title || '(untitled branch)'; div.title = new Date(b.updatedAt).toLocaleString();
    div.onclick = async () => { state.currentBranchId = b.id; await persist(); renderAll(); };
    wrap.appendChild(div);
  });
}

export function renderTranscript() {
  const tp = $('transcript'); tp.innerHTML = '';
  const b = currentBranch();
  if (!b) { tp.innerHTML = '<p class="muted">No branch selected.</p>'; $('tokenInfo').textContent='~0 tokens'; return; }
  const frag = document.createDocumentFragment();
  b.messages.forEach((m, idx) => {
    const d = document.createElement('div');
    d.className = 'msg ' + (m.role === 'assistant' ? 'assistant' : 'user');
    d.innerHTML = `
      <div class="role">${m.role}</div>
      <div class="content">${escapeHtml(m.content)}</div>
      <div class="row" style="margin-top:6px">
        <button class="btn" data-idx="${idx}">Branch from here</button>
      </div>`;
    d.querySelector('button').onclick = () => branchFromIndex(idx);
    frag.appendChild(d);
  });
  tp.appendChild(frag);
  $('tokenInfo').textContent = `~${estimateTokens(b.messages)} ctx tokens`;
}

async function branchFromIndex(idx) {
  const cur = currentBranch(); if (!cur) return;
  const slice = cur.messages.slice(0, idx+1);
  const child = newBranch({ projectId: cur.projectId, parentId: cur.id, title: `Branch of ${cur.title}`, messages: slice });
  await persist(); renderBranches(); renderTranscript();
}
