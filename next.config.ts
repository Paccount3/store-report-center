import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  serverExternalPackages: ["xlsx", "unpdf", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./src/lib/demo/snapshot.json.gz"],
    "/*": ["./src/lib/demo/snapshot.json.gz"],
  },
};

export default nextConfig;
