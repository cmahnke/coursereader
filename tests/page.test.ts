import { beforeEach, describe, expect, it } from "vitest";

import { createCourseReaderPage } from "../src/ts/page.js";
import type { CourseReaderPage } from "../src/ts/types.js";

import {
  customProperty,
  freshPresetRegistry,
  sampleDocument,
} from "./helpers.js";

function createPage(
  source: HTMLElement,
  options: Parameters<typeof createCourseReaderPage>[1] = {},
): CourseReaderPage {
  return createCourseReaderPage(source, {
    registry: freshPresetRegistry(),
    ...options,
  });
}

const PLACEMENT_SELECTORS = [
  ".archive-scan-exposure",
  ".archive-scan-bleed",
  ".archive-scan-paper-texture",
  ".archive-scan-grain",
  ".archive-scan-edge",
] as const;

function placementStyles(page: CourseReaderPage): Array<string | null> {
  return PLACEMENT_SELECTORS.map((selector) => {
    const overlay = page.element.querySelector<HTMLElement>(selector)!;

    return overlay.getAttribute("style");
  });
}

describe("createCourseReaderPage", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("wraps the attached source in the scan treatment", () => {
    const source = sampleDocument("wrap-doc");

    const page = createPage(source);

    const wrapper = document.querySelector(".archive-scan-page")!;

    expect(wrapper).toBe(page.element);

    expect(wrapper.querySelector(".archive-scan-content")).not.toBeNull();

    expect(wrapper.contains(source)).toBe(true);

    expect(page.content).toBe(source);
  });

  it("throws for detached sources", () => {
    const detached = document.createElement("div");

    expect(() => createPage(detached)).toThrow(
      /must be attached to the document/,
    );
  });

  it("throws for unknown presets", () => {
    const source = sampleDocument("unknown-preset");

    expect(() =>
      createCourseReaderPage(source, {
        preset: "no-such-preset",
        registry: freshPresetRegistry(),
      }),
    ).toThrow(/Unknown preset "no-such-preset"/);
  });

  it("reads back the merged settings", () => {
    const source = sampleDocument("readback-doc");

    const preset = freshPresetRegistry().resolve("microfilm-journal");

    const page = createPage(source, {
      preset: "microfilm-journal",
      seed: "fixed",
      overrides: { paper: { tone: 0.3 }, artifacts: { scratches: 0.25 } },
    });

    expect(page.settings.paper.tone).toBe(0.3);

    expect(page.settings.artifacts.scratches).toBe(0.25);

    /* Untouched values still come from the preset. */
    expect(page.settings.artifacts.grain).toBe(preset.artifacts.grain);

    /* The settings getter returns a clone, not live state. */
    const snapshot = page.settings;

    snapshot.paper.tone = 1;

    expect(page.settings.paper.tone).toBe(0.3);
  });

  it("renders deterministic output for identical seeds", () => {
    const firstSource = sampleDocument("determinism-a");

    const secondSource = sampleDocument("determinism-b");

    const options = {
      seed: "deterministic-seed",
      overrides: { artifacts: { grain: 0.5, dust: 0.4, scratches: 0.3 } },
    } as const;

    const first = createPage(firstSource, { ...options, enhancement: "css" });

    const second = createPage(secondSource, { ...options, enhancement: "css" });

    for (const name of [
      "--archive-paper",
      "--archive-texture-image",
      "--archive-grain-image",
      "--archive-unevenness",
    ]) {
      expect(customProperty(first.element, name)).toBe(
        customProperty(second.element, name),
      );
    }

    const firstSpecks = [
      ...first.element.querySelectorAll(".archive-scan-dust"),
    ];
    const secondSpecks = [
      ...second.element.querySelectorAll(".archive-scan-dust"),
    ];

    expect(firstSpecks).toHaveLength(secondSpecks.length);

    expect(firstSpecks.length).toBeGreaterThan(0);

    expect(firstSpecks.map((speck) => speck.getAttribute("style"))).toEqual(
      secondSpecks.map((speck) => speck.getAttribute("style")),
    );

    /* Overlay placement is seeded as well. */
    expect(placementStyles(first)).toEqual(placementStyles(second));

    const exposure = first.element.querySelector<HTMLElement>(
      ".archive-scan-exposure",
    )!;

    expect(exposure.style.getPropertyValue("--archive-unevenness-x")).toBe(
      "44.00%",
    );

    expect(
      exposure.style.getPropertyValue("--archive-unevenness-angle-a"),
    ).toBe("96.00deg");
  });

  it("produces different noise for different seeds", () => {
    const firstSource = sampleDocument("seed-a");

    const secondSource = sampleDocument("seed-b");

    const first = createPage(firstSource, { seed: "seed-one" });

    const second = createPage(secondSource, { seed: "seed-two" });

    expect(customProperty(second.element, "--archive-grain-image")).not.toBe(
      customProperty(first.element, "--archive-grain-image"),
    );
  });

  it("seeds the overlay placement so different seeds diverge", () => {
    const firstSource = sampleDocument("placement-a");

    const secondSource = sampleDocument("placement-b");

    const options = {
      overrides: {
        exposure: { unevenness: 0.5 },
        artifacts: { bleedThrough: 0.6, edgeNoise: 0.7 },
      },
    } as const;

    const first = createPage(firstSource, {
      seed: "placement-one",
      ...options,
    });

    const second = createPage(secondSource, {
      seed: "placement-two",
      ...options,
    });

    expect(placementStyles(second)).not.toEqual(placementStyles(first));

    const firstExposure = first.element.querySelector<HTMLElement>(
      ".archive-scan-exposure",
    )!;

    const secondExposure = second.element.querySelector<HTMLElement>(
      ".archive-scan-exposure",
    )!;

    expect(
      secondExposure.style.getPropertyValue("--archive-unevenness-x"),
    ).not.toBe(firstExposure.style.getPropertyValue("--archive-unevenness-x"));

    expect(
      secondExposure.style.getPropertyValue("--archive-unevenness-angle-a"),
    ).not.toBe(
      firstExposure.style.getPropertyValue("--archive-unevenness-angle-a"),
    );

    const firstEdge =
      first.element.querySelector<HTMLElement>(".archive-scan-edge")!;

    const secondEdge =
      second.element.querySelector<HTMLElement>(".archive-scan-edge")!;

    expect(
      secondEdge.style.getPropertyValue("--archive-edge-blur-left"),
    ).not.toBe(firstEdge.style.getPropertyValue("--archive-edge-blur-left"));
  });

  it("keeps the seeded placement stable across unrelated updates", () => {
    const source = sampleDocument("placement-update");

    const page = createPage(source, {
      seed: "placement-update-seed",
      overrides: { exposure: { unevenness: 0.4 } },
    });

    const before = placementStyles(page);

    page.update({ paper: { tone: 0.4 } });

    expect(placementStyles(page)).toEqual(before);
  });

  it("renders the paper tone into the page custom property", () => {
    const source = sampleDocument("paper-doc");

    const page = createPage(source, {
      overrides: { paper: { tone: 0.5 } },
    });

    expect(customProperty(page.element, "--archive-paper")).toBe(
      "rgb(128, 128, 128)",
    );
  });

  it("derives the selection colors from the paper tone", () => {
    const source = sampleDocument("selection-doc");

    const page = createPage(source, {
      overrides: { paper: { tone: 0.5 } },
    });

    expect(customProperty(page.element, "--archive-selection-background")).toBe(
      "rgb(127, 127, 127)",
    );

    expect(customProperty(page.element, "--archive-selection-color")).toBe(
      "rgb(128, 128, 128)",
    );
  });

  it("inverts the selection for dark paper", () => {
    const source = sampleDocument("selection-dark-doc");

    const page = createPage(source, {
      overrides: { paper: { tone: 0.2 } },
    });

    expect(customProperty(page.element, "--archive-selection-background")).toBe(
      "rgb(204, 204, 204)",
    );

    expect(customProperty(page.element, "--archive-selection-color")).toBe(
      "rgb(51, 51, 51)",
    );
  });

  it("pins explicit selection colors", () => {
    const source = sampleDocument("selection-pinned-doc");

    const page = createPage(source, {
      overrides: {
        selection: { background: "#203040", color: "#f0f0f0" },
      },
    });

    expect(customProperty(page.element, "--archive-selection-background")).toBe(
      "#203040",
    );

    expect(customProperty(page.element, "--archive-selection-color")).toBe(
      "#f0f0f0",
    );
  });

  it("re-derives the selection colors on update", () => {
    const source = sampleDocument("selection-update-doc");

    const page = createPage(source, { overrides: { paper: { tone: 0.9 } } });

    expect(customProperty(page.element, "--archive-selection-background")).toBe(
      "rgb(25, 25, 25)",
    );

    page.update({ paper: { tone: 0.2 } });

    expect(customProperty(page.element, "--archive-selection-background")).toBe(
      "rgb(204, 204, 204)",
    );

    expect(customProperty(page.element, "--archive-selection-color")).toBe(
      "rgb(51, 51, 51)",
    );
  });

  it("re-renders on update and preserves unrelated settings", () => {
    const source = sampleDocument("update-doc");

    const texture = freshPresetRegistry().resolve("clean").paper.texture;

    const page = createPage(source, { overrides: { paper: { tone: 0.9 } } });

    expect(customProperty(page.element, "--archive-paper")).toBe(
      "rgb(230, 230, 230)",
    );

    page.update({ paper: { tone: 0.2 } });

    expect(customProperty(page.element, "--archive-paper")).toBe(
      "rgb(51, 51, 51)",
    );

    expect(page.settings.paper.texture).toBe(texture);
  });

  it("applies grayscale and capture transforms", () => {
    const source = sampleDocument("capture-doc");

    const page = createPage(source, {
      overrides: {
        border: { enabled: false },
        capture: { grayscale: true, rotation: 2, perspective: 0 },
      },
    });

    expect(customProperty(page.element, "--archive-grayscale")).toBe("1");

    expect(page.element.style.transform).toContain("rotate(2.000deg)");

    page.update({ capture: { rotation: 0, perspective: 0.4 } });

    expect(page.element.style.transform).toContain("perspective(1200px)");
    expect(page.element.style.transform).toContain("rotateY(0.4deg)");
  });

  it("draws and removes the copier frame", () => {
    const source = sampleDocument("frame-doc");

    const page = createPage(source, {
      overrides: { border: { enabled: true, thickness: 24, darkness: 0.9 } },
    });

    const topInset = customProperty(page.element, "--archive-frame-top");

    expect(topInset).toMatch(/px$/);

    expect(Number.parseFloat(topInset)).toBeGreaterThan(0);

    page.update({ border: { enabled: false } });

    expect(customProperty(page.element, "--archive-frame-top")).toBe("");
  });

  it("forces the requested enhancement strategy", () => {
    const cssSource = sampleDocument("enhancement-css");

    const cssPage = createPage(cssSource, { enhancement: "css" });

    expect(cssPage.element.dataset.enhancement).toBe("css");

    expect(cssPage.element.querySelector("svg")).toBeNull();

    const svgSource = sampleDocument("enhancement-svg");

    const svgPage = createPage(svgSource, { enhancement: "svg" });

    expect(svgPage.element.dataset.enhancement).toBe("svg");

    expect(svgPage.element.querySelector("svg")).not.toBeNull();
  });

  it("restores the source element on destroy", () => {
    const source = sampleDocument("destroy-doc");

    const parent = source.parentNode!;

    const page = createPage(source);

    expect(document.querySelector(".archive-scan-page")).not.toBeNull();

    page.destroy();

    expect(document.querySelector(".archive-scan-page")).toBeNull();

    expect(parent.contains(source)).toBe(true);

    expect(parent.lastElementChild).toBe(source);

    /* Destroy is idempotent. */
    page.destroy();
  });
});

