// Topic radar: what Manchester United fans are talking about right now.
// Signals: fan comments under the big United YouTube channels (Data API v3), r/reddevils + r/soccer
// (public JSON with RSS fallback), Google News RSS headlines, and a few live web searches by Claude for
// the X / TikTok conversation. Claude ranks them into topics with a hook word, why-now, and a brief the
// drafter can take as is, and hands them back through a strict tool call (never parsed out of prose).
import fs from "node:fs";
import path from "node:path";
import { VIDEOS_DIR } from "./store";
import { claude, jsonInText, textOf, toolInput, type Msg, type Reply } from "./claude";
import { saveScan, type Scan } from "./radarStore";

export type RadarTopic = {
  title: string;
  hook: string; // one-word hook suggestion
  heat: number; // 1–5
  whyNow: string;
  angle: string;
  brief: string; // ready for Draft with AI
  series: string;
  sources: { title: string; url: string }[];
  signals: string; // e.g. "Reddit: 6 threads, 4.2k upvotes · News: 9 headlines"
  drafted?: { slug: string; at: string }; // set once a video is started from this topic
  kept?: boolean; // ★ on the saved list (derived when read)
};
export type Radar = { generatedAt: string; topics: RadarTopic[]; counts: { reddit: number; news: number; youtube: number; ytComments: number } };

type RedditPost = { title: string; score: number; comments: number; url: string; sub: string; ageH: number };
const UA = "utd-gen/0.1 (topic radar for a fan page)";
const UNITED = /man(chester)?\s*u(ni)?t(e)?d|mufc|old trafford|red devils|carrick|pochettino|amorim|fernandes|mainoo|cunha|mbeumo|šeško|sesko|yoro|dorgu|lammens|zirkzee|dalot|ugarte|casemiro|maguire|de ligt|shaw|ineos|ratcliffe|berrada/i;

/** Reddit's Atom feed (titles + links, no scores) — served where the JSON listing is refused. */
const fetchRedditRss = async (sub: string, listing: "hot" | "top", filter: boolean): Promise<RedditPost[]> => {
  try {
    const url = `https://www.reddit.com/r/${sub}/${listing === "top" ? "top/.rss?t=day" : ".rss"}`;
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/atom+xml, application/xml" } });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      .map((m) => {
        const e = m[1];
        const title = ((e.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
        const href = (e.match(/<link[^>]*href="([^"]+)"/) ?? [])[1] ?? "";
        const upd = Date.parse((e.match(/<updated>([^<]+)<\/updated>/) ?? [])[1] ?? "");
        return { title, score: 0, comments: 0, url: href, sub, ageH: Number.isFinite(upd) ? Math.round((Date.now() - upd) / 3600e3) : 24 };
      })
      .filter((p) => p.title && !/^daily discussion|^match thread|^post match thread/i.test(p.title) && (!filter || UNITED.test(p.title)));
  } catch {
    return [];
  }
};

const fetchReddit = async (sub: string, listing: "hot" | "top", filter: boolean): Promise<RedditPost[]> => {
  try {
    const url = `https://www.reddit.com/r/${sub}/${listing}.json?limit=60${listing === "top" ? "&t=day" : ""}`;
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) return fetchRedditRss(sub, listing, filter);
    const json = (await res.json()) as { data: { children: { data: { title: string; score: number; num_comments: number; permalink: string; created_utc: number; stickied: boolean } }[] } };
    return json.data.children
      .map((c) => c.data)
      .filter((d) => !d.stickied && (!filter || UNITED.test(d.title)))
      .map((d) => ({ title: d.title, score: d.score, comments: d.num_comments, url: `https://www.reddit.com${d.permalink}`, sub, ageH: Math.round((Date.now() / 1000 - d.created_utc) / 3600) }));
  } catch {
    return fetchRedditRss(sub, listing, filter);
  }
};

