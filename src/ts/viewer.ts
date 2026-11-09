/* ==========================================================================
 * Responsive viewer
 * ========================================================================== */

import { bindings, builtInBindings, BindingRegistry } from "./bindings.js";
import { createArchivePage } from "./page.js";
import { presets } from "./presets.js";
import { installStyles } from "./styles.js";
import type {
  ArchivePage,
  ArchiveViewer,
  ArchiveViewerOptions,
  GutterOptions,
  ResponsiveLayout,
} from "./types.js";
import { clamp, deepMerge, resolveElement } from "./utils.js";

function resolveLayout(layouts: ResponsiveLayout[]): ResponsiveLayout {
  for (const layout of layouts) {
    if (window.matchMedia(layout.query).matches) {
      return layout;
    }
  }

  return (
    layouts[Math.max(0, layouts.length - 1)] ?? {
      query: "all",
      mode: "single",
    }
  );
}

function resolveGutter(
  definition: ResponsiveLayout["gutter"],
  registry: BindingRegistry,
): GutterOptions | false {
  if (definition === undefined || definition === false) {
    return false;
  }

  if (typeof definition === "string") {
    return registry.get(definition);
  }

  return deepMerge(builtInBindings.subtle, definition);
}

function createGutter(
  edge: "left" | "right",
  options: GutterOptions,
): HTMLDivElement {
  const gutter = document.createElement("div");

  gutter.className = "archive-scan-gutter";

  gutter.dataset.edge = edge;

  gutter.setAttribute("aria-hidden", "true");

  gutter.style.setProperty("--gutter-width", `${options.width}px`);

  gutter.style.setProperty(
    "--gutter-darkness",
    String(clamp(options.darkness)),
  );

  gutter.style.setProperty(
    "--gutter-middle",
    String(clamp(options.darkness) * 0.55),
  );

  gutter.style.setProperty(
    "--gutter-highlight",
    String(clamp(options.highlight)),
  );

  gutter.style.setProperty(
    "--gutter-blur",
    `${Math.max(0, options.blur) * 0.12}px`,
  );

  gutter.style.setProperty(
    "--gutter-curve",
    `${32 + clamp(options.curvature) * 20}%`,
  );

  return gutter;
}

function createSlot(
  page: ArchivePage | null,
  side: "single" | "left" | "right",
  gutter: GutterOptions | false,
): HTMLDivElement {
  const slot = document.createElement("div");

  slot.className = "archive-scan-slot";

  slot.dataset.side = side;

  if (page) {
    slot.append(page.element);

    /*
     * The binding shadow belongs to the sheet, not to the slot:
     * expose the page's copier frame insets so the gutter can
     * stop at the sheet's head and tail instead of running on
     * into the frame.
     */
    if (gutter && side !== "single") {
      for (const inset of ["top", "bottom"] as const) {
        const value = page.element.style.getPropertyValue(
          `--archive-frame-${inset}`,
        );

        if (value) {
          slot.style.setProperty(`--archive-frame-${inset}`, value);
        }
      }

      slot.append(createGutter(side === "left" ? "right" : "left", gutter));
    }
  } else {
    const empty = document.createElement("div");

    empty.className = "archive-scan-empty";

    slot.append(empty);
  }

  return slot;
}

/**
 * Creates a responsive single-page or spread viewer.
 *
 * The viewer renders every page through {@link createArchivePage} and
 * switches layouts as the supplied media queries match. Navigation
 * moves by one page in single mode and two pages in spread mode.
 *
 * @param target - Host element or selector that receives the viewer.
 * @param options - Pages, presets, layouts and registry overrides.
 * @returns A handle for navigating and destroying the viewer.
 * @throws {Error} When `options.pages` is empty or a page cannot be found.
 *
 * @example
 * ```ts
 * const viewer = createArchiveViewer("#reader", {
 *   pages: ["#page-1", "#page-2"],
 *   preset: "analog-gray-copy",
 *   layouts: [
 *     { query: "(min-width: 900px)", mode: "spread", gutter: "bound-volume" },
 *     { query: "all", mode: "single" },
 *   ],
 * });
 * ```
 */
