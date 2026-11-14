// Library entry for the web app (no registerRoot side effect).
export { Video, type VideoProps } from "./Video";
export { calculateMetadata } from "./Root";
export { setAssetBase } from "./components/ui";
export { buildTimeline, chunkWords, estimateSpeechSeconds, type Timeline, type TimedScene } from "./timing";
export { Script, Scene, VoManifest, type Script as ScriptT, type Scene as SceneT, type VoManifest as VoManifestT, type SceneOf } from "./schema";
export { BRANDS, getBrand, WIDTH, HEIGHT, FPS, SAFE, type Brand } from "./brand";
