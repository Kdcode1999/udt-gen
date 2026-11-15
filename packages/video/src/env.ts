// Loads KEY=value lines from `.env` (and `.env.local`) at the repo root into process.env,
// so the API keys are typed once instead of in every PowerShell window.
// A value already set in the window always wins over the file. Server/CLI only — never import from a scene.
import fs from "node:fs";
import path from "node:path";

const LINE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

const unquote = (raw: string): string => {
  let v = raw.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1);
  const hash = v.indexOf(" #");
  if (hash >= 0) v = v.slice(0, hash).trim();
  return v;
};

/** Parse one dotenv file. Blank lines and `#` comments are skipped; empty values are ignored. */
export const parseDotenv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = LINE.exec(t);
    if (!m) continue;
    const v = unquote(m[2]);
    if (v) out[m[1]] = v;
  }
  return out;
};

/**
 * Keys whose current value came from the file (so a later edit of the file may replace them).
 * Kept on the process, not the module: Next.js loads this module once for the startup hook and again
 * for the routes, and both must agree on where a value came from.
 */
const fromFile: Set<string> = ((globalThis as unknown as { __utdEnvFromFile?: Set<string> }).__utdEnvFromFile ??= new Set<string>());

/**
 * Load `<root>/.env.local` then `<root>/.env` into process.env. A value the window set always wins;
 * values that came from the file follow the file, so editing `.env` and saving is enough — no restart.
 * Returns the names that came from the files (for a one-line startup log).
 */
export const loadDotenv = (root: string): { file: string | null; loaded: string[] } => {
  const loaded: string[] = [];
  const seen = new Set<string>();
  let file: string | null = null;
  for (const name of [".env.local", ".env"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    file ??= p;
    let text = "";
    try {
      text = fs.readFileSync(p, "utf8");
    } catch {
      continue;
    }
    for (const [k, v] of Object.entries(parseDotenv(text))) {
      if (seen.has(k)) continue; // .env.local already supplied it
      seen.add(k);
      if (process.env[k] && !fromFile.has(k)) continue; // window / real environment wins
      if (process.env[k] !== v) process.env[k] = v;
      fromFile.add(k);
      loaded.push(k);
    }
  }
  // a key removed from the file goes away too (only if the file was its source)
  for (const k of [...fromFile]) {
    if (seen.has(k)) continue;
    delete process.env[k];
    fromFile.delete(k);
  }
  return { file, loaded };
};

/** The keys the app cares about, so startup can say which are still missing. */
export const KNOWN_KEYS = ["ELEVENLABS_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY"] as const;

export const missingKeys = (): string[] => KNOWN_KEYS.filter((k) => !process.env[k]);
