import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true" || process.env.NODE_ENV === "production";
const repoName = "/LogStay";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? (isGithubPages ? repoName : ""),
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH ?? (isGithubPages ? repoName : undefined),
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
