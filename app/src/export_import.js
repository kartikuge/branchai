// export_import.js — project export/import
import { state, currentProject, persistProject, persistSettings } from './state.js';
import { genId, now } from './utils.js';

export function exportCurrentProject() {
  const p = currentProject();
  if (!p) return alert('No project to export.');

  const data = {
    name: p.name,
    description: p.description || '',
    emoji: p.emoji || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    branches: (p.branches || []).map(b => ({
      title: b.title,
      description: b.description || '',
      emoji: b.emoji || '',
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      branchedFromMsg: b.branchedFromMsg ?? null,
      summary: b.summary || '',
      summaryMsgCount: b.summaryMsgCount || 0,
      messages: b.messages || [],
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${p.name}.branchai.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromFile(file) {
  if (!file) return;

  const text = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file');
  }

  if (!data.name || !Array.isArray(data.branches)) {
    throw new Error('Invalid BranchAI file: must have "name" and "branches"');
  }

  const pid = genId('prj');
  const ts = now();
  const proj = {
    id: pid,
    name: data.name,
    description: data.description || '',
    emoji: data.emoji || '',
    createdAt: data.createdAt || ts,
    updatedAt: data.updatedAt || ts,
    branches: data.branches.map(b => ({
      id: genId('br'),
      title: b.title || 'Imported Branch',
      description: b.description || '',
      emoji: b.emoji || '',
      createdAt: b.createdAt || ts,
      updatedAt: b.updatedAt || ts,
      branchedFromMsg: b.branchedFromMsg ?? null,
      summary: b.summary || '',
      summaryMsgCount: b.summaryMsgCount || 0,
      messages: Array.isArray(b.messages) ? b.messages.map(m => ({ ...m })) : [],
    })),
  };

  state.projects.unshift(proj);
  state.activeProjectId = pid;
  state.activeBranchId = proj.branches[0]?.id || null;
  await persistProject(pid);
  await persistSettings();
}
