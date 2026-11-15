// Server-only: loads the API keys from <repo>/.env (called from instrumentation.ts on startup,
// and quietly re-read on page loads so a key added to the file shows up without a restart).
import path from "node:path";
import { loadDotenv, missingKeys, windowOverrides } from "@utd/video/env";

const root = () => (process.env.UTD_REPO_DIR ? path.resolve(process.env.UTD_REPO_DIR) : path.resolve(process.cwd(), "..", ".."));

export const loadKeys = () => {
  const r = root();
  const { file, loaded, overridden } = loadDotenv(r);
  const missing = missingKeys();
  const where = file ? `from ${path.relative(r, file) || file}` : `no .env at ${r} (copy .env.example → .env)`;
  console.log(`[utd] keys ${where}${loaded.length ? `: ${loaded.join(", ")}` : ""}${missing.length ? ` · missing: ${missing.join(", ")}` : " · all keys set"}`);
  if (overridden.length) {
    console.log(`[utd] WARNING: this window has its own ${overridden.join(", ")} and it differs from .env — the window's value is being used. To use the file, close this window and start pnpm dev in a new one (or Remove-Item Env:${overridden[0]} first).`);
  }
};

/** Keys this window overrides with a different value than .env (so the UI can say so). */
export const overriddenKeys = () => windowOverrides(root());

let last = 0;
/** Re-read .env (added, changed or removed keys follow the file; window variables still win). Throttled to once per 2 s. */
export const refreshKeys = (force = false) => {
  const now = Date.now();
  if (!force && now - last < 2000) return;
  last = now;
  loadDotenv(root());
};
