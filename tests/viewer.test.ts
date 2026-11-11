import { beforeEach, describe, expect, it } from "vitest";

import { createCourseReaderViewer } from "../src/ts/viewer.js";
import type { ResponsiveLayout } from "../src/ts/types.js";

import {
  customProperty,
  freshBindingRegistry,
  freshPresetRegistry,
  sampleDocument,
} from "./helpers.js";

const FOUR_PAGES = [
  "#viewer-page-1",
  "#viewer-page-2",
  "#viewer-page-3",
  "#viewer-page-4",
];

interface HappyWindow {
  happyDOM: {
    setViewport(viewport: { width: number; height: number }): void;
  };
}

describe("createCourseReaderViewer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";

    for (let index = 1; index <= 4; index += 1) {
      sampleDocument(`viewer-page-${index}`);
    }
  });

  it("throws for an unknown host", () => {
    expect(() =>
      createCourseReaderViewer("#missing-host", { pages: FOUR_PAGES }),
    ).toThrow(/Archive Scan source was not found/);
  });

  it("throws without pages", () => {
    const host = spawnHost("viewer-host-spawned");

    expect(() => createCourseReaderViewer(host, { pages: [] })).toThrow(
      /at least one page/,
    );
  });

  it("clamps the initial page", async () => {
    const viewer = createSingleViewer();

    await viewer.goTo(99);

    expect(viewer.getPage()).toBe(3);

    await viewer.goTo(-5);

    expect(viewer.getPage()).toBe(0);
  });

  it("renders a single-page layout", async () => {
    const viewer = createSingleViewer();

    await viewer.refresh();

    expect(viewer.element.dataset.mode).toBe("single");

    expect(viewer.element.dataset.fit).toBe("contain");

    expect(viewer.element.querySelectorAll(".archive-scan-slot")).toHaveLength(
      1,
    );

    expect(
      viewer.element.querySelector(".archive-scan-slot .archive-scan-page"),
    ).not.toBeNull();

    viewer.destroy();
  });

  it("advances by one page in single mode", async () => {
    const viewer = createSingleViewer();

    await viewer.next();
    await viewer.next();

    expect(viewer.getPage()).toBe(2);

    await viewer.previous();

    expect(viewer.getPage()).toBe(1);

    await viewer.previous();
    await viewer.previous();

    expect(viewer.getPage()).toBe(0);

    viewer.destroy();
  });

  it("renders a facing-pages spread without a gutter", async () => {
    const viewer = createCourseReaderViewer(spawnHost("viewer-host-spawned"), {
      pages: FOUR_PAGES,
      registry: freshPresetRegistry(),
      layouts: [{ query: "all", mode: "spread", gap: 0 }],
    });

    await viewer.refresh();

    expect(viewer.element.dataset.mode).toBe("spread");

    expect(
      viewer.element.querySelectorAll(".archive-scan-gutter"),
    ).toHaveLength(0);

    viewer.destroy();
  });

  it("pairs pages sequentially in spread mode", async () => {
    const viewer = createSpreadViewer();

    await viewer.goTo(0);

    /* The opening spread seats pages one and two. */
    const opening = slotPages(viewer);

    expect(opening).toHaveLength(2);

    expect(
      opening[0]!.contains(document.querySelector("#viewer-page-1")!),
    ).toBe(true);

    expect(
      opening[1]!.contains(document.querySelector("#viewer-page-2")!),
    ).toBe(true);

    expect(viewer.element.querySelector(".archive-scan-empty")).toBeNull();

    await viewer.goTo(2);

    expect(viewer.element.querySelector(".archive-scan-empty")).toBeNull();

    const pages = slotPages(viewer);

    expect(pages).toHaveLength(2);

    /* Even pages sit on the left: the spread at page three shows
       pages three and four. */
    expect(pages[0]!.contains(document.querySelector("#viewer-page-3")!)).toBe(
      true,
    );

    expect(pages[1]!.contains(document.querySelector("#viewer-page-4")!)).toBe(
      true,
    );

    viewer.destroy();
  });

  it("pairs pages right-first when configured", async () => {
    const viewer = createSpreadViewer({ firstPageSide: "right" });

    await viewer.goTo(0);

    /* Page one sits alone on the right; the left slot is empty. */
    const opening = slotPages(viewer);

    expect(opening).toHaveLength(1);

    expect(
      opening[0]!.contains(document.querySelector("#viewer-page-1")!),
    ).toBe(true);

    expect(viewer.element.querySelector(".archive-scan-empty")).not.toBeNull();

    await viewer.goTo(1);

    expect(viewer.element.querySelector(".archive-scan-empty")).toBeNull();

    const pages = slotPages(viewer);

    expect(pages).toHaveLength(2);

    /* With firstPageSide "right", odd pages sit on the left: the
       spread at page two shows pages two and three. */
    expect(pages[0]!.contains(document.querySelector("#viewer-page-2")!)).toBe(
      true,
    );

    expect(pages[1]!.contains(document.querySelector("#viewer-page-3")!)).toBe(
      true,
    );

    viewer.destroy();
  });

  it("starts on a full two-page spread", () => {
    const viewer = createSpreadViewer();

    const pages = slotPages(viewer);

    expect(pages).toHaveLength(2);

    expect(pages[0]!.contains(document.querySelector("#viewer-page-1")!)).toBe(
      true,
    );

    expect(pages[1]!.contains(document.querySelector("#viewer-page-2")!)).toBe(
      true,
    );

    viewer.destroy();
  });

  it("stacks every page in continuous single mode", () => {
    const viewer = createSingleViewer({ continuous: true });

    expect(viewer.element.dataset.continuous).toBe("true");

    const pages = slotPages(viewer);

    expect(pages).toHaveLength(4);

    for (const [index, page] of pages.entries()) {
      expect(
        page.contains(document.querySelector(`#viewer-page-${index + 1}`)!),
      ).toBe(true);
    }

    viewer.destroy();
  });

  it("stacks every spread row in continuous spread mode", () => {
    const viewer = createSpreadViewer({ continuous: true, gutter: "subtle" });

    expect(viewer.element.dataset.continuous).toBe("true");

    const rows = [
      ...viewer.element.querySelectorAll(".archive-scan-row"),
    ] as HTMLElement[];

    expect(rows).toHaveLength(2);

    const pages = slotPages(viewer);

    expect(pages).toHaveLength(4);

    expect(pages[0]!.contains(document.querySelector("#viewer-page-1")!)).toBe(
      true,
    );

    expect(pages[1]!.contains(document.querySelector("#viewer-page-2")!)).toBe(
      true,
    );

    expect(pages[2]!.contains(document.querySelector("#viewer-page-3")!)).toBe(
      true,
    );

    expect(pages[3]!.contains(document.querySelector("#viewer-page-4")!)).toBe(
      true,
    );

    /* Every row marks and frames its own spine sides. */
    expect(pages[0]!.dataset.spineSide).toBe("left");

    expect(pages[1]!.dataset.spineSide).toBe("right");

    expect(pages[2]!.dataset.spineSide).toBe("left");

    expect(pages[3]!.dataset.spineSide).toBe("right");

    expect(customProperty(pages[0]!, "--archive-frame-right")).toBe("0.0px");

    expect(customProperty(pages[1]!, "--archive-frame-left")).toBe("0.0px");

    expect(customProperty(pages[2]!, "--archive-frame-right")).toBe("0.0px");

    expect(customProperty(pages[3]!, "--archive-frame-left")).toBe("0.0px");

    viewer.destroy();
  });

  it("keeps the lone seats in continuous right mode", () => {
    const viewer = createSpreadViewer({
      continuous: true,
      firstPageSide: "right",
    });

    const rows = [
      ...viewer.element.querySelectorAll(".archive-scan-row"),
    ] as HTMLElement[];

    expect(rows).toHaveLength(3);

    /* The opener seats alone, then one pair, then a lone tail page. */
    expect(viewer.element.querySelectorAll(".archive-scan-empty")).toHaveLength(
      2,
    );

    const pages = slotPages(viewer);

    expect(pages).toHaveLength(4);

    expect(pages[0]!.contains(document.querySelector("#viewer-page-1")!)).toBe(
      true,
    );

    expect(pages[1]!.contains(document.querySelector("#viewer-page-2")!)).toBe(
      true,
    );

    expect(pages[2]!.contains(document.querySelector("#viewer-page-3")!)).toBe(
      true,
    );

    expect(pages[3]!.contains(document.querySelector("#viewer-page-4")!)).toBe(
      true,
    );

    viewer.destroy();
  });

  it("scrolls instead of re-rendering in continuous mode", async () => {
    const viewer = createSpreadViewer({ continuous: true });

    const firstSlot = viewer.element.querySelector(".archive-scan-slot");

    await viewer.next();

    expect(viewer.getPage()).toBe(2);

    expect(viewer.element.querySelector(".archive-scan-slot")).toBe(firstSlot);

    viewer.destroy();
  });

  it("navigates on a fragment link when followLinks is enabled", async () => {
    const link = document.createElement("a");

    link.setAttribute("href", "#viewer-page-3");

    link.textContent = "To the results";

    document.querySelector("#viewer-page-1")!.append(link);

    const viewer = createSingleViewer({ followLinks: true });

    link.click();

    expect(viewer.getPage()).toBe(2);

    const pages = slotPages(viewer);

    expect(pages).toHaveLength(1);

    expect(pages[0]!.contains(document.querySelector("#viewer-page-3")!)).toBe(
      true,
    );

    viewer.destroy();
  });

  it("follows a deep link to the page containing the target id", async () => {
    const section = document.createElement("section");

    section.id = "viewer-section-4";

    document.querySelector("#viewer-page-4")!.append(section);

    const link = document.createElement("a");

    link.setAttribute("href", "#viewer-section-4");

    link.textContent = "To the appendix";

    document.querySelector("#viewer-page-1")!.append(link);

    const viewer = createSingleViewer({ followLinks: true });

    link.click();

    expect(viewer.getPage()).toBe(3);

    viewer.destroy();
  });

  it("leaves links alone when followLinks is disabled", async () => {
    const link = document.createElement("a");

    link.setAttribute("href", "#viewer-page-3");

    link.textContent = "To the results";

    document.querySelector("#viewer-page-1")!.append(link);

    const viewer = createSingleViewer();

    link.click();

    expect(viewer.getPage()).toBe(0);

    viewer.destroy();
  });

  it("keeps the browser default for unknown fragments", async () => {
    const link = document.createElement("a");

    link.setAttribute("href", "#does-not-exist");

    link.textContent = "Unknown";

    document.querySelector("#viewer-page-1")!.append(link);

    const viewer = createSingleViewer({ followLinks: true });

    link.click();

    expect(viewer.getPage()).toBe(0);

    viewer.destroy();
  });

  it("keeps the browser default for modifier clicks", async () => {
    const link = document.createElement("a");

    link.setAttribute("href", "#viewer-page-3");

    link.textContent = "To the results";

    document.querySelector("#viewer-page-1")!.append(link);

    const viewer = createSingleViewer({ followLinks: true });

    link.dispatchEvent(
      new MouseEvent("click", { bubbles: true, ctrlKey: true }),
    );

    expect(viewer.getPage()).toBe(0);

    viewer.destroy();
  });

  it("navigates in continuous mode without replacing the stack", async () => {
    const link = document.createElement("a");

    link.setAttribute("href", "#viewer-page-3");

    link.textContent = "To the results";

    document.querySelector("#viewer-page-1")!.append(link);

    const viewer = createSpreadViewer({ continuous: true, followLinks: true });

    const firstSlot = viewer.element.querySelector(".archive-scan-slot");

    link.click();

    expect(viewer.getPage()).toBe(2);

    expect(viewer.element.querySelector(".archive-scan-slot")).toBe(firstSlot);

    viewer.destroy();
  });

  it("advances by two pages in spread mode and clamps", async () => {
    const viewer = createSpreadViewer();

    await viewer.next();

    expect(viewer.getPage()).toBe(2);

    await viewer.next();

    expect(viewer.getPage()).toBe(3);

    await viewer.next();

    expect(viewer.getPage()).toBe(3);

    await viewer.previous();

    expect(viewer.getPage()).toBe(1);

    viewer.destroy();
  });

  it("suppresses the frame on the spine sides", async () => {
    const viewer = createSpreadViewer({ gutter: "subtle" });

    await viewer.goTo(1);

    const pages = [
      ...viewer.element.querySelectorAll<HTMLElement>(".archive-scan-page"),
    ];

    expect(pages).toHaveLength(2);

    /* The left sheet loses its right edge at the spine. */
    expect(customProperty(pages[0]!, "--archive-frame-right")).toBe("0.0px");

    expect(
      Number.parseFloat(customProperty(pages[0]!, "--archive-frame-left")),
    ).toBeGreaterThan(0);

    /* The right sheet loses its left edge at the spine. */
    expect(customProperty(pages[1]!, "--archive-frame-left")).toBe("0.0px");

    viewer.destroy();
  });

  it("renders a named gutter with edge metadata", async () => {
    const viewer = createSpreadViewer({ gutter: "deep-bound-volume" });

    await viewer.goTo(1);

    const gutters = [
      ...viewer.element.querySelectorAll<HTMLElement>(".archive-scan-gutter"),
    ];

    expect(gutters).toHaveLength(2);

    expect(gutters[0]!.dataset.edge).toBe("right");

    expect(gutters[1]!.dataset.edge).toBe("left");

    viewer.destroy();
  });

  it("does not duplicate gutters when re-seating a spread", async () => {
    const viewer = createSpreadViewer({ gutter: "subtle" });

    await viewer.goTo(1);

    await viewer.goTo(1);

    expect(
      viewer.element.querySelectorAll(".archive-scan-gutter"),
    ).toHaveLength(2);

    viewer.destroy();
  });

  it("accepts gutter objects overriding the subtle base", async () => {
    const viewer = createSpreadViewer({ gutter: { width: 99 } });

    await viewer.goTo(1);

    const gutter = viewer.element.querySelector<HTMLElement>(
      ".archive-scan-gutter",
    )!;

    expect(customProperty(gutter, "--gutter-width")).toBe("99px");

    viewer.destroy();
  });

  it("omits gutters when disabled", async () => {
    const viewer = createSpreadViewer({ gutter: false });

    await viewer.goTo(1);

    expect(
      viewer.element.querySelectorAll(".archive-scan-gutter"),
    ).toHaveLength(0);

    viewer.destroy();
  });

  it("marks the spread sides for the shared spine renderer", async () => {
    const viewer = createSpreadViewer({ gutter: "subtle" });

    await viewer.goTo(1);

    const pages = slotPages(viewer);

    expect(pages).toHaveLength(2);

    /* The left sheet curls on its right edge at the spine. */
    expect(pages[0]!.dataset.spineSide).toBe("left");

    /* The right sheet curls on its left edge at the spine. */
    expect(pages[1]!.dataset.spineSide).toBe("right");

    viewer.destroy();
  });

  it("keeps the spine markers when the gutter is disabled", async () => {
    const viewer = createSpreadViewer({ gutter: false });

    await viewer.goTo(1);

    const pages = slotPages(viewer);

    expect(pages[0]!.dataset.spineSide).toBe("left");

    expect(pages[1]!.dataset.spineSide).toBe("right");

    viewer.destroy();
  });

  it("omits the spine markers in single mode and keeps them for lone spreads", async () => {
    const viewer = createSingleViewer();

    await viewer.refresh();

    expect(viewer.element.querySelectorAll("[data-spine-side]")).toHaveLength(
      0,
    );

    const spread = createSpreadViewer({
      gutter: "subtle",
      firstPageSide: "right",
    });

    /* The opening spread seats page one alone on the right. */
    await spread.goTo(0);

    const pages = slotPages(spread);

    expect(pages).toHaveLength(1);

    expect(pages[0]!.dataset.spineSide).toBe("right");

    /* Returning to a full spread re-marks both sheets. */
    await spread.goTo(1);

    expect(slotPages(spread)[0]!.dataset.spineSide).toBe("left");

    viewer.destroy();
    spread.destroy();
  });

  it("scales the spine through the spinePages option", () => {
    const host = spawnHost("viewer-host-spawned");

    const viewer = createCourseReaderViewer(host, {
      pages: FOUR_PAGES,
      registry: freshPresetRegistry(),
      spinePages: 8,
      layouts: [{ query: "all", mode: "spread", gap: 0 }],
    });

    /* Eight pages per side: curl half 24 * (0.75 + 8 / 32),
       block depth 3 + 8. */
    expect(customProperty(viewer.element, "--archive-curl-half")).toBe(
      "24.0px",
    );

    expect(customProperty(viewer.element, "--archive-block-depth")).toBe(
      "11px",
    );

    viewer.destroy();
  });

  it("leaves the spine scaling to the CSS defaults without spinePages", () => {
    const viewer = createSpreadViewer();

    expect(customProperty(viewer.element, "--archive-curl-half")).toBe("");

    expect(customProperty(viewer.element, "--archive-block-depth")).toBe("");

    viewer.destroy();
  });

  it("follows media query changes", async () => {
    const layouts: ResponsiveLayout[] = [
      { query: "(min-width: 900px)", mode: "spread", gap: 0 },
      { query: "(max-width: 899px)", mode: "single" },
    ];

    (window as unknown as HappyWindow).happyDOM.setViewport({
      width: 600,
      height: 800,
    });

    const viewer = createCourseReaderViewer(spawnHost("viewer-host-spawned"), {
      pages: FOUR_PAGES,
      registry: freshPresetRegistry(),
      layouts,
    });

    await viewer.refresh();

    expect(viewer.element.dataset.mode).toBe("single");

    (window as unknown as HappyWindow).happyDOM.setViewport({
      width: 1200,
      height: 800,
    });

    await viewer.refresh();

    expect(viewer.element.dataset.mode).toBe("spread");

    viewer.destroy();
  });

  it("tears down pages and removes the viewer", () => {
    const viewer = createSingleViewer();

    viewer.destroy();

    expect(document.querySelector(".archive-scan-viewer")).toBeNull();

    /* The original page sources return to the document body. */
    expect(document.querySelectorAll(".archive-scan-page")).toHaveLength(0);

    for (let index = 1; index <= 4; index += 1) {
      expect(document.querySelector(`#viewer-page-${index}`)).not.toBeNull();
    }
  });

  it("applies range overrides deterministically to every page", () => {
    spawnHost("viewer-host-ranges");

    const viewer = createCourseReaderViewer("#viewer-host-ranges", {
      pages: FOUR_PAGES,
      registry: freshPresetRegistry(),
      seed: "range-viewer-seed",
      continuous: true,

      overrides: {
        exposure: { brightness: [1.1, 1.5] },
      },

      layouts: [{ query: "all", mode: "single" }],
    });

    const pages = slotPages(viewer);

    expect(pages).toHaveLength(4);

    for (const page of pages) {
      const brightness = Number.parseFloat(
        customProperty(page, "--archive-brightness"),
      );

      expect(brightness).toBeGreaterThanOrEqual(1.1);

      expect(brightness).toBeLessThanOrEqual(1.5);
    }

    viewer.destroy();
  });

  function slotPages(viewer: { element: HTMLElement }): HTMLElement[] {
    return [
      ...viewer.element.querySelectorAll<HTMLElement>(
        ".archive-scan-slot > .archive-scan-page",
      ),
    ];
  }

  function spawnHost(id: string): HTMLElement {
    const host = document.createElement("div");

    host.id = id;

    document.body.append(host);

    return host;
  }

  function createSingleViewer(
    options: { continuous?: boolean; followLinks?: boolean } = {},
  ) {
    spawnHost("viewer-host-spawned");

    return createCourseReaderViewer("#viewer-host-spawned", {
      pages: FOUR_PAGES,
      registry: freshPresetRegistry(),
      continuous: options.continuous,
      followLinks: options.followLinks,
      layouts: [{ query: "all", mode: "single" }],
    });
  }

  function createSpreadViewer(
    options: {
      gutter?: ResponsiveLayout["gutter"];
      firstPageSide?: "left" | "right";
      continuous?: boolean;
    } = {},
  ) {
    spawnHost("viewer-host-spawned");

    return createCourseReaderViewer("#viewer-host-spawned", {
      pages: FOUR_PAGES,
      registry: freshPresetRegistry(),
      bindingRegistry: freshBindingRegistry(),
      continuous: options.continuous,
      followLinks: options.followLinks,

      overrides: {
        border: { enabled: true, thickness: 24, darkness: 0.9 },
      },

      layouts: [
        {
          query: "all",
          mode: "spread",
          gap: 0,
          gutter: options.gutter ?? false,
          spread: options.firstPageSide
            ? { firstPageSide: options.firstPageSide }
            : undefined,
        },
      ],
    });
  }
});
