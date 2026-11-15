// Server-only: loads the API keys from <repo>/.env (called from instrumentation.ts on startup,
// and quietly re-read on page loads so a key added to the file shows up without a restart).
import path from "node:path";
import { loadDotenv, missingKeys } from "@utd/video/env";

const root = () => (process.env.UTD_REPO_DIR ? path.resolve(process.env.UTD_REPO_DIR) : path.resolve(process.cwd(), "..", ".."));

export const loadKeys = () => {
  const r = root();
  const { file, loaded } = loadDotenv(r);
  const missing = missingKeys();
  const where = file ? `from ${path.relative(r, file) || file}` : `no .env at ${r} (copy .env.example → .env)`;
  console.log(`[utd] keys ${where}${loaded.length ? `: ${loaded.join(", ")}` : ""}${missing.length ? ` · missing: ${missing.join(", ")}` : " · all keys set"}`);
};

let last = 0;
/** Re-read .env for keys that are still missing (never overrides a set one). Throttled to once per 2 s. */
export const refreshKeys = () => {
  const now = Date.now();
  if (now - last < 2000) return;
  last = now;
  if (missingKeys().length) loadDotenv(root());
};
