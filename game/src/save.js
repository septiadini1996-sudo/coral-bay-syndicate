// Save games for Coral Bay Syndicate: money, story progress and lifetime stats
// in one small localStorage record, so Continue picks Rico's career back up.
const KEY = 'coral-bay-syndicate-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.money !== 'number') return null;
    return data;
  } catch { return null; }
}

export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode: play on unsaved */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
