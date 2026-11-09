import { describe, expect, it } from "vitest";

import {
  buildContentFilter,
  buildSvgFilter,
  createToneFilter,
  createToneTable,
} from "../src/ts/filters.js";
import {
  createGrainAlphaTable,
  createNoiseImage,
  createTextureAlphaTable,
} from "../src/ts/noise.js";
import { defaultSettings } from "../src/ts/presets.js";
import type { ScanSettings, ToneMode } from "../src/ts/types.js";
import { deepMerge } from "../src/ts/utils.js";

function settingsWith(overrides: {
  tone?: Partial<ScanSettings["tone"]>;
  ink?: Partial<ScanSettings["ink"]>;
  grayscaleOverride?: boolean;
}): ScanSettings {
  return deepMerge(defaultSettings, {
    tone: overrides.tone ?? {},
    ink: overrides.ink ?? {},
    capture: { grayscale: overrides.grayscaleOverride ?? true },
  });
}

function tableValues(table: string): number[] {
  return table.split(" ").map(Number);
}

describe("createToneTable", () => {
  it("defaults to 128 evenly spaced samples", () => {
    const values = tableValues(createToneTable(defaultSettings));

    expect(values.length).toBe(128);
  });

  it("is the identity ramp in continuous mode", () => {
    const values = tableValues(createToneTable(defaultSettings, 65));

    expect(values[0]).toBeCloseTo(0);
    expect(values[32]).toBeCloseTo(0.5);
    expect(values[64]).toBeCloseTo(1);
  });

  it("quantizes to the configured level count", () => {
    const settings = { ...defaultSettings, tone: { ...defaultSettings.tone } };

    settings.tone.mode = "quantized";
    settings.tone.levels = 4;

    const values = tableValues(createToneTable(settings, 129));

    const distinct = [
      ...new Set(values.map((value) => Math.round(value * 1000) / 1000)),
    ].sort((a, b) => a - b);

    expect(distinct).toEqual([0, 0.333, 0.667, 1]);
  });

  it("collapses to two levels at the extreme", () => {
    const settings = { ...defaultSettings, tone: { ...defaultSettings.tone } };

    settings.tone.mode = "quantized";
    settings.tone.levels = 2;

    const values = tableValues(createToneTable(settings));

    expect([...new Set(values)].sort()).toEqual([0, 1]);
  });

  it("splits at the threshold in bitonal mode", () => {
    const settings = { ...defaultSettings, tone: { ...defaultSettings.tone } };

    settings.tone.mode = "bitonal";
    settings.tone.threshold = 0.55;

    const values = tableValues(createToneTable(settings, 129));

    expect(values).toHaveLength(129);

    for (const [index, value] of values.entries()) {
      const input = index / (values.length - 1);

      expect(value).toBe(input < 0.55 ? 0 : 1);
    }
  });

  it("rejects unknown modes by keeping the identity ramp", () => {
    const settings = { ...defaultSettings, tone: { ...defaultSettings.tone } };

    settings.tone.mode = "everything-at-once" as unknown as ToneMode;

    const values = tableValues(createToneTable(settings, 33));

    expect(values[16]).toBeCloseTo(0.5);
  });
});

