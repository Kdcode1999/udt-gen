// Brand presets. One preset per channel; the script picks one with `brand`.
// Master Spec (UTD Diaries): 1080×1920, safe zones top 220 / bottom 320 / sides 60,
// Anton (display) + Inter (body), ink #0A0A0C, red #E5142A, gold #F4C04E.

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;

export const SAFE = {
  top: 220,
  bottom: 320,
  side: 60,
  // derived content box
  x0: 60,
  x1: 1080 - 60,
  y0: 220,
  y1: 1920 - 320,
} as const;

export type Brand = {
  id: string;
  /** Short channel name shown in the page tag and CTA */
  name: string;
  /** Two-part wordmark, e.g. ["UTD", "DIARIES"]; second part is drawn in the accent colour */
  wordmark: [string, string];
  /** Social handle line for the CTA */
  handle: string;
  colors: {
    ink: string;
    surface: string;
    red: string;
    gold: string;
    white: string;
    muted: string;
    away: string; // opposition marker colour on tactical boards
    pitch: string;
    pitchAlt: string;
    pitchLine: string;
  };
  fonts: {
    display: string;
    body: string;
  };
};

export const BRANDS: Record<string, Brand> = {
  utd: {
    id: "utd",
    name: "UTD Diaries",
    wordmark: ["UTD", "DIARIES"],
    handle: "@utddiaries",
    colors: {
      ink: "#0A0A0C",
      surface: "#15151A",
      red: "#E5142A",
      gold: "#F4C04E",
      white: "#F6F6F4",
      muted: "#A3A2AB",
      away: "#8EC5F2",
      pitch: "#256F34",
      pitchAlt: "#2B7E3C",
      pitchLine: "rgba(255,255,255,0.78)",
    },
    fonts: {
      display: "'Anton', Impact, 'Arial Narrow', sans-serif",
      body: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
  },
};

export const getBrand = (id?: string): Brand => BRANDS[id ?? "utd"] ?? BRANDS.utd;