type Headline = { title: string; url: string; source: string; ageH: number };
const fetchNews = async (): Promise<Headline[]> => {
  try {
    const url = "https://news.google.com/rss/search?q=%22Manchester+United%22+when:2d&hl=en-GB&gl=GB&ceid=GB:en";
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 40);
    return items.map((m) => {
      const it = m[1];
      const get = (tag: string) => (it.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`)) ?? [])[1] ?? "";
      const title = get("title").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const pub = Date.parse(get("pubDate"));
      return { title, url: get("link"), source: get("source").replace(/<[^>]+>/g, ""), ageH: Number.isFinite(pub) ? Math.round((Date.now() - pub) / 3600e3) : 48 };
    });
  } catch {
    return [];
  }
};

// ---- YouTube: the fan argument itself (official Data API v3, free quota) ---------------------
// Channels by handle; override with UTD_YT_CHANNELS="@handle1,@handle2". Resolved ids are cached.
const DEFAULT_CHANNELS = ["@TheUnitedStand", "@StretfordPaddock", "@UtdFaithfuls", "@TheOverlap", "@SkySportsPremierLeague", "@footballdaily"];
type YtVideo = { channel: string; title: string; url: string; ageH: number; comments: { text: string; likes: number }[] };
const CHANNEL_CACHE = path.join(VIDEOS_DIR, ".radar-channels.json");

const yt = async <T,>(endpoint: string, params: Record<string, string>): Promise<T | null> => {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const q = new URLSearchParams({ ...params, key });
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${q}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

const resolveChannels = async (handles: string[]): Promise<Record<string, { id: string; title: string }>> => {
  let cache: Record<string, { id: string; title: string }> = {};
  try {
    cache = JSON.parse(fs.readFileSync(CHANNEL_CACHE, "utf8"));
  } catch {
    /* none yet */
  }
  for (const h of handles) {
    if (cache[h]) continue;
    const r = await yt<{ items?: { id: string; snippet: { title: string } }[] }>("channels", { part: "snippet", forHandle: h.replace(/^@/, "") });
    const item = r?.items?.[0];
    if (item) cache[h] = { id: item.id, title: item.snippet.title };
  }
  fs.mkdirSync(path.dirname(CHANNEL_CACHE), { recursive: true });
  fs.writeFileSync(CHANNEL_CACHE, JSON.stringify(cache, null, 2));
  return cache;
};

const fetchYouTube = async (report: (m: string) => void): Promise<YtVideo[]> => {
  if (!process.env.YOUTUBE_API_KEY) return [];
  const handles = (process.env.UTD_YT_CHANNELS ?? DEFAULT_CHANNELS.join(",")).split(",").map((h) => h.trim()).filter(Boolean);
  const channels = await resolveChannels(handles);
  const videos: YtVideo[] = [];
  for (const h of handles) {
    const ch = channels[h];
    if (!ch) continue;
    const uploads = "UU" + ch.id.slice(2); // uploads playlist
    const list = await yt<{ items?: { snippet: { title: string; publishedAt: string; resourceId: { videoId: string } } }[] }>("playlistItems", { part: "snippet", playlistId: uploads, maxResults: "6" });
    for (const it of list?.items ?? []) {
      const ageH = Math.round((Date.now() - Date.parse(it.snippet.publishedAt)) / 3600e3);
      if (ageH > 72) continue;
      const title = it.snippet.title;
      // only United-relevant videos from the general channels
      if (!/united stand|stretford|utdfaithful/i.test(ch.title) && !UNITED.test(title)) continue;
      const threads = await yt<{ items?: { snippet: { topLevelComment: { snippet: { textDisplay: string; likeCount: number } } } }[] }>("commentThreads", {
        part: "snippet",
        videoId: it.snippet.resourceId.videoId,
        order: "relevance",
        maxResults: "60",
        textFormat: "plainText",
      });
      const comments = (threads?.items ?? [])
        .map((t) => ({ text: t.snippet.topLevelComment.snippet.textDisplay.replace(/\s+/g, " ").slice(0, 220), likes: t.snippet.topLevelComment.snippet.likeCount }))
        .filter((c) => c.text.length > 15)
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 25);
      videos.push({ channel: ch.title, title, url: `https://www.youtube.com/watch?v=${it.snippet.resourceId.videoId}`, ageH, comments });
    }
  }
  report(`YouTube: ${videos.length} videos, ${videos.reduce((a, v) => a + v.comments.length, 0)} top comments`);
  return videos;
};

export const SERIES = ["MATCH DIARY", "TACTICS TALKZ", "TRANSFER WATCH", "THE DEBATE", "PLAYER FOCUS"] as const;

/**
 * The ranked radar comes back through this tool call, not as text: with `strict` the API guarantees the
 * tool input is valid JSON in exactly this shape, so a stray quote in a fan comment can no longer break a scan.
 */
const PUBLISH_TOOL = {
  name: "publish_radar",
  description: "Publish the finished topic radar: exactly 8 topics, hottest first. Call it once, when the ranking is final.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      topics: {
        type: "array",
        description: "Exactly 8 topics, hottest first.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Headline for the video idea, under 70 characters." },
            hook: { type: "string", description: "ONE uppercase word (two at most) that creates curiosity; may end with ?. Not a description." },
            heat: { type: "integer", description: "Fan heat 1-5. 5 = everyone is arguing about it today." },
            whyNow: { type: "string", description: "One sentence: what happened and when. Quote recurring fan phrasing where it helps." },
            angle: { type: "string", description: "One sentence: the argument the video makes, not a recap." },
            brief: { type: "string", description: "2-4 sentences the script writer can use directly: the story, the angle, the facts to verify, what to end on." },
            series: { type: "string", enum: [...SERIES] },
            sources: {
              type: "array",
              description: "2-4 real links from the signals or your searches.",
              items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } }, required: ["title", "url"], additionalProperties: false },
            },
            signals: { type: "string", description: 'Short line like "Reddit: 5 threads · 3.1k upvotes · YouTube: 180 comments across 4 videos · News: 7 headlines · X: trending".' },
          },
          required: ["title", "hook", "heat", "whyNow", "angle", "brief", "series", "sources", "signals"],
          additionalProperties: false,
        },
      },
    },
    required: ["topics"],
    additionalProperties: false,
  },
};

