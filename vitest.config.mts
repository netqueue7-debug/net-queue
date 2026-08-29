import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(import.meta.dirname, ".env.local") });

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
