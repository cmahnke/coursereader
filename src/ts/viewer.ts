/* ==========================================================================
 * Responsive viewer
 * ========================================================================== */

import { bindings, builtInBindings, BindingRegistry } from "./bindings.js";
import { splitBook } from "./book.js";
import { createCourseReaderPage } from "./page.js";
import { presets } from "./presets.js";
import { installStyles } from "./styles.js";
import type {
  CourseReaderPage,
  CourseReaderViewer,
  CourseReaderViewerOptions,
  GutterOptions,
  ResponsiveLayout,
  SplitBookHandle,
} from "./types.js";
import { clamp, deepMerge, resolveElement, spineScaling } from "./utils.js";

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

/*
 * The spine chrome belongs to the sheet: a `data-spine-side`
 * attribute drives the shared page-level rendering (curl half at
 * the seam, fore-edge page blocks at the outer sides), so the
 * viewer and the playground desk render through the same CSS and
 * receive the same tone treatment from the page's stage filter.
 */
function setSpineSide(
  page: CourseReaderPage,
  side: "left" | "right" | null,
): void {
  if (side) {
    page.element.dataset.spineSide = side;
  } else {
    delete page.element.dataset.spineSide;
  }
}

function createSlot(
  page: CourseReaderPage | null,
  side: "single" | "left" | "right",
  gutter: GutterOptions | false,
): HTMLDivElement {
  const slot = document.createElement("div");

  slot.className = "archive-scan-slot";

  slot.dataset.side = side;

  if (page) {
    slot.append(page.element);

    if (gutter && side !== "single") {
      /*
       * The binding shadow belongs to the sheet: inside the
       * content it stops at the sheet's head and tail, sits
       * under the spine curl and passes through the same tone
       * processing as the paper.
       */
      const sheet = page.element.querySelector<HTMLElement>(
        ".archive-scan-content",
      );

      sheet?.append(createGutter(side === "left" ? "right" : "left", gutter));
    }
  } else {
    const empty = document.createElement("div");

    empty.className = "archive-scan-empty";

    slot.append(empty);
  }

  return slot;
}

/*
 * Resolves the viewer's pages: an array is the list of page
 * sources, a single element or selector is one continuous document
 * that `splitBook` divides into page hosts.
 */
function resolveBookPages(
  pages: CourseReaderViewerOptions["pages"],
  hostClasses: string | string[] | undefined,
): { book: SplitBookHandle | null; sourcePages: HTMLElement[] } {
  if (Array.isArray(pages)) {
    return { book: null, sourcePages: pages.map(resolveElement) };
  }

  const book = splitBook(pages, { hostClasses });

  return { book, sourcePages: book.pages.map(resolveElement) };
}

/**
 * Creates a responsive single-page or spread viewer.
 *
 * The viewer renders every page through {@link createCourseReaderPage} and
 * switches layouts as the supplied media queries match. Navigation
 * moves by one page in single mode and two pages in spread mode.
 * With the `continuous` option every seat stacks below the previous
 * one and navigation scrolls through the stack instead. With
 * `followLinks` fragment links inside the pages navigate to the
 * page containing the target id.
 *
 * `pages` accepts an array of page elements or selectors, or a
 * single element or selector: in the single form the element is
 * treated as one continuous document and split into pages at the
 * book break markers — `<hr>`, `data-page-break` and computed
 * `break-before`/`break-after: page`. Destroying the viewer
 * restores the document.
 *
 * @param target - Host element or selector that receives the viewer.
 * @param options - Pages, presets, layouts and registry overrides.
 * @returns A handle for navigating and destroying the viewer.
 * @throws {Error} When `options.pages` is empty or a page cannot be found.
 *
 * @example
 * ```ts
 * const viewer = createCourseReaderViewer("#reader", {
 *   pages: ["#page-1", "#page-2"],
 *   preset: "analog-gray-copy",
 *   layouts: [
 *     { query: "(min-width: 900px)", mode: "spread", gutter: "bound-volume" },
 *     { query: "all", mode: "single" },
 *   ],
 * });
 * ```
 */
