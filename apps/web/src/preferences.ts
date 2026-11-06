export function readPreference(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function writePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* A browser without storage can still play. */ }
}
