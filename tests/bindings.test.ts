import { describe, expect, it } from "vitest";

import {
  BindingRegistry,
  builtInBindings,
  bindings,
} from "../src/ts/bindings.js";

describe("BindingRegistry", () => {
  it("preloads built-in gutter styles", () => {
    expect(bindings.names().sort()).toEqual([
      "bound-volume",
      "deep-bound-volume",
      "subtle",
    ]);

    expect(bindings.get("subtle")).toEqual(builtInBindings.subtle);
  });

  it("returns clones so callers cannot mutate registry state", () => {
    const registry = new BindingRegistry(builtInBindings);

    const fetched = registry.get("subtle");

    fetched.width = 999;

    expect(registry.get("subtle").width).toBe(builtInBindings.subtle.width);
  });

  it("throws for unknown gutter styles", () => {
    expect(() => bindings.get("no-such-binding")).toThrow(
      /Unknown binding style "no-such-binding"/,
    );
  });

  it("allows unnamed definitions (empty names are permitted)", () => {
    const registry = new BindingRegistry();

    registry.set("", { width: 5, darkness: 0.5, blur: 5, curvature: 0.5 });

    expect(registry.get("").width).toBe(5);
  });

  it("defines and updates custom styles", () => {
    const registry = new BindingRegistry();

    registry.define("archival", {
      width: 24,
      darkness: 0.4,
      blur: 10,
      curvature: 0.3,
      highlight: 0.1,
    });

    registry.update("archival", { darkness: 0.6 });

    expect(registry.get("archival")).toEqual({
      width: 24,
      darkness: 0.6,
      blur: 10,
      curvature: 0.3,
      highlight: 0.1,
    });
  });
});

describe("built-in binding contract", () => {
  for (const [name, options] of Object.entries(builtInBindings)) {
    it(`"${name}" carries sensible gutter values`, () => {
      expect(options.width).toBeGreaterThan(0);

      for (const value of [
        options.darkness,
        options.curvature,
        options.highlight,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }

      expect(options.blur).toBeGreaterThanOrEqual(0);
    });
  }
});