describe("numeric range settings", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves range overrides into concrete values", () => {
    const source = sampleDocument("range-doc");

    const page = createPage(source, {
      seed: "range-seed",

      overrides: {
        paper: { tone: [0.2, 0.4], texture: [0.1, 0.3] },
      },
    });

    const { tone, texture } = page.settings.paper;

    expect(tone).toBeGreaterThanOrEqual(0.2);

    expect(tone).toBeLessThanOrEqual(0.4);

    expect(texture).toBeGreaterThanOrEqual(0.1);

    expect(texture).toBeLessThanOrEqual(0.3);
  });

  it("resolves the same seed to the same values", () => {
    const first = createPage(sampleDocument("range-same-a"), {
      seed: "range-same-seed",

      overrides: {
        artifacts: { grain: [0, 1], dust: [0, 1], scratches: [0, 1] },
      },
    });

    const second = createPage(sampleDocument("range-same-b"), {
      seed: "range-same-seed",

      overrides: {
        artifacts: { grain: [0, 1], dust: [0, 1], scratches: [0, 1] },
      },
    });

    expect(second.settings).toEqual(first.settings);
  });

  it("keeps resolved ranges stable across unrelated updates", () => {
    const source = sampleDocument("range-update");

    const page = createPage(source, {
      seed: "range-update-seed",

      overrides: { artifacts: { grain: [0.1, 0.9] } },
    });

    const grain = page.settings.artifacts.grain;

    page.update({ paper: { tone: 0.5 } });

    expect(page.settings.artifacts.grain).toBe(grain);
  });

  it("rejects malformed ranges with the setting path", () => {
    const source = sampleDocument("range-invalid");

    const nonNumeric = () =>
      createPage(source, {
        overrides: { artifacts: { grain: ["a", "b"] as unknown as number } },
      });

    expect(nonNumeric).toThrow(/"artifacts\.grain".*numeric bounds/);

    const single = () =>
      createPage(source, {
        overrides: { artifacts: { grain: [1] as unknown as number } },
      });

    expect(single).toThrow(/"artifacts\.grain"/);

    const reversed = () =>
      createPage(source, {
        overrides: { artifacts: { grain: [0.6, 0.2] as unknown as number } },
      });

    expect(reversed).toThrow(/"artifacts\.grain".*exceeds maximum/);
  });
});
