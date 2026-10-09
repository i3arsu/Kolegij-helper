import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// DB testovi: jedan Postgres kontejner (Testcontainers), svaka test datoteka dobiva vlastitu bazu iz predloška.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/globalno.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
