import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(import.meta.dirname, ".env.local") });

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
