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

export function renderAll() { 
    const p = currentProject();

  // SAFE EMPTY VIEW if nothing is loaded yet (e.g., first boot, no transcript injected yet)
  if (!p) {
    const $ = (id) => document.getElementById(id);
    if ($('projects'))   $('projects').innerHTML   = '<div class="muted">No project yet</div>';
    if ($('branches'))   $('branches').innerHTML   = '';
    if ($('transcript')) $('transcript').innerHTML = '';
    if ($('out'))        $('out').textContent      = '';
    return;
  }

  // normal render flow
  renderProjects();
  renderBranches();
  renderTranscript();
 }

export function renderProjects() {
  const projects = Array.isArray(state.projects) ? state.projects : [];   // GUARD
  const el = document.getElementById('projects');
  if (!el) return;

  el.innerHTML = projects.map(p => `
    <div class="project-item ${p.id === state.activeProjectId ? 'active' : ''}" data-project="${p.id}">
      <span>${p.name}</span>
    </div>
  `).join('');

  el.querySelectorAll('.project-item').forEach(node => {
    node.addEventListener('click', () => {
      state.activeProjectId = node.dataset.project;
      // also ensure an active branch exists
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
}

export function renderBranches() {
  const p = currentProject();
  const branches = Array.isArray(p?.branches) ? p.branches : [];  // GUARD

  const el = document.getElementById('branches');
  if (!el) return;

  el.innerHTML = branches.map(b => `
    <div class="branch-item ${b.id === state.activeBranchId ? 'active' : ''}" data-branch="${b.id}">
      <span>${b.title}</span>
    </div>
  `).join('');

  // (re)bind clicks to switch active branch…
  el.querySelectorAll('.branch-item').forEach(node => {
    node.addEventListener('click', () => {
      state.activeBranchId = node.dataset.branch;
      persist();
      renderAll();
    });
  });
}

export function renderTranscript() {
  const b = currentBranch();
  const messages = Array.isArray(b?.messages) ? b.messages : [];   // GUARD
  const el = document.getElementById('transcript');
  if (!el) return;

  el.innerHTML = messages.map((m, idx) => `
    <div class="msg ${m.role}">
      <div class="meta">
        <button class="branch-here" data-idx="${idx}">Branch from here</button>
      </div>
      <div class="content">${m.content}</div>
    </div>
  `).join('');

  // “Branch from here” creates a new branch with messages up to idx
  el.querySelectorAll('.branch-here').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      const seed = messages.slice(0, i + 1);
      const nb = newBranch(`Branch of ${b?.title || 'Untitled'}`, seed);
      if (nb) {
        persist();
        renderAll();
      }
    });
  });
}

async function branchFromIndex(idx) {
  const cur = currentBranch(); if (!cur) return;
  const slice = cur.messages.slice(0, idx+1);
  const child = newBranch({ projectId: cur.projectId, parentId: cur.id, title: `Branch of ${cur.title}`, messages: slice });
  await persist(); renderBranches(); renderTranscript();
}
