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
 * Load `<root>/.env.local` then `<root>/.env` into process.env without overriding anything the
 * window already set. Returns the names that came from the files (for a one-line startup log).
 */
export const loadDotenv = (root: string): { file: string | null; loaded: string[] } => {
  const loaded: string[] = [];
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
      if (process.env[k]) continue; // window / real environment wins
      process.env[k] = v;
      loaded.push(k);
    }
  }
  return { file, loaded };
};

/** The keys the app cares about, so startup can say which are still missing. */
export const KNOWN_KEYS = ["ELEVENLABS_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY"] as const;

export const missingKeys = (): string[] => KNOWN_KEYS.filter((k) => !process.env[k]);