const str = (v: unknown) => (v == null ? "" : String(v)).trim();

/** Normalise a published radar (strict mode makes this a formality; the loose and prose fallbacks need it). */
const asTopics = (input: unknown): { topics: RadarTopic[] } | null => {
  const topics0 = input && typeof input === "object" ? (input as { topics?: unknown }).topics : null;
  if (!Array.isArray(topics0) || topics0.length === 0) return null;
  const topics = (topics0 as Record<string, unknown>[]).filter((t) => t && typeof t === "object" && str(t.title)).map((t) => ({
    title: str(t.title),
    hook: str(t.hook).toUpperCase() || "WHY?",
    heat: Number(t.heat) || 3,
    whyNow: str(t.whyNow),
    angle: str(t.angle),
    brief: str(t.brief) || str(t.angle),
    series: str(t.series),
    sources: Array.isArray(t.sources) ? (t.sources as Record<string, unknown>[]).map((s) => ({ title: str(s?.title), url: str(s?.url) })) : [],
    signals: str(t.signals),
  }));
  return topics.length ? { topics } : null;
};
const published = (reply: Reply) => asTopics(toolInput(reply, PUBLISH_TOOL.name)?.input) ?? asTopics(jsonInText(reply));

/**
 * Rank the signals with Claude (a few live web searches allowed) and receive the result through publish_radar.
 * The shared client downgrades a rejected strict tool or forced tool_choice by itself; if a turn still ends in
 * prose, the prose is parsed as JSON, and failing that a second search-free call asks for the tool call.
 */
export const rankWithClaude = async (system: string, user: string, report: (m: string) => void): Promise<{ topics: RadarTopic[] }> => {
  const webSearch = { type: "web_search_20250305", name: "web_search", max_uses: 4 };
  let messages: Msg[] = [{ role: "user", content: user }];
  let prose = "";
  let reply: Reply | null = null;
  for (let turn = 0; turn < 6; turn++) {
    reply = await claude({ system, messages, tools: [webSearch, PUBLISH_TOOL], tool_choice: { type: "any" } });
    const got = published(reply);
    if (got) return got;
    prose += textOf(reply.content);
    if (reply.stop_reason === "pause_turn") {
      report("still checking the conversation…");
      messages = [...messages, { role: "assistant", content: reply.content }];
      continue;
    }
    break; // ended without the tool call → ask once more, plainly
  }

  report("tidying the ranking…");
  const handoff = prose.trim()
    ? `Here is a topic radar written as text. Publish it through the publish_radar tool — same content, just in the tool's shape (fill any missing field sensibly). Reply with the tool call only.\n\n${prose}`
    : `${user}\n\n(No web searches this time — rank from the signals above and publish through the publish_radar tool. Reply with the tool call only.)`;
  for (let i = 0; i < 2; i++) {
    reply = await claude({ system, messages: [{ role: "user", content: handoff }], tools: [PUBLISH_TOOL], tool_choice: { type: "tool", name: PUBLISH_TOOL.name } });
    const got = published(reply);
    if (got) return got;
  }
  throw new Error("radar: Claude returned no topics");
};

