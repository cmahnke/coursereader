import { watch } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const stylesheets = [
  {
    source: "src/css/styles.css",
    target: "src/ts/styles.generated.ts",
    exportName: "coreStyles",
  },
  {
    source: "src/css/playground-styles.css",
    target: "src/ts/playground-styles.generated.ts",
    exportName: "playgroundStyles",
  },
];

async function generate() {
  await Promise.all(
    stylesheets.map(async ({ source, target, exportName }) => {
      const css = await readFile(join(root, source), "utf8");

      await writeFile(
        join(root, target),
        `export const ${exportName} = ${JSON.stringify(css)};\n`,
      );
    }),
  );

  console.log("Generated style modules from CSS sources.");
}

await generate();

if (process.argv.includes("--watch")) {
  let timer;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      generate().catch((error) => console.error(error));
    }, 50);
  };

  for (const { source } of stylesheets) {
    watch(join(root, source), schedule);
  }

  console.log("Watching CSS sources for changes.");
}
