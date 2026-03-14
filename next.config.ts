import type { NextConfig } from "next";
import { setupDevPlatform } from "@cloudflare/next-on-pages/next-dev";

const nextConfig = async (): Promise<NextConfig> => {
  // Initialize the Cloudflare dev platform for local dev
  if (process.env.NODE_ENV === 'development') {
    await setupDevPlatform();
  }

  return {
    serverExternalPackages: ['async_hooks']
  };
};

export default nextConfig;