describe("createGrainAlphaTable", () => {
  it("emits 64 alpha bands", () => {
    expect(createGrainAlphaTable(0.4).split(" ")).toHaveLength(64);
  });

  it("raises speck density with the amount", () => {
    const sum = (table: string) =>
      tableValues(table).reduce((total, value) => total + value, 0);

    expect(sum(createGrainAlphaTable(0.9))).toBeGreaterThan(
      sum(createGrainAlphaTable(0)),
    );
  });

  it("never exceeds the max alpha", () => {
    for (const value of tableValues(createGrainAlphaTable(1))) {
      expect(value).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
});

describe("createTextureAlphaTable", () => {
  it("emits a smooth full-range mottle", () => {
    const values = tableValues(createTextureAlphaTable());

    expect(values).toHaveLength(64);

    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0.3 + 1e-9);
    }

    expect(values[values.length - 1]).toBeGreaterThan(values[0]);

    expect(values.filter((value) => value > 0).length).toBeGreaterThan(32);
  });
});

describe("createNoiseImage", () => {
  it("encodes the seeded turbulence tile as a data URI", () => {
    const image = createNoiseImage(7, 0.35, 3, "0.5 0.9", 260);

    expect(image.startsWith('url("data:image/svg+xml,')).toBe(true);

    const svg = decodeURIComponent(
      image.replace(/^url\("data:image\/svg\+xml,/, "").replace(/"\)$/, ""),
    );

    expect(svg).toContain('seed="7"');
    expect(svg).toContain('baseFrequency="0.35"');
    expect(svg).toContain('numOctaves="3"');
    expect(svg).toContain('width="260"');
    expect(svg).toContain('tableValues="0.5 0.9"');
  });
});

describe("createToneFilter", () => {
  it("builds a named filter with grayscale and clip stages", () => {
    const svg = createToneFilter(defaultSettings, 1971, "tone-filter");

    const filter = svg.querySelector("#tone-filter");

    expect(filter).not.toBeNull();

    const matrix = svg.querySelector("feColorMatrix");

    expect(matrix?.getAttribute("values")).toContain("0.2126");
  });

  it("adds a dither stage only for random dither with an amount", () => {
    const dithered = createToneFilter(
      settingsWith({ tone: { dither: "random", ditherAmount: 0.4 } }),
      1971,
      "dithered-tone",
    );

    expect(dithered.querySelector("feTurbulence")).not.toBeNull();

    const undithered = createToneFilter(
      settingsWith({ tone: { dither: "none", ditherAmount: 0.4 } }),
      1971,
      "undithered-tone",
    );

    expect(undithered.querySelector("feTurbulence")).toBeNull();
  });

  it("adds a transfer stage only for non-continuous modes", () => {
    const quantized = createToneFilter(
      settingsWith({ tone: { mode: "quantized", levels: 6 } }),
      1971,
      "quantized-tone",
    );

    const transfer = quantized.querySelector("feComponentTransfer");

    expect(transfer).not.toBeNull();

    expect(transfer!.querySelector("feFuncR")!.getAttribute("type")).toBe(
      "table",
    );

    const continuous = createToneFilter(
      defaultSettings,
      1971,
      "continuous-tone",
    );

    expect(continuous.querySelector("feComponentTransfer")).toBeNull();
  });
});

describe("buildSvgFilter", () => {
  it("starts from SourceGraphic without a grayscale stage", () => {
    const svg = buildSvgFilter("stage-filter", settingsWith({}), 1971);

    const filter = svg.querySelector("#stage-filter")!;

    const matrix = filter.querySelector("feColorMatrix");

    expect(matrix).toBeNull();
  });

  it("carries the requested filter id and dither gating", () => {
    const plain = buildSvgFilter("plain-stage", settingsWith({}), 1971);

    expect(plain.querySelector("#plain-stage")).not.toBeNull();

    expect(plain.querySelector("feTurbulence")).toBeNull();

    const dithered = buildSvgFilter(
      "dithered-stage",
      settingsWith({ tone: { dither: "random", ditherAmount: 0.5 } }),
      1971,
    );

    expect(dithered.querySelector("feTurbulence")).not.toBeNull();
  });
});

describe("buildContentFilter", () => {
  it("applies grayscale on demand", () => {
    const gray = buildContentFilter(
      "content-gray",
      settingsWith({ grayscaleOverride: true }),
    );

    const grayMatrix = gray.querySelector("feColorMatrix")!;

    expect(grayMatrix.getAttribute("values")).toContain("0.2126");

    const color = buildContentFilter(
      "content-color",
      settingsWith({ grayscaleOverride: false }),
    );

    const identity = color.querySelector("feColorMatrix")!;

    expect(identity.getAttribute("values")).toContain("1 0 0 0 0");
  });

  it("adds ink stages for spread, erosion and blur", () => {
    const processed = buildContentFilter(
      "content-ink",
      deepMerge(defaultSettings, {
        ink: { spread: 0.5, erosion: 0.5, blur: 0.5 },
      }) as ScanSettings,
    );

    /* Each stage blends sub-pixel amounts, so both spread and
       erosion contribute two morphology passes. */
    const operators = [
      ...new Set(
        [...processed.querySelectorAll("feMorphology")].map((element) =>
          element.getAttribute("operator"),
        ),
      ),
    ].sort();

    expect(operators).toEqual(["dilate", "erode"]);

    expect(processed.querySelector("feGaussianBlur")).not.toBeNull();
  });

  it("omits ink stages at zero", () => {
    const plain = buildContentFilter("content-plain", defaultSettings);

    expect(plain.querySelector("feMorphology")).toBeNull();

    expect(plain.querySelector("feGaussianBlur")).toBeNull();
  });
});
