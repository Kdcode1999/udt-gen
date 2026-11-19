// One text-AI door for the app and the CLI. Callers speak the Anthropic Messages shape; this sends it to
// Claude when there's an Anthropic key with credit, otherwise to OpenAI (Responses API, its own web search),
// and translates the answer back — so drafting, the topic radar, post copy and the picture planner
// don't care which one is paying. Server/CLI only.
//
//   UTD_AI=openai | anthropic   force a provider (default: Claude if ANTHROPIC_API_KEY, else OpenAI)
//   UTD_OPENAI_TEXT_MODEL       default gpt-6.2-sol
//   UTD_DRAFT_MODEL             Claude model, default claude-sonnet-5-5
// If Claude answers "credit balance is too low" and an OpenAI key is set, everything moves to OpenAI
// for the rest of the process.

export type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown; [k: string]: unknown };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type Reply = { content: Block[]; stop_reason: string; usage?: { server_tool_use?: { web_search_requests?: number } } };

export class AiError extends Error {
  constructor(
    public provider: "anthropic" | "openai",
    public status: number,
    public body: string,
  ) {
    super(`${provider === "openai" ? "OpenAI" : "Claude"} API ${status}: ${body.slice(0, 400)}`);
  }
}

const g = globalThis as unknown as { __utdAiNoCredit?: boolean };

export type Provider = "anthropic" | "openai";
export const aiProvider = (): Provider | null => {
  const forced = (process.env.UTD_AI ?? "").toLowerCase();
  const a = !!process.env.ANTHROPIC_API_KEY && !g.__utdAiNoCredit;
  const o = !!process.env.OPENAI_API_KEY;
  if (forced === "openai" && o) return "openai";
  if (forced === "anthropic" && a) return "anthropic";
  return a ? "anthropic" : o ? "openai" : null;
};
export const aiModel = () => (aiProvider() === "openai" ? process.env.UTD_OPENAI_TEXT_MODEL ?? "gpt-6.2-sol" : process.env.UTD_DRAFT_MODEL ?? "claude-sonnet-5-5");
export const aiLabel = () => (aiProvider() === "openai" ? `OpenAI · ${aiModel()}` : `Claude · ${aiModel()}`);

// ---------------------------------------------------------------- Anthropic
const anthropic = async (body: Record<string, unknown>): Promise<Reply> => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.UTD_DRAFT_MODEL ?? "claude-sonnet-5-5", ...body }),
  });
  if (!res.ok) throw new AiError("anthropic", res.status, await res.text());
  return (await res.json()) as Reply;
};

// ---------------------------------------------------------------- OpenAI (Responses API)
type OAItem = { type: string; [k: string]: unknown };

const blockText = (c: string | Block[]): string =>
  typeof c === "string"
    ? c
    : c
        .map((b) => {
          if (b.type === "text") return b.text ?? "";
          if (b.type === "tool_use") return `[I called ${b.name} with: ${JSON.stringify(b.input).slice(0, 12000)}]`;
          if (b.type === "tool_result") return `[Result of my ${String(b.tool_use_id ?? "tool")} call]: ${typeof b.content === "string" ? b.content : JSON.stringify(b.content)}`;
          return ""; // server-side search blocks: nothing to replay
        })
        .filter(Boolean)
        .join("\n");

const toOpenAI = (body: Record<string, unknown>) => {
  const messages = (body.messages as Msg[]) ?? [];
  const input = messages.map((m) => ({ role: m.role, content: blockText(m.content) || "(continue)" }));
  const tools: unknown[] = [];
  for (const t of (body.tools as Record<string, unknown>[]) ?? []) {
    if (typeof t.type === "string" && t.type.startsWith("web_search")) tools.push({ type: "web_search" });
    else if (t.name) tools.push({ type: "function", name: t.name, description: t.description ?? "", parameters: t.input_schema ?? { type: "object" }, strict: false });
  }
  const tc = body.tool_choice as { type?: string; name?: string } | undefined;
  const tool_choice = !tc || tc.type === "auto" ? "auto" : tc.type === "any" ? "required" : tc.type === "tool" ? { type: "function", name: tc.name } : "auto";
  return {
    model: aiModel(),
    instructions: typeof body.system === "string" ? body.system : undefined,
    input,
    max_output_tokens: Math.max(1024, Number(body.max_tokens) || 8000),
    ...(tools.length ? { tools, tool_choice } : {}),
  };
};

const fromOpenAI = (json: { output?: OAItem[]; status?: string; incomplete_details?: { reason?: string } }): Reply => {
  const content: Block[] = [];
  let searches = 0;
  let called = false;
  for (const item of json.output ?? []) {
    if (item.type === "web_search_call") searches++;
    else if (item.type === "message") {
      for (const c of (item.content as { type: string; text?: string }[]) ?? []) if (c.type === "output_text" && c.text) content.push({ type: "text", text: c.text });
    } else if (item.type === "function_call") {
      let input: unknown = {};
      try {
        input = JSON.parse(String(item.arguments ?? "{}"));
      } catch {
        input = {};
      }
      content.push({ type: "tool_use", id: String(item.call_id ?? item.id), name: String(item.name), input });
      called = true;
    }
  }
  const stop = called ? "tool_use" : json.status === "incomplete" && json.incomplete_details?.reason === "max_output_tokens" ? "max_tokens" : "end_turn";
  return { content, stop_reason: stop, usage: { server_tool_use: { web_search_requests: searches } } };
};

const openai = async (body: Record<string, unknown>): Promise<Reply> => {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(toOpenAI(body)),
  });
  if (!res.ok) throw new AiError("openai", res.status, await res.text());
  return fromOpenAI(await res.json());
};

/** Send an Anthropic-shaped Messages request to whichever provider is available. */
export const aiMessages = async (body: Record<string, unknown>): Promise<Reply> => {
  const p = aiProvider();
  if (!p) throw new Error("No AI key — add ANTHROPIC_API_KEY or OPENAI_API_KEY to the .env file");
  if (p === "openai") return openai(body);
  try {
    return await anthropic(body);
  } catch (e) {
    // Out of Claude credit → carry on with OpenAI when there's a key for it.
    if (e instanceof AiError && /credit balance|billing|insufficient/i.test(e.body) && process.env.OPENAI_API_KEY) {
      g.__utdAiNoCredit = true;
      console.log("[utd] Claude is out of credit — switching text AI to OpenAI for this session");
      return openai(body);
    }
    throw e;
  }
};

/** Plain text answer (optionally with web search); null when no provider or the call fails. */
export const aiText = async (system: string, user: string, opts: { search?: boolean; maxTokens?: number } = {}): Promise<string | null> => {
  if (!aiProvider()) return null;
  let messages: Msg[] = [{ role: "user", content: user }];
  try {
    for (let i = 0; i < 4; i++) {
      const r = await aiMessages({ max_tokens: opts.maxTokens ?? 800, system, messages, ...(opts.search ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] } : {}) });
      if (r.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: r.content }];
        continue;
      }
      return r.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim() || null;
    }
  } catch {
    return null;
  }
  return null;
};

/** The first {...} JSON object in a text answer, parsed; null when there is none. */
export const aiJson = async (system: string, user: string, opts: { search?: boolean; maxTokens?: number } = {}): Promise<Record<string, unknown> | null> => {
  const text = await aiText(system, user, opts);
  const m = text?.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
};
