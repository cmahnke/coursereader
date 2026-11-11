import { afterEach, describe, expect, it, vi } from "vitest";

import {
  builtInPresets,
  defaultSettings,
  PresetRegistry,
  presets,
} from "../src/ts/presets.js";
import type { ScanSettings } from "../src/ts/types.js";

import { freshPresetRegistry } from "./helpers.js";

describe("PresetRegistry.resolve", () => {
  it("resolves the clean preset to the default settings", () => {
    expect(presets.resolve("clean")).toEqual(defaultSettings);
  });

  it("defaults to the clean preset", () => {
    expect(presets.resolve()).toEqual(defaultSettings);
  });

  it("resolves a chain so the child overrides the parent", () => {
    const registry = new PresetRegistry({
      child: { extends: "parent", paper: { tone: 0.5 } },
      parent: {
        extends: "grandparent",
        paper: { tone: 0.4 },
        ink: { spread: 0.2 },
      },
      grandparent: { paper: { texture: 0.3 } },
    });

    const resolved = registry.resolve("child");

    expect(resolved.paper.tone).toBe(0.5);
    expect(resolved.paper.texture).toBe(0.3);
    expect(resolved.ink.spread).toBe(0.2);

    expect(resolved.tone.mode).toBe(defaultSettings.tone.mode);
  });

  it("strips the extends key from the resolved settings", () => {
    const registry = new PresetRegistry({
      child: { extends: "base", paper: { tone: 0.5 } },
      base: {},
    });

    const resolved = registry.resolve("child") as unknown as Record<
      string,
      unknown
    >;

    expect(resolved.extends).toBeUndefined();
  });

  it("throws on circular inheritance", () => {
    const registry = new PresetRegistry({
      loopA: { extends: "loopB" },
      loopB: { extends: "loopA" },
    });

    expect(() => registry.resolve("loopA")).toThrow(/Circular preset/);
  });

  it("throws on unknown presets", () => {
    expect(() => presets.resolve("no-such-preset")).toThrow(
      /Unknown preset "no-such-preset"/,
    );
  });

  it("resolves against a custom registry without touching globals", () => {
    const registry = new PresetRegistry({
      isolated: { paper: { tone: 0.2 } },
    });

    expect(registry.resolve("isolated").paper.tone).toBe(0.2);

    expect(presets.has("isolated")).toBe(false);
  });
});

describe("PresetRegistry ranges", () => {
  it("keeps ranges intact through define, get and export", () => {
    const registry = freshPresetRegistry();

    registry.define("ranged", {
      paper: { tone: [0.2, 0.4] },
      artifacts: { grain: [0, 1] },
    });

    const definition = registry.get("ranged") as Record<string, unknown>;

    expect(definition.paper).toEqual({ tone: [0.2, 0.4] });

    expect(definition.artifacts).toEqual({ grain: [0, 1] });

    const exported = registry.export() as Record<string, unknown>;

    expect(exported.ranged).toEqual({
      paper: { tone: [0.2, 0.4] },
      artifacts: { grain: [0, 1] },
    });
  });

  it("resolves ranges merged over the default settings", () => {
    const registry = freshPresetRegistry();

    registry.define("ranged", { paper: { tone: [0.2, 0.4] } });

    const resolved = registry.resolve("ranged");

    expect(resolved.paper.tone).toEqual([0.2, 0.4]);

    expect(resolved.paper.texture).toBe(defaultSettings.paper.texture);
  });

  it("resolves ranges in inherited chains", () => {
    const registry = new PresetRegistry({
      child: { extends: "parent", ink: { spread: [0.1, 0.2] } },
      parent: { paper: { tone: [0.3, 0.5] } },
    });

    const resolved = registry.resolve("child");

    expect(resolved.paper.tone).toEqual([0.3, 0.5]);

    expect(resolved.ink.spread).toEqual([0.1, 0.2]);
  });
});

describe("PresetRegistry.import and export", () => {
  it("imports and exports a preset map", () => {
    const registry = new PresetRegistry();

    registry.import({
      newsprint: { paper: { tone: 0.8 } },
      blueprint: { paper: { tone: 0.3 } },
    });

    expect(registry.names().sort()).toEqual(["blueprint", "newsprint"]);

    expect(registry.export("newsprint")).toEqual({ paper: { tone: 0.8 } });

    expect(registry.export()).toEqual({
      newsprint: { paper: { tone: 0.8 } },
      blueprint: { paper: { tone: 0.3 } },
    });
  });

  it("round-trips definitions through export and import", () => {
    const registry = new PresetRegistry({
      roundTrip: { extends: "base", paper: { tone: 0.7 } },
      base: { ink: { spread: 0.1 } },
    });

    const exported = registry.export() as Parameters<
      PresetRegistry["import"]
    >[0];

    const copy = new PresetRegistry();

    copy.import(exported);

    expect(copy.resolve("roundTrip")).toEqual(registry.resolve("roundTrip"));
  });
});

