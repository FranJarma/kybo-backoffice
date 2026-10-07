import { legacyRedirects } from "./src/lib/navigation";
import type { NextConfig } from "next";
const config: NextConfig = {
  redirects: async () => legacyRedirects,
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  distDir:
    process.env.E2E_MANAGED === "1"
      ? (process.env.E2E_BUILD_DIR ?? ".next-e2e")
      : ".next",
  serverExternalPackages: ["@electric-sql/pglite"],
};
export default config;
