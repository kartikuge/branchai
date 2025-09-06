// WHY: users fully own their data; no server. Export/Import is the contract.
import { state, currentProject, persist } from './state.js';
import { genId, now } from './utils.js';
import { renderAll } from './ui.js';

export function exportCurrentProject() {
  const p = currentProject(); if (!p) { alert('No project selected.'); return; }
  const branches = state.branches.filter(b=>b.projectId===p.id);
  const payload = {
    type: "stormai-project",
    version: 1,
    createdAt: p.createdAt || now(),
    updatedAt: now(),
    project: { id: p.id, name: p.name },
    branches: branches.map(b=>({
      id: b.id, parentId: b.parentId, title: b.title, model: b.model, updatedAt: b.updatedAt, messages: b.messages
    })),
    meta: { app: "StormAI v1" }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const safe = (p.name || 'StormAIProject').replace(/[^a-z0-9-_]+/ig,'_');
  a.download = `${safe}.stormai.json`; a.click(); URL.revokeObjectURL(a.href);
}

export async function importFromFile(file) {
  const text = await file.text();
  let data; try { data = JSON.parse(text); } catch { alert('Invalid JSON.'); return; }
  if (data.type !== 'stormai-project' || !Array.isArray(data.branches)) { alert('Not a StormAI project export.'); return; }
  const pid = genId('p');
  state.projects.unshift({ id: pid, name: data.project?.name || 'Imported Project', updatedAt: now() });
  const remap = new Map();
  (data.branches||[]).forEach(br => {
    const nid = genId('b'); remap.set(br.id, nid);
    state.branches.push({
      id: nid,
      projectId: pid,
      parentId: br.parentId ? remap.get(br.parentId) || null : null,
      title: br.title || 'Branch',
      model: br.model || null,
      updatedAt: now(),
      messages: (br.messages||[]).map(m => ({ role: m.role==='assistant'?'assistant':'user', content: String(m.content||''), ts: m.ts||now() }))
    });
  });
  state.currentProjectId = pid;
  state.currentBranchId  = state.branches.find(b=>b.projectId===pid)?.id || null;
  await persist(); renderAll();
}