describe("PresetRegistry.fromUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("imports a preset map from a JSON document", async () => {
    const registry = new PresetRegistry();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          newsprint: { paper: { tone: 0.8 } },
        }),
      })),
    );

    const names = await registry.fromUrl("./presets.json");

    expect(names).toEqual(["newsprint"]);

    expect(registry.resolve("newsprint").paper.tone).toBe(0.8);
  });

  it("registers a single definition under the supplied name", async () => {
    const registry = freshPresetRegistry();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ extends: "clean", paper: { tone: 0.9 } }),
      })),
    );

    const names = await registry.fromUrl("./preset.json", "single");

    expect(names).toEqual(["single"]);

    expect(registry.resolve("single").paper.tone).toBe(0.9);

    expect(registry.resolve("single").ink.spread).toBe(
      defaultSettings.ink.spread,
    );
  });

  it("rejects a single definition without a name", async () => {
    const registry = new PresetRegistry();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ extends: "clean" }),
      })),
    );

    await expect(registry.fromUrl("./preset.json")).rejects.toThrow(
      /pass a preset name/,
    );
  });

  it("rejects documents that are not JSON objects", async () => {
    const registry = new PresetRegistry();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => 42,
      })),
    );

    await expect(registry.fromUrl("./preset.json")).rejects.toThrow(
      /not a JSON object/,
    );
  });

  it("surfaces failing fetches", async () => {
    const registry = new PresetRegistry();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })),
    );

    await expect(registry.fromUrl("./missing.json")).rejects.toThrow(
      /404 Not Found/,
    );
  });
});

describe("built-in preset contract", () => {
  const registry = new PresetRegistry(builtInPresets);

  const names = registry.names();

  it("ships the documented presets", () => {
    expect(names).toContain("clean");
    expect(names).toContain("book-photo");
    expect(names).toContain("microfilm-journal");
    expect(names).toContain("analog-gray-copy");
  });

  for (const name of names) {
    it(`resolves "${name}" into complete, valid settings`, () => {
      const settings = registry.resolve(name);

      expectShape(settings);
    });
  }

  function expectShape(settings: ScanSettings): void {
    expect(settings.paper.tone).toBeGreaterThanOrEqual(0);
    expect(settings.paper.tone).toBeLessThanOrEqual(1);
    expect(settings.paper.texture).toBeGreaterThanOrEqual(0);
    expect(settings.paper.texture).toBeLessThanOrEqual(1);

    expect(settings.exposure.brightness).toBeGreaterThan(0);
    expect(settings.exposure.contrast).toBeGreaterThan(0);
    expect(settings.exposure.gamma).toBeGreaterThan(0);

    for (const value of [
      settings.exposure.unevenness,
      settings.exposure.blownHighlights,
      settings.exposure.crushedShadows,
      settings.ink.spread,
      settings.ink.erosion,
      settings.ink.blur,
      settings.artifacts.grain,
      settings.artifacts.dust,
      settings.artifacts.scratches,
      settings.artifacts.bleedThrough,
      settings.artifacts.shineThrough,
      settings.artifacts.verticalStreaks,
      settings.artifacts.horizontalBands,
      settings.artifacts.edgeNoise,
      settings.capture.perspective,
      settings.capture.rotationJitter,
      settings.tone.threshold,
      settings.tone.ditherAmount,
      settings.border.darkness,
      settings.border.roughness,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }

    expect(["continuous", "quantized", "bitonal"]).toContain(
      settings.tone.mode,
    );

    expect(["none", "random"]).toContain(settings.tone.dither);

    expect(Number.isInteger(settings.tone.levels)).toBe(true);

    expect(settings.tone.levels).toBeGreaterThanOrEqual(2);
    expect(settings.tone.levels).toBeLessThanOrEqual(256);

    expect(settings.border.thickness).toBeGreaterThanOrEqual(0);

    for (const side of [
      settings.border.sides.top,
      settings.border.sides.right,
      settings.border.sides.bottom,
      settings.border.sides.left,
    ]) {
      expect(typeof side).toBe("boolean");
    }

    expect(typeof settings.capture.grayscale).toBe("boolean");
  }
});
