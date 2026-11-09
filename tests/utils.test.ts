import { describe, expect, it } from "vitest";

import {
  clamp,
  clone,
  createRandom,
  createSvgElement,
  deepMerge,
  hashSeed,
  isRecord,
  mergeInto,
  resolveElement,
  setAttributes,
  supportsSvgFilters,
} from "../src/ts/utils.js";

describe("clone", () => {
  it("deep-copies plain objects", () => {
    const source = { nested: { value: 1 } };

    const copy = clone(source);

    expect(copy).toEqual(source);

    copy.nested.value = 2;

    expect(source.nested.value).toBe(1);
  });
});

describe("mergeInto", () => {
  it("overrides nested keys while keeping siblings", () => {
    const target = { tone: { mode: "continuous", levels: 256 } };

    mergeInto(target, { tone: { levels: 6 } });

    expect(target).toEqual({ tone: { mode: "continuous", levels: 6 } });
  });

  it("skips undefined values", () => {
    const target = { tone: { levels: 6 } };

    mergeInto(target, { tone: { levels: undefined } });

    expect(target).toEqual({ tone: { levels: 6 } });
  });

  it("clones merged values so sources stay independent", () => {
    const shared = { levels: 6 };

    const target = {};

    mergeInto(target, { tone: shared });

    shared.levels = 2;

    expect(target).toEqual({ tone: { levels: 6 } });
  });
});

describe("deepMerge", () => {
  it("layers partials over a base without mutating it", () => {
    const base = { paper: { tone: 1, texture: 0 }, ink: { spread: 0 } };

    const result = deepMerge(
      base,
      { paper: { tone: 0.5 } },
      { ink: { spread: 0.2 } },
    );

    expect(result).toEqual({
      paper: { tone: 0.5, texture: 0 },
      ink: { spread: 0.2 },
    });

    expect(base).toEqual({
      paper: { tone: 1, texture: 0 },
      ink: { spread: 0 },
    });
  });

  it("ignores non-record parts", () => {
    expect(deepMerge({ a: 1 }, undefined, null, 3 as never)).toEqual({ a: 1 });
  });
});

describe("clamp", () => {
  it("clamps to the default 0..1 range", () => {
    expect(clamp(2)).toBe(1);
    expect(clamp(-1)).toBe(0);
    expect(clamp(0.5)).toBe(0.5);
  });

  it("honors custom bounds", () => {
    expect(clamp(5, 0, 3)).toBe(3);
  });
});

describe("hashSeed", () => {
  it("is stable for identical input", () => {
    expect(hashSeed("demo-1971")).toBe(hashSeed("demo-1971"));
  });

  it("treats numeric seeds and their text form identically", () => {
    expect(hashSeed(1971)).toBe(hashSeed("1971"));
  });

  it("differs for different seeds", () => {
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});

describe("createRandom", () => {
  it("reproduces the same sequence for the same seed", () => {
    const first = createRandom("demo-1971");
    const second = createRandom("demo-1971");

    const firstValues = Array.from({ length: 16 }, () => first());
    const secondValues = Array.from({ length: 16 }, () => second());

    expect(secondValues).toEqual(firstValues);
  });

  it("produces different sequences for different seeds", () => {
    const first = createRandom("one");
    const second = createRandom("two");

    const firstValues = Array.from({ length: 8 }, () => first());
    const secondValues = Array.from({ length: 8 }, () => second());

    expect(secondValues).not.toEqual(firstValues);
  });

  it("stays within [0, 1)", () => {
    const random = createRandom("range");

    for (let index = 0; index < 200; index += 1) {
      const value = random();

      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("falls back to a nonzero state for zero seeds", () => {
    const random = createRandom(0);

    expect(random()).toBeGreaterThanOrEqual(0);
  });
});

describe("isRecord", () => {
  it("accepts plain objects and rejects arrays and null", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("text")).toBe(false);
  });
});

describe("createSvgElement", () => {
  it("creates namespaced SVG elements", () => {
    const element = createSvgElement("feTurbulence");

    expect(element.tagName).toBe("feTurbulence");

    expect(element.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });
});

describe("setAttributes", () => {
  it("writes every attribute", () => {
    const element = document.createElement("div");

    setAttributes(element, { id: "probe", "data-count": 3 });

    expect(element.getAttribute("id")).toBe("probe");

    expect(element.getAttribute("data-count")).toBe("3");
  });
});

describe("resolveElement", () => {
  it("passes elements through", () => {
    const element = document.createElement("div");

    expect(resolveElement(element)).toBe(element);
  });

  it("resolves attached selectors", () => {
    const element = sampleDocumentFixture();

    expect(resolveElement("#fixture-resolve")).toBe(element);
  });

  it("throws for unknown selectors", () => {
    expect(() => resolveElement("#missing-element")).toThrow(
      /Archive Scan source was not found/,
    );
  });
});

describe("supportsSvgFilters", () => {
  it("returns a boolean without throwing", () => {
    expect(typeof supportsSvgFilters()).toBe("boolean");
  });
});

function sampleDocumentFixture(): HTMLElement {
  const element = document.createElement("div");

  element.id = "fixture-resolve";

  document.body.append(element);

  return element;
}
