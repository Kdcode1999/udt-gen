// Background jobs: spawn the CLI scripts (vo / render / still) and expose progress.
// In-memory registry + a log file per job under videos/<slug>/out/jobs/.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PKG_DIR, videoDir } from "./store";

export type JobKind = "vo" | "render" | "stills";
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
};

type Registry = { jobs: Map<string, Job>; latest: Map<string, Job> };
// survive Next.js dev-mode module reloads
const g = globalThis as unknown as { __utdJobs?: Registry };
const reg: Registry = g.__utdJobs ?? (g.__utdJobs = { jobs: new Map(), latest: new Map() });

export const getJob = (id: string) => reg.jobs.get(id) ?? null;
export const latestJob = (slug: string) => reg.latest.get(slug) ?? null;
export const isBusy = (slug: string) => latestJob(slug)?.status === "running";

export const tailLog = (job: Job, lines = 40): string => {
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

  const script = kind === "vo" ? "vo" : kind === "render" ? "render" : "still";
  const child = spawn("pnpm", [script, slug, ...args], {
    cwd: PKG_DIR,
    shell: process.platform === "win32",
    env: { ...process.env, FORCE_COLOR: "0", UTD_VIDEOS_DIR: path.dirname(dir) },
  });
  const log = fs.createWriteStream(logFile);
  const onData = (buf: Buffer) => {
    const text = buf.toString().replace(ANSI, "");
    log.write(text);
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim();
      if (!l || STRIP.test(l)) continue;
      const pct = l.match(/render (\d+)%/);
      if (pct) job.progress = Number(pct[1]) / 100;
      if (l.startsWith("[utd-gen]")) job.message = l.replace("[utd-gen] ", "");
      else if (/error|failed|invalid|cannot|Error/i.test(l)) job.message = l.slice(0, 300);
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
