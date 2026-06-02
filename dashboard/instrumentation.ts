/**
 * Next.js instrumentation hook — runs before the server starts.
 *
 * Node.js 24+ exposes a partial `localStorage` global (empty object, no methods).
 * Next.js 15's dev overlay calls `localStorage.getItem()` unconditionally,
 * which throws "localStorage.getItem is not a function" on Node 24/25.
 *
 * This polyfill replaces the broken stub with a proper in-memory Storage
 * implementation so the server starts cleanly. It has no effect in the browser.
 */
export async function register() {
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.localStorage !== 'undefined' &&
    typeof (globalThis.localStorage as Storage).getItem !== 'function'
  ) {
    const store: Record<string, string> = {};
    (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
      getItem:    (k: string) => store[k] ?? null,
      setItem:    (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
      clear:      () => { Object.keys(store).forEach(k => delete store[k]); },
      key:        (n: number) => Object.keys(store)[n] ?? null,
      get length() { return Object.keys(store).length; },
    };
  }
}
