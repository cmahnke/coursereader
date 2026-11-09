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

  it("pairs pages right-first in spread mode", async () => {
    const viewer = createSpreadViewer();

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

  function createSingleViewer() {
    spawnHost("viewer-host-spawned");

    return createCourseReaderViewer("#viewer-host-spawned", {
      pages: FOUR_PAGES,
      registry: freshPresetRegistry(),
      layouts: [{ query: "all", mode: "single" }],
    });
  }

  function createSpreadViewer(
    options: { gutter?: ResponsiveLayout["gutter"] } = {},
  ) {
    spawnHost("viewer-host-spawned");

    return createCourseReaderViewer("#viewer-host-spawned", {
      pages: FOUR_PAGES,
      registry: freshPresetRegistry(),
      bindingRegistry: freshBindingRegistry(),

      overrides: {
        border: { enabled: true, thickness: 24, darkness: 0.9 },
      },

      layouts: [
        {
          query: "all",
          mode: "spread",
          gap: 0,
          gutter: options.gutter ?? false,
        },
      ],
    });
  }
});
