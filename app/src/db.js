// db.js — IndexedDB wrapper for BranchAI per-record storage

const DB_NAME = 'branchai_db';
const DB_VERSION = 1;

let _dbPromise = null;

export function getDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // projects store
      if (!db.objectStoreNames.contains('projects')) {
        const ps = db.createObjectStore('projects', { keyPath: 'id' });
        ps.createIndex('updatedAt', 'updatedAt');
      }

      // branches store
      if (!db.objectStoreNames.contains('branches')) {
        const bs = db.createObjectStore('branches', { keyPath: 'id' });
        bs.createIndex('by_project', 'projectId');
        bs.createIndex('updatedAt', 'updatedAt');
      }

      // messages store (auto-increment key)
      if (!db.objectStoreNames.contains('messages')) {
        const ms = db.createObjectStore('messages', { autoIncrement: true });
        ms.createIndex('by_branch', 'branchId');
        ms.createIndex('by_branch_seq', ['branchId', 'seq']);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.error('[BranchAI IDB] open error', req.error);
      _dbPromise = null;
      reject(req.error);
    };
  });
  return _dbPromise;
}

// --- helpers ---

function tx(db, stores, mode = 'readonly') {
  return db.transaction(stores, mode);
}

function req2p(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx2p(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('transaction aborted'));
  });
}

// --- projects ---

export async function getAllProjects() {
  try {
    const db = await getDB();
    const t = tx(db, 'projects');
    const store = t.objectStore('projects');
    return await req2p(store.getAll());
  } catch (e) {
    console.error('[BranchAI IDB] getAllProjects', e);
    return [];
  }
}

export async function getProject(id) {
  try {
    const db = await getDB();
    const t = tx(db, 'projects');
    return await req2p(t.objectStore('projects').get(id)) || null;
  } catch (e) {
    console.error('[BranchAI IDB] getProject', e);
    return null;
  }
}

export async function putProject(obj) {
  try {
    const db = await getDB();
    const t = tx(db, 'projects', 'readwrite');
    t.objectStore('projects').put(obj);
    await tx2p(t);
  } catch (e) {
    console.error('[BranchAI IDB] putProject', e);
  }
}

export async function deleteProjectFromDB(id) {
  try {
    const db = await getDB();
    const t = tx(db, ['projects', 'branches', 'messages'], 'readwrite');

    // delete project
    t.objectStore('projects').delete(id);

    // find and delete branches + their messages
    const branchStore = t.objectStore('branches');
    const msgStore = t.objectStore('messages');
    const branches = await req2p(branchStore.index('by_project').getAll(id));
    for (const b of branches) {
      // delete messages for this branch
      const msgKeys = await req2p(msgStore.index('by_branch').getAllKeys(b.id));
      for (const k of msgKeys) msgStore.delete(k);
      // delete branch
      branchStore.delete(b.id);
    }

    await tx2p(t);
  } catch (e) {
    console.error('[BranchAI IDB] deleteProjectFromDB', e);
  }
}

// --- branches ---

export async function getBranchesForProject(projectId) {
  try {
    const db = await getDB();
    const t = tx(db, 'branches');
    return await req2p(t.objectStore('branches').index('by_project').getAll(projectId));
  } catch (e) {
    console.error('[BranchAI IDB] getBranchesForProject', e);
    return [];
  }
}

export async function getBranch(id) {
  try {
    const db = await getDB();
    const t = tx(db, 'branches');
    return await req2p(t.objectStore('branches').get(id)) || null;
  } catch (e) {
    console.error('[BranchAI IDB] getBranch', e);
    return null;
  }
}

export async function putBranch(obj) {
  try {
    const db = await getDB();
    const t = tx(db, 'branches', 'readwrite');
    t.objectStore('branches').put(obj);
    await tx2p(t);
  } catch (e) {
    console.error('[BranchAI IDB] putBranch', e);
  }
}

export async function deleteBranchFromDB(id) {
  try {
    const db = await getDB();
    const t = tx(db, ['branches', 'messages'], 'readwrite');

    // delete messages for this branch
    const msgStore = t.objectStore('messages');
    const msgKeys = await req2p(msgStore.index('by_branch').getAllKeys(id));
    for (const k of msgKeys) msgStore.delete(k);

    // delete branch
    t.objectStore('branches').delete(id);
    await tx2p(t);
  } catch (e) {
    console.error('[BranchAI IDB] deleteBranchFromDB', e);
  }
}

// --- messages ---

export async function getMessagesForBranch(branchId) {
  try {
    const db = await getDB();
    const t = tx(db, 'messages');
    const idx = t.objectStore('messages').index('by_branch_seq');
    const range = IDBKeyRange.bound([branchId, 0], [branchId, Infinity]);
    return await req2p(idx.getAll(range));
  } catch (e) {
    console.error('[BranchAI IDB] getMessagesForBranch', e);
    return [];
  }
}

export async function replaceMessages(branchId, msgs) {
  try {
    const db = await getDB();
    const t = tx(db, 'messages', 'readwrite');
    const store = t.objectStore('messages');

    // delete existing messages for this branch
    const keys = await req2p(store.index('by_branch').getAllKeys(branchId));
    for (const k of keys) store.delete(k);

    // write new messages with seq
    for (let i = 0; i < msgs.length; i++) {
      store.add({ ...msgs[i], branchId, seq: i });
    }

    await tx2p(t);
  } catch (e) {
    console.error('[BranchAI IDB] replaceMessages', e);
  }
}

export async function appendMessage(branchId, msg, seq) {
  try {
    const db = await getDB();
    const t = tx(db, 'messages', 'readwrite');
    t.objectStore('messages').add({ ...msg, branchId, seq });
    await tx2p(t);
  } catch (e) {
    console.error('[BranchAI IDB] appendMessage', e);
  }
}

// --- bulk operations ---

export async function putProjectWithChildren(nestedProject) {
  try {
    const db = await getDB();
    const t = tx(db, ['projects', 'branches', 'messages'], 'readwrite');
    const projStore = t.objectStore('projects');
    const branchStore = t.objectStore('branches');
    const msgStore = t.objectStore('messages');

    // write project record (without branches array)
    const { branches, ...projRecord } = nestedProject;
    projStore.put(projRecord);

    // write each branch + its messages
    for (const branch of (branches || [])) {
      const { messages, ...branchRecord } = branch;
      branchRecord.projectId = nestedProject.id;
      branchStore.put(branchRecord);

      // write messages with seq
      for (let i = 0; i < (messages || []).length; i++) {
        msgStore.add({ ...messages[i], branchId: branch.id, seq: i });
      }
    }

    await tx2p(t);
  } catch (e) {
    console.error('[BranchAI IDB] putProjectWithChildren', e);
  }
}

export async function exportProjectTree(projectId) {
  try {
    const db = await getDB();
    const t = tx(db, ['projects', 'branches', 'messages']);

    const project = await req2p(t.objectStore('projects').get(projectId));
    if (!project) return null;

    const branches = await req2p(t.objectStore('branches').index('by_project').getAll(projectId));

    const msgIdx = t.objectStore('messages').index('by_branch_seq');
    for (const b of branches) {
      const range = IDBKeyRange.bound([b.id, 0], [b.id, Infinity]);
      const rawMsgs = await req2p(msgIdx.getAll(range));
      // strip IDB metadata from messages
      b.messages = rawMsgs.map(({ branchId, seq, ...msg }) => msg);
      // remove projectId from branch (it's part of the nested tree)
      delete b.projectId;
    }

    project.branches = branches;
    return project;
  } catch (e) {
    console.error('[BranchAI IDB] exportProjectTree', e);
    return null;
  }
}