export const buildRadar = async (report: (m: string) => void): Promise<Scan> => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing — add it to the .env file at the repo root and refresh the page");
  report("reading r/reddevils and r/soccer…");
  const [rd1, rd2, soc, news, ytv] = await Promise.all([fetchReddit("reddevils", "hot", false), fetchReddit("reddevils", "top", false), fetchReddit("soccer", "hot", true), fetchNews(), fetchYouTube(report)]);
  const seen = new Set<string>();
  const reddit = [...rd1, ...rd2, ...soc].filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true))).sort((a, b) => b.score + b.comments * 3 - (a.score + a.comments * 3)).slice(0, 45);
  report(`${reddit.length} threads · ${news.length} headlines · ${ytv.reduce((a, v) => a + v.comments.length, 0)} YouTube comments — ranking the conversation…`);

  const user = `Today: ${new Date().toUTCString()}.

REDDIT (score · comments · age · sub · title — scores of 0 mean the feed gave titles only; weigh recency and your searches instead)
${reddit.map((p) => `${p.score} · ${p.comments}c · ${p.ageH}h · r/${p.sub} · ${p.title}`).join("\n") || "(unavailable)"}

NEWS HEADLINES (age · source · title)
${news.map((h) => `${h.ageH}h · ${h.source} · ${h.title}`).join("\n") || "(unavailable)"}

YOUTUBE — what fans are saying under the big channels' latest videos (channel · age · video title, then top comments with like counts)
${
  ytv.length
    ? ytv.map((v) => `## ${v.channel} · ${v.ageH}h · ${v.title}\n${v.comments.map((c) => `  (${c.likes}) ${c.text}`).join("\n")}`).join("\n")
    : "(no YOUTUBE_API_KEY set — comments unavailable)"
}

Use web_search up to 4 times for what fans are saying on X/Twitter and TikTok in the last 48 hours (e.g. "Man Utd fans reaction", the names trending). Then produce the radar.`;

  const system = `You are the planning editor of "UTD Diaries", a Manchester United analysis page (Reels/TikTok/Shorts, 60–90 s videos with tactical boards, stat cards, quotes and pictures). From the signals, pick the 8 topics fans are talking about MOST right now and that make a good analysis video, then hand them over by calling the publish_radar tool (that call is the only output that counts — never write the list as text).
- Rank by fan heat (volume + emotion + recency). heat 5 = everyone is arguing about it today.
- hook: ONE uppercase word (or two) that creates curiosity, may end with "?". Not a description.
- whyNow: one sentence — what happened and when.
- angle: one sentence — the take the video makes (an argument, not a recap).
- brief: 2–4 sentences the script writer can use directly: the story, the angle, the facts to verify, what to end on.
- sources: 2–4 real links from the signals or your searches.
- signals: a short line like "Reddit: 5 threads · 3.1k upvotes · YouTube: 180 comments across 4 videos · News: 7 headlines · X: trending".
- Weigh YouTube comments heavily: they are fans talking, not journalists. Quote the recurring fan phrasing in whyNow where it helps ("fans keep saying …").
Only topics grounded in the signals; no invented events.`;

  const parsed = await rankWithClaude(system, user, report);
  const radar: Radar = {
    generatedAt: new Date().toISOString(),
    topics: parsed.topics.slice(0, 10).map((t) => ({
      ...t,
      heat: Math.max(1, Math.min(5, Math.round(Number(t.heat)) || 3)),
      series: SERIES.find((s) => s.toLowerCase() === String(t.series).trim().toLowerCase()) ?? "THE DEBATE",
      sources: (t.sources ?? []).filter((s) => s?.url && /^https?:\/\//i.test(s.url)),
    })),
    counts: { reddit: reddit.length, news: news.length, youtube: ytv.length, ytComments: ytv.reduce((a, v) => a + v.comments.length, 0) },
  };
  const scan = saveScan(radar);
  report(`radar ready: ${radar.topics.length} topics · saved as scan ${scan.id}`);
  return scan;
};
