import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

/**
 * The playground imports the package by name, but Vite resolves it to the
 * library TypeScript source. Dev server and build therefore always run
 * against the current source without a prior `tsc` build, and the dev
 * server hot-reloads on library edits.
 */
const coursereaderRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  base: "./",

  server: {
    fs: {
      // Permit serving the aliased library source from coursereader/src/ts.
      allow: [coursereaderRoot],
    },
  },

  resolve: {
    alias: [
      {
        find: "@projektemacher/coursereader",
        replacement: fileURLToPath(
          new URL("../src/ts/index.ts", import.meta.url),
        ),
      },
    ],
  },
});
