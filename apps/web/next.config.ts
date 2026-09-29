import type { NextConfig } from "next";

const config: NextConfig = {
  // Static export: `next build` writes a plain site to out/ that any static host can serve.
  output: "export",
  // Relative asset paths so the export also works from a sub-folder.
  assetPrefix: "./",
  trailingSlash: true,
};

export default config;
