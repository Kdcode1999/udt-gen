// Background jobs: spawn the CLI scripts (vo / render / still) and expose progress.
// In-memory registry + a log file per job under videos/<slug>/out/jobs/.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PKG_DIR, videoDir } from "./store";

export type JobKind = "vo" | "render" | "stills" | "draft" | "images";
export type JobStatus = "running" | "done" | "failed";
export type Job = {
  id: string;
  slug: string;
  kind: JobKind;
  status: JobStatus;
  progress: number; // 0..1 (render only, parsed from log)
  startedAt: number;
  endedAt?: number;
  message: string; // last meaningful log line
  logFile: string;
  exitCode?: number;
  lines?: string[]; // in-process jobs log here instead of a file
};

type Registry = { jobs: Map<string, Job>; latest: Map<string, Job> };
// survive Next.js dev-mode module reloads
const g = globalThis as unknown as { __utdJobs?: Registry };
const reg: Registry = g.__utdJobs ?? (g.__utdJobs = { jobs: new Map(), latest: new Map() });

export const getJob = (id: string) => reg.jobs.get(id) ?? null;
export const latestJob = (slug: string) => reg.latest.get(slug) ?? null;
export const isBusy = (slug: string) => latestJob(slug)?.status === "running";

export const tailLog = (job: Job, lines = 40): string => {
  if (job.lines) return job.lines.slice(-lines).join("\n");
  try {
    const txt = fs.readFileSync(job.logFile, "utf8");
    return txt
      .split(/\r?\n/)
      .filter((l) => l.trim() && !STRIP.test(l))
      .slice(-lines)
      .join("\n");
  } catch {
    return "";
  }
};

const STRIP = /Detected differing memory|Memory reported by|--memory flag|Using the lower amount/;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

export const startJob = (slug: string, kind: JobKind, args: string[] = []): Job => {
  if (isBusy(slug)) throw new Error("a job is already running for this video");
  const dir = videoDir(slug);
  const jobsDir = path.join(dir, "out", "jobs");
  fs.mkdirSync(jobsDir, { recursive: true });
  const id = `${kind}-${Date.now().toString(36)}`;
  const logFile = path.join(jobsDir, `${id}.log`);
  const job: Job = { id, slug, kind, status: "running", progress: 0, startedAt: Date.now(), message: "starting…", logFile };
  reg.jobs.set(id, job);
  reg.latest.set(slug, job);

  const script = kind === "vo" ? "vo" : kind === "render" ? "render" : kind === "images" ? "images" : "still";
  const child = spawn("pnpm", [script, slug, ...args], {
    cwd: PKG_DIR,
    shell: process.platform === "win32",
    env: { ...process.env, FORCE_COLOR: "0", UTD_VIDEOS_DIR: path.dirname(dir) },
  });
  const log = fs.createWriteStream(logFile);
  let firstError: string | null = null;
  const onData = (buf: Buffer) => {
    const text = buf.toString().replace(ANSI, "");
    log.write(text);
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim();
      if (!l || STRIP.test(l)) continue;
      const pct = l.match(/render (\d+)%/);
      if (pct) job.progress = Number(pct[1]) / 100;
      const boilerplate = /ELIFECYCLE|ERR_PNPM|Command failed|exit code|Exit status|^> |^npm |^pnpm /i.test(l);
      if (boilerplate) continue;
      if (l.startsWith("[utd-gen]")) {
        if (!firstError) job.message = l.replace("[utd-gen] ", "");
      } else if (/error|failed|invalid|cannot|not set|denied|\b4\d\d\b|\b5\d\d\b/i.test(l)) {
        // keep the FIRST real error line; later lines are usually stack/boilerplate
        if (!firstError) firstError = l.slice(0, 400);
        job.message = firstError;
      } else if (firstError && l.length > 8 && l.length < 300 && /^\s{0,2}[A-Za-z]/.test(l) && !/^\s*at /.test(l)) {
        // follow-on explanation lines (e.g. "Either pick a premade voice…")
        if (job.message.length < 600) job.message += " " + l;
      }
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("error", (e) => {
    job.status = "failed";
    job.message = e.message;
    job.endedAt = Date.now();
    log.end();
  });
  child.on("close", (code) => {
    job.exitCode = code ?? -1;
    job.status = code === 0 ? "done" : "failed";
    if (code === 0) job.progress = 1;
    job.endedAt = Date.now();
    log.end();
  });
  return job;
};

/** In-process async job (no child process), e.g. AI drafting. */
export const startAsyncJob = (slug: string, kind: JobKind, fn: (report: (m: string) => void) => Promise<void>): Job => {
  if (isBusy(slug)) throw new Error("a job is already running for this video");
  const id = `${kind}-${Date.now().toString(36)}`;
  const job: Job = { id, slug, kind, status: "running", progress: 0, startedAt: Date.now(), message: "starting…", logFile: "", lines: [] };
  reg.jobs.set(id, job);
  reg.latest.set(slug, job);
  const report = (m: string) => {
    job.message = m;
    job.lines!.push(`${new Date().toISOString().slice(11, 19)} ${m}`);
  };
  fn(report)
    .then(() => {
      job.status = "done";
      job.progress = 1;
      job.endedAt = Date.now();
    })
    .catch((e: Error) => {
      job.status = "failed";
      job.message = e.message;
      job.lines!.push(`error: ${e.message}`);
      job.endedAt = Date.now();
    });
  return job;
};

/** Run one CLI script to completion (used inside async jobs, e.g. images right after a draft). */
export const runCli = (slug: string, script: "vo" | "render" | "still" | "images", args: string[], report: (m: string) => void): Promise<number> =>
  new Promise((resolve) => {
    const dir = videoDir(slug);
    const child = spawn("pnpm", [script, slug, ...args], { cwd: PKG_DIR, shell: process.platform === "win32", env: { ...process.env, FORCE_COLOR: "0", UTD_VIDEOS_DIR: path.dirname(dir) } });
    const onData = (buf: Buffer) => {
      for (const line of buf.toString().replace(ANSI, "").split(/\r?\n/)) {
        const l = line.trim();
        if (l.startsWith("[utd-gen]")) report(l.replace("[utd-gen] ", ""));
        else if (l && !STRIP.test(l) && /error|not set|\b4\d\d\b/i.test(l) && !/ELIFECYCLE|ERR_PNPM/.test(l)) report(l.slice(0, 300));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", () => resolve(-1));
    child.on("close", (code) => resolve(code ?? -1));
  });
