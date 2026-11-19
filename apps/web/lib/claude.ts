// One door to the Claude Messages API for the app (drafting, topic radar, post copy).
// It learns what the configured model accepts and downgrades by itself: a forced tool_choice
// ("tool"/"any") that the model rejects becomes "auto" for the rest of the process, a rejected
// `strict` tool definition is retried loose — so a feature gap never fails a job.
import { refreshKeys } from "@/lib/env";
import { aiMessages, aiModel, aiProvider, AiError } from "@utd/video/ai";

export const API = "https://api.anthropic.com/v1/messages";
export const model = () => aiModel();
export const provider = () => aiProvider();
export const configured = () => {
  if (!aiProvider()) refreshKeys();
  return !!aiProvider();
};

export type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown; [k: string]: unknown };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type Reply = { content: Block[]; stop_reason: string; usage?: { server_tool_use?: { web_search_requests?: number } } };
export type ToolChoice = { type: "auto" } | { type: "any" } | { type: "tool"; name: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Claude API ${status}: ${body.slice(0, 400)}`);
  }
}

// Learned per process from the API's own answers.
let forcedChoiceOk: boolean | null = null;
let strictOk: boolean | null = null;

const isForced = (c: unknown): c is ToolChoice => !!c && typeof c === "object" && (c as ToolChoice).type !== "auto";
const hasStrict = (tools: unknown): boolean => Array.isArray(tools) && tools.some((t) => t && typeof t === "object" && (t as { strict?: boolean }).strict);
const loosen = (tools: unknown): unknown => (Array.isArray(tools) ? tools.map((t) => (t && typeof t === "object" ? Object.fromEntries(Object.entries(t as object).filter(([k]) => k !== "strict")) : t)) : tools);

/** Is a forced tool_choice going to be honoured right now? (Callers that need a guaranteed hand-in plan their fallbacks on this.) */
export const canForceTool = () => forcedChoiceOk !== false;

/** POST /v1/messages with the house defaults; applies what has been learned, retries once per lesson. */
export const claude = async (body: Record<string, unknown>): Promise<Reply> => {
  const b: Record<string, unknown> = { max_tokens: 8000, ...body };
  if (forcedChoiceOk === false && isForced(b.tool_choice)) b.tool_choice = { type: "auto" };
  if (strictOk === false && hasStrict(b.tools)) b.tools = loosen(b.tools);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await aiMessages(b);
      if (isForced(b.tool_choice)) forcedChoiceOk = true;
      if (hasStrict(b.tools)) strictOk = true;
      return r;
    } catch (e) {
      const text = e instanceof AiError ? e.body : "";
      if (e instanceof AiError && e.status === 400) {
        if (isForced(b.tool_choice) && /tool_choice/i.test(text)) {
          forcedChoiceOk = false;
          b.tool_choice = { type: "auto" };
          continue;
        }
        if (hasStrict(b.tools) && /strict/i.test(text)) {
          strictOk = false;
          b.tools = loosen(b.tools);
          continue;
        }
      }
      throw e;
    }
  }
  throw new Error("AI API: gave up after adjusting the request");
};

export const textOf = (blocks: Block[]) => blocks.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text as string).join("");

/** The input of a client tool call in a reply, if the model made one. */
export const toolInput = (reply: Reply, name: string): { id: string; input: Record<string, unknown> } | null => {
  const tu = reply.content.find((b) => b.type === "tool_use" && b.name === name);
  return tu && tu.input && typeof tu.input === "object" ? { id: String(tu.id), input: tu.input as Record<string, unknown> } : null;
};

/** The largest {...} in the reply text parsed as JSON — the last-resort path when a model answers in prose. */
export const jsonInText = (reply: Reply): unknown => {
  const text = textOf(reply.content);
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null, last: string | null = null;
  while ((m = fenced.exec(text))) last = m[1];
  for (const candidate of [last, text.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* next */
    }
  }
  return null;
};
