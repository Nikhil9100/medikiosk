import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // The server-only marker throws outside react-server; tests import
      // server modules directly, so resolve it to an empty stub.
      "server-only": path.resolve(__dirname, "vitest.server-only-stub.ts"),
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: true,
    env: {
      NODE_ENV: "development",
    },
  },
});
