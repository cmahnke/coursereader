import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

/**
 * The playground imports the package by name, but Vite resolves it to the
 * library TypeScript source. Dev server and build therefore always run
 * against the current source without a prior `tsc` build, and the dev
 * server hot-reloads on library edits.
 */
const coursepackRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  base: "./",

  server: {
    fs: {
      // Permit serving the aliased library source from coursepack/src.
      allow: [coursepackRoot],
    },
  },

  resolve: {
    alias: [
      {
        find: "@projektemacher/coursepack",
        replacement: fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    ],
  },
});
