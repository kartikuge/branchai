// migration.js — one-time migration from chrome.storage.local blob to IndexedDB

import { putProjectWithChildren } from './db.js';

const LEGACY_KEY = 'branchai_state_v2';
const MIGRATED_FLAG = 'branchai_idb_migrated_v1';
export const SETTINGS_KEY = 'branchai_settings_v1';

/**
 * Migrate legacy state blob into IndexedDB if not already done.
 * Returns true if migration was performed, false otherwise.
 */
export async function migrateIfNeeded() {
  try {
    const flags = await chrome.storage.local.get(MIGRATED_FLAG);
    if (flags[MIGRATED_FLAG]) return false; // already migrated (or failed)

    const result = await chrome.storage.local.get(LEGACY_KEY);
    const legacy = result[LEGACY_KEY];

    if (!legacy || !Array.isArray(legacy.projects) || !legacy.projects.length) {
      // No data to migrate — just set the flag
      await chrome.storage.local.set({ [MIGRATED_FLAG]: true });
      return false;
    }

    // Migrate each project into IndexedDB
    let count = 0;
    for (const project of legacy.projects) {
      // Normalize: ensure branches have projectId
      for (const branch of (project.branches || [])) {
        branch.projectId = project.id;
        if (!branch.summary) branch.summary = '';
        if (branch.summaryMsgCount == null) branch.summaryMsgCount = 0;
        if (!branch.description) branch.description = '';
        if (branch.branchedFromMsg === undefined) branch.branchedFromMsg = null;
      }
      await putProjectWithChildren(project);
      count++;
    }

    // Write settings to new key
    const settings = {
      settings: legacy.settings || {},
      viewMode: legacy.viewMode || 'list',
      activeProjectId: legacy.activeProjectId || null,
      activeBranchId: legacy.activeBranchId || null,
    };
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });

    // Back up legacy data (do NOT delete original)
    await chrome.storage.local.set({ branchai_legacy_backup: legacy });

    // Set migrated flag
    await chrome.storage.local.set({ [MIGRATED_FLAG]: true });

    console.log(`[BranchAI] Migrated ${count} projects to IndexedDB`);
    return true;
  } catch (e) {
    console.error('[BranchAI] Migration failed', e);
    // Prevent infinite retries
    try {
      await chrome.storage.local.set({ [MIGRATED_FLAG]: 'failed' });
    } catch { /* ignore */ }
    return false;
  }
}
