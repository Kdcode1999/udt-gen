// Loads Anton + Inter from the embedded base64 data so renders never depend on
// Google Fonts being reachable (sandboxes, Modal, offline PCs).
import { loadFont } from "@remotion/fonts";
import { FONT_DATA } from "./data";

let started: Promise<unknown> | null = null;

export const ensureFonts = (): Promise<unknown> => {
  if (typeof window === "undefined") return Promise.resolve();
  if (!started) {
    started = Promise.all([
      loadFont({ family: "Anton", url: FONT_DATA.anton400, weight: "400", format: "woff2" }),
      loadFont({ family: "Inter", url: FONT_DATA.inter400, weight: "400", format: "woff2" }),
      loadFont({ family: "Inter", url: FONT_DATA.inter700, weight: "700", format: "woff2" }),
      loadFont({ family: "Inter", url: FONT_DATA.inter900, weight: "900", format: "woff2" }),
    ]);
  }
  return started;
};

ensureFonts();
