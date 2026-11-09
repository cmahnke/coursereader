import { describe, expect, it } from "vitest";

import { Registry } from "../src/ts/registry.js";

interface Widget {
  size: number;
  meta?: { label?: string };
}

function createRegistry(): Registry<Widget> {
  return new Registry<Widget>("Widget", true);
}

describe("Registry", () => {
  it("stores and returns definitions", () => {
    const registry = createRegistry();

    registry.define("alpha", { size: 1 });

    expect(registry.has("alpha")).toBe(true);

    expect(registry.get("alpha")).toEqual({ size: 1 });

    expect(registry.names()).toEqual(["alpha"]);
  });

  it("rejects duplicate names on define", () => {
    const registry = createRegistry();

    registry.define("alpha", { size: 1 });

    expect(() => registry.define("alpha", { size: 2 })).toThrow(
      /Widget "alpha" already exists/,
    );
  });

  it("rejects empty names when names are required", () => {
    const registry = createRegistry();

    expect(() => registry.set("   ", { size: 1 })).toThrow(
      /names may not be empty/,
    );
  });

  it("allows empty names when they are not required", () => {
    const registry = new Registry<Widget>("Widget", false);

    registry.set("", { size: 1 });

    expect(registry.get("")).toEqual({ size: 1 });
  });

  it("returns clones so callers cannot mutate registry state", () => {
    const registry = createRegistry();

    registry.define("alpha", { size: 1, meta: { label: "kept" } });

    const fetched = registry.get("alpha");

    fetched.size = 99;

    fetched.meta!.label = "changed";

    expect(registry.get("alpha")).toEqual({
      size: 1,
      meta: { label: "kept" },
    });
  });

  it("merges changes on update", () => {
    const registry = createRegistry();

    registry.define("alpha", { size: 1, meta: { label: "kept" } });

    registry.update("alpha", { meta: { label: "renamed" } });

    expect(registry.get("alpha")).toEqual({
      size: 1,
      meta: { label: "renamed" },
    });
  });

  it("throws when updating an unknown definition", () => {
    const registry = createRegistry();

    expect(() => registry.update("ghost", { size: 1 })).toThrow(
      /Unknown widget "ghost"/,
    );
  });

  it("reports removals", () => {
    const registry = createRegistry();

    registry.define("alpha", { size: 1 });

    expect(registry.remove("alpha")).toBe(true);

    expect(registry.remove("alpha")).toBe(false);

    expect(registry.has("alpha")).toBe(false);
  });
});
