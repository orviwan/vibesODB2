// vibesODB2 Client-Side Storage Engine (IndexedDB with localStorage fallback)

const DB_NAME = 'vibesodb2_db';
const DB_VERSION = 1;

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('backups')) {
          const store = db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
          store.createIndex('vin', 'vin', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains('custom_features')) {
          const store = db.createObjectStore('custom_features', { keyPath: 'id', autoIncrement: true });
          store.createIndex('schema_target', 'schema_target', { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => resolve(null);
    });
  }
  return dbPromise;
}

export async function saveBackup({ vin, moduleAddress, did, rawHex, notes = '' }) {
  const record = {
    vin: vin || 'WV2ZZZ7EZBH000000',
    module_address: moduleAddress,
    did: did || '0600',
    raw_hex_data: rawHex,
    notes: notes || 'Pre-write automated safety snapshot',
    timestamp: new Date().toISOString()
  };

  const db = await getDb();
  if (db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('backups', 'readwrite');
      const store = tx.objectStore('backups');
      const req = store.add(record);
      req.onsuccess = (e) => {
        record.id = e.target.result;
        resolve(record);
      };
      req.onerror = () => resolve(saveBackupLocalStorage(record));
    });
  } else {
    return saveBackupLocalStorage(record);
  }
}

function saveBackupLocalStorage(record) {
  const backups = JSON.parse(localStorage.getItem('vibesodb2_backups') || '[]');
  record.id = Date.now();
  backups.unshift(record);
  localStorage.setItem('vibesodb2_backups', JSON.stringify(backups));
  return record;
}

export async function getBackups() {
  const db = await getDb();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction('backups', 'readonly');
      const store = tx.objectStore('backups');
      const req = store.getAll();
      req.onsuccess = (e) => {
        const results = e.target.result || [];
        results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        resolve(results);
      };
      req.onerror = () => resolve(getBackupsLocalStorage());
    });
  } else {
    return getBackupsLocalStorage();
  }
}

function getBackupsLocalStorage() {
  return JSON.parse(localStorage.getItem('vibesodb2_backups') || '[]');
}

export async function deleteBackup(id) {
  const db = await getDb();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction('backups', 'readwrite');
      const store = tx.objectStore('backups');
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } else {
    let backups = getBackupsLocalStorage();
    backups = backups.filter(b => b.id !== id);
    localStorage.setItem('vibesodb2_backups', JSON.stringify(backups));
    return true;
  }
}

export async function saveCustomFeature(feature) {
  const db = await getDb();
  const item = { ...feature, created_at: new Date().toISOString() };
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction('custom_features', 'readwrite');
      const store = tx.objectStore('custom_features');
      const req = store.add(item);
      req.onsuccess = (e) => {
        item.id = e.target.result;
        resolve(item);
      };
      req.onerror = () => resolve(saveCustomFeatureLocalStorage(item));
    });
  } else {
    return saveCustomFeatureLocalStorage(item);
  }
}

function saveCustomFeatureLocalStorage(item) {
  const list = JSON.parse(localStorage.getItem('vibesodb2_custom_features') || '[]');
  item.id = Date.now();
  list.push(item);
  localStorage.setItem('vibesodb2_custom_features', JSON.stringify(list));
  return item;
}

export async function getCustomFeatures() {
  const db = await getDb();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction('custom_features', 'readonly');
      const store = tx.objectStore('custom_features');
      const req = store.getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = () => resolve(getCustomFeaturesLocalStorage());
    });
  } else {
    return getCustomFeaturesLocalStorage();
  }
}

function getCustomFeaturesLocalStorage() {
  return JSON.parse(localStorage.getItem('vibesodb2_custom_features') || '[]');
}

export async function getBackupById(id) {
  const backups = await getBackups();
  return backups.find(b => b.id === id) || null;
}

export async function exportBackupsJson() {
  const backups = await getBackups();
  return JSON.stringify(backups, null, 2);
}

export async function importBackupsJson(jsonString) {
  const items = JSON.parse(jsonString);
  const imported = [];
  if (Array.isArray(items)) {
    for (const item of items) {
      const saved = await saveBackup({
        vin: item.vin,
        moduleAddress: item.module_address || item.moduleAddress || item.targetModule,
        did: item.did,
        rawHex: item.raw_hex_data || item.rawHex || item.baselineHex,
        notes: item.notes || 'Imported backup'
      });
      imported.push(saved);
    }
  }
  return imported;
}

export function exportBackupsToJson(backups) {
  const blob = new Blob([JSON.stringify(backups, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vibesodb2_backups_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
