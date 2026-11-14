import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  transpilePackages: ["@utd/video"],
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer"],
  webpack: (cfg) => {
    cfg.module.rules.push({ test: /\.(mp3|wav|m4a)$/i, type: "asset/resource" });
    return cfg;
  },
};

export default config;