export function createCourseReaderViewer(
  target: HTMLElement | string,
  options: CourseReaderViewerOptions,
): CourseReaderViewer {
  installStyles();

  const host = resolveElement(target);

  /*
   * A single element or selector — without the array — is one
   * continuous document: it is split into page hosts at the book
   * break markers and restored when the viewer is destroyed.
   */
  const { book, sourcePages } = resolveBookPages(
    options.pages,
    options.bookHostClasses,
  );

  if (sourcePages.length === 0) {
    book?.restore();

    throw new Error("Archive viewer requires at least one page.");
  }

  const registry = options.registry ?? presets;

  const bindingRegistry = options.bindingRegistry ?? bindings;

  const viewer = document.createElement("div");

  viewer.className = "archive-scan-viewer";

  host.append(viewer);

  const renderedPages = sourcePages.map((source, index) =>
    createCourseReaderPage(source, {
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

  /*
   * The spine pages scale the fold depth onto the curl and stack
   * sheet edges at the fore-edges, matching the desk's fold
   * scaling. Without the option the CSS defaults reproduce the
   * original look.
   */
  if (options.spinePages !== undefined) {
    const scaling = spineScaling(options.spinePages);

    viewer.style.setProperty(
      "--archive-curl-half",
      `${scaling.curlHalf.toFixed(1)}px`,
    );

    viewer.style.setProperty(
      "--archive-block-depth",
      `${scaling.blockDepth}px`,
    );
  }

  const mediaQueries = options.layouts.map((layout) =>
    window.matchMedia(layout.query),
  );

  function firstPageSide(layout: ResponsiveLayout): "left" | "right" {
    return layout.spread?.firstPageSide ?? "left";
  }

  /*
   * Spreads tile the pages in rows: with the first page on the
   * left, row n seats pages 2n and 2n + 1; with the first page on
   * the right, row 0 seats page 0 alone and row n seats pages
   * 2n - 1 and 2n. Seats beyond the page count stay empty.
   */
  function spreadRow(
    layout: ResponsiveLayout,
    row: number,
  ): [number | null, number | null] {
    if (firstPageSide(layout) === "right") {
      if (row === 0) {
        return [null, 0];
      }

      return [2 * row - 1, 2 * row];
    }

    return [2 * row, 2 * row + 1];
  }

  function spreadRowCount(layout: ResponsiveLayout): number {
    if (firstPageSide(layout) === "right") {
      return 1 + Math.ceil((renderedPages.length - 1) / 2);
    }

    return Math.ceil(renderedPages.length / 2);
  }

  function rowForPage(layout: ResponsiveLayout, page: number): number {
    if (firstPageSide(layout) === "right") {
      return page === 0 ? 0 : Math.ceil(page / 2);
    }

    return Math.floor(page / 2);
  }

  function seat(
    layout: ResponsiveLayout,
    row: number,
  ): [number | null, number | null] {
    const [leftIndex, rightIndex] = spreadRow(layout, row);

    return [
      leftIndex !== null && leftIndex < renderedPages.length ? leftIndex : null,

      rightIndex !== null && rightIndex < renderedPages.length
        ? rightIndex
        : null,
    ];
  }

  /*
   * The binding side of a spread has no exposed glass, so the
   * copier frame is suppressed there and facing pages meet at
   * the spine. Pages away from a spread keep full frames.
   */
  function applyFrameSides(
    suppressSpine: boolean,
    rows: Array<[number | null, number | null]>,
  ): void {
    const suppressedRight = new Set<number>();

    const suppressedLeft = new Set<number>();

    if (suppressSpine) {
      for (const [leftIndex, rightIndex] of rows) {
        if (leftIndex !== null) {
          suppressedRight.add(leftIndex);
        }

        if (rightIndex !== null) {
          suppressedLeft.add(rightIndex);
        }
      }
    }

    for (const [index, page] of renderedPages.entries()) {
      page.update({
        border: {
          sides: {
            right: !suppressedRight.has(index),

            left: !suppressedLeft.has(index),
          },
        },
      });
    }
  }

  function applySpineSides(rows: Array<[number | null, number | null]>): void {
    const leftSeats = new Set<number>();

    const rightSeats = new Set<number>();

    for (const [leftIndex, rightIndex] of rows) {
      if (leftIndex !== null) {
        leftSeats.add(leftIndex);
      }

      if (rightIndex !== null) {
        rightSeats.add(rightIndex);
      }
    }

    for (const [index, page] of renderedPages.entries()) {
      setSpineSide(
        page,
        leftSeats.has(index) ? "left" : rightSeats.has(index) ? "right" : null,
      );
    }
  }

  function createSpreadRow(
    layout: ResponsiveLayout,
    row: number,
    gutter: GutterOptions | false,
  ): HTMLDivElement {
    const [leftIndex, rightIndex] = seat(layout, row);

    const rowElement = document.createElement("div");

    rowElement.className = "archive-scan-row";

    rowElement.append(
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

    return rowElement;
  }

  function createSingleRow(page: CourseReaderPage): HTMLDivElement {
    const rowElement = document.createElement("div");

    rowElement.className = "archive-scan-row";

    rowElement.append(createSlot(page, "single", false));

    return rowElement;
  }

  function scrollToCurrentPage(): void {
    renderedPages[currentPage]?.element.scrollIntoView({ block: "start" });
  }

  async function refresh(): Promise<void> {
    if (destroyed) {
      return;
    }

    const layout = resolveLayout(options.layouts);

    const gutter = resolveGutter(layout.gutter, bindingRegistry);

    const continuous = options.continuous === true;

    viewer.dataset.mode = layout.mode;

    viewer.dataset.fit = layout.pageFit ?? "contain";

    if (continuous) {
      viewer.dataset.continuous = "true";
    } else {
      delete viewer.dataset.continuous;
    }

    viewer.style.setProperty("--archive-gap", `${layout.gap ?? 0}px`);

    /*
     * The gutter lives on the sheet between refreshes, so stale
     * ones are stripped before pages are re-seated — otherwise
     * revisiting a spread accumulates duplicates.
     */
    for (const page of renderedPages) {
      page.element.querySelector(".archive-scan-gutter")?.remove();
    }

    if (layout.background) {
      viewer.style.background = layout.background;
    } else {
      viewer.style.removeProperty("background");
    }

    if (layout.mode === "single") {
      applyFrameSides(false, []);

      applySpineSides([]);

      if (continuous) {
        viewer.replaceChildren(...renderedPages.map(createSingleRow));
      } else {
        viewer.replaceChildren(
          createSlot(renderedPages[currentPage], "single", false),
        );
      }

      if (continuous) {
        scrollToCurrentPage();
      }

      return;
    }

    if (continuous) {
      const rowCount = spreadRowCount(layout);

      const rows = Array.from({ length: rowCount }, (_, row) =>
        seat(layout, row),
      );

      applyFrameSides(gutter !== false, rows);

      applySpineSides(rows);

      viewer.replaceChildren(
        ...Array.from({ length: rowCount }, (_, row) =>
          createSpreadRow(layout, row, gutter),
        ),
      );

      scrollToCurrentPage();

      return;
    }

    const row = seat(layout, rowForPage(layout, currentPage));

    const [leftIndex, rightIndex] = row;

    applyFrameSides(gutter !== false, [row]);

    applySpineSides([row]);

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

  async function goTo(index: number): Promise<void> {
    currentPage = Math.max(
      0,
      Math.min(renderedPages.length - 1, Math.floor(index)),
    );

    if (options.continuous === true) {
      scrollToCurrentPage();

      return;
    }

    await refresh();
  }

  /*
   * Fragment links between pages become viewer navigation: the
   * click resolves to the first page whose source carries the
   * target id — either as the page itself or as a descendant, so
   * deep links like `#section-2` inside a page land on that page.
   * Unseated pages are detached from the document, hence the
   * lookup against the source elements instead of the document.
   */
  function handleViewerClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) {
      return;
    }

    const anchor = event.target.closest("a[href]");

    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (anchor.target === "_blank") {
      return;
    }

    const href = anchor.getAttribute("href");

    if (!href || !href.startsWith("#")) {
      return;
    }

    const fragment = href.slice(1);

    if (!fragment) {
      return;
    }

    const index = sourcePages.findIndex(
      (source) =>
        source.id === fragment ||
        source.querySelector(`#${CSS.escape(fragment)}`) !== null,
    );

    if (index === -1) {
      return;
    }

    event.preventDefault();

    void goTo(index);
  }

  for (const query of mediaQueries) {
    query.addEventListener("change", handleMediaChange);
  }

  if (options.followLinks === true) {
    viewer.addEventListener("click", handleViewerClick);
  }

  void refresh();

  return {
    element: viewer,
    pageCount: renderedPages.length,

    getPage(): number {
      return currentPage;
    },

    async goTo(index: number): Promise<void> {
      await goTo(index);
    },

    async next(): Promise<void> {
      const layout = resolveLayout(options.layouts);

      const amount = layout.mode === "spread" ? 2 : 1;

      currentPage = Math.min(renderedPages.length - 1, currentPage + amount);

      if (options.continuous === true) {
        scrollToCurrentPage();

        return;
      }

      await refresh();
    },

    async previous(): Promise<void> {
      const layout = resolveLayout(options.layouts);

      const amount = layout.mode === "spread" ? 2 : 1;

      currentPage = Math.max(0, currentPage - amount);

      if (options.continuous === true) {
        scrollToCurrentPage();

        return;
      }

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

      viewer.removeEventListener("click", handleViewerClick);

      for (const page of renderedPages) {
        page.destroy();
      }

      book?.restore();

      viewer.remove();
    },
  };
}