export function createArchiveViewer(
  target: HTMLElement | string,
  options: ArchiveViewerOptions,
): ArchiveViewer {
  installStyles();

  const host = resolveElement(target);

  if (options.pages.length === 0) {
    throw new Error("Archive viewer requires at least one page.");
  }

  const sourcePages = options.pages.map(resolveElement);

  const registry = options.registry ?? presets;

  const bindingRegistry = options.bindingRegistry ?? bindings;

  const viewer = document.createElement("div");

  viewer.className = "archive-scan-viewer";

  host.append(viewer);

  const renderedPages = sourcePages.map((source, index) =>
    createArchivePage(source, {
      preset: options.preset,
      overrides: options.overrides,
      seed: `${options.seed ?? options.preset ?? "page"}:${index}`,
      registry,
      enhancement: options.enhancement,
    }),
  );

  let currentPage = Math.max(
    0,
    Math.min(renderedPages.length - 1, Math.floor(options.initialPage ?? 0)),
  );

  let destroyed = false;

  const mediaQueries = options.layouts.map((layout) =>
    window.matchMedia(layout.query),
  );

  function spreadIndices(
    layout: ResponsiveLayout,
  ): [number | null, number | null] {
    const firstSide = layout.spread?.firstPageSide ?? "right";

    if (firstSide === "right") {
      if (currentPage === 0) {
        return [null, 0];
      }

      const left = currentPage % 2 === 1 ? currentPage : currentPage - 1;

      return [
        left >= 0 ? left : null,

        left + 1 < renderedPages.length ? left + 1 : null,
      ];
    }

    const left = currentPage % 2 === 0 ? currentPage : currentPage - 1;

    return [
      left >= 0 ? left : null,

      left + 1 < renderedPages.length ? left + 1 : null,
    ];
  }

  /*
   * The binding side of a spread has no exposed glass, so the
   * copier frame is suppressed there and facing pages meet at
   * the spine. Pages away from the spread keep full frames.
   */
  function applyFrameSides(
    suppressSpine: boolean,
    leftIndex: number | null,
    rightIndex: number | null,
  ): void {
    for (const [index, page] of renderedPages.entries()) {
      page.update({
        border: {
          sides: {
            right: !(suppressSpine && index === leftIndex),

            left: !(suppressSpine && index === rightIndex),
          },
        },
      });
    }
  }

  async function refresh(): Promise<void> {
    if (destroyed) {
      return;
    }

    const layout = resolveLayout(options.layouts);

    const gutter = resolveGutter(layout.gutter, bindingRegistry);

    viewer.dataset.mode = layout.mode;

    viewer.dataset.fit = layout.pageFit ?? "contain";

    viewer.style.setProperty("--archive-gap", `${layout.gap ?? 0}px`);

    if (layout.background) {
      viewer.style.background = layout.background;
    } else {
      viewer.style.removeProperty("background");
    }

    if (layout.mode === "single") {
      applyFrameSides(false, null, null);

      viewer.replaceChildren(
        createSlot(renderedPages[currentPage], "single", false),
      );

      return;
    }

    const [leftIndex, rightIndex] = spreadIndices(layout);

    applyFrameSides(gutter !== false, leftIndex, rightIndex);

    viewer.replaceChildren(
      createSlot(
        leftIndex === null ? null : renderedPages[leftIndex],
        "left",
        gutter,
      ),

      createSlot(
        rightIndex === null ? null : renderedPages[rightIndex],
        "right",
        gutter,
      ),
    );
  }

  function handleMediaChange(): void {
    void refresh();
  }

  for (const query of mediaQueries) {
    query.addEventListener("change", handleMediaChange);
  }

  void refresh();

  return {
    element: viewer,
    pageCount: renderedPages.length,

    getPage(): number {
      return currentPage;
    },

    async goTo(index: number): Promise<void> {
      currentPage = Math.max(
        0,
        Math.min(renderedPages.length - 1, Math.floor(index)),
      );

      await refresh();
    },

    async next(): Promise<void> {
      const layout = resolveLayout(options.layouts);

      const amount = layout.mode === "spread" ? 2 : 1;

      currentPage = Math.min(renderedPages.length - 1, currentPage + amount);

      await refresh();
    },

    async previous(): Promise<void> {
      const layout = resolveLayout(options.layouts);

      const amount = layout.mode === "spread" ? 2 : 1;

      currentPage = Math.max(0, currentPage - amount);

      await refresh();
    },

    async refresh(): Promise<void> {
      await refresh();
    },

    destroy(): void {
      if (destroyed) {
        return;
      }

      destroyed = true;

      for (const query of mediaQueries) {
        query.removeEventListener("change", handleMediaChange);
      }

      for (const page of renderedPages) {
        page.destroy();
      }

      viewer.remove();
    },
  };
}
