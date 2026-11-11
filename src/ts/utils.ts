/* ==========================================================================
 * Internal helpers — not part of the public API.
 * ========================================================================== */

export type UnknownRecord = Record<string, unknown>;

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function mergeInto(target: UnknownRecord, source: UnknownRecord): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }

    if (isRecord(value)) {
      if (!isRecord(target[key])) {
        target[key] = {};
      }

      mergeInto(target[key] as UnknownRecord, value);
    } else {
      target[key] = clone(value);
    }
  }
}

export function deepMerge<T>(base: T, ...parts: unknown[]): T {
  const result = clone(base) as unknown as UnknownRecord;

  for (const part of parts) {
    if (isRecord(part)) {
      mergeInto(result, part);
    }
  }

  return result as T;
}

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/*
 * Ranges resolve per setting path: every range draws from its own
 * seeded random, so a resolved value depends only on the page seed
 * and its setting path — an update that adds or removes unrelated
 * fields never reshuffles the values already picked.
 */
function resolveRangeValue(
  value: unknown,
  path: string,
  seed: string | number,
): unknown {
  if (Array.isArray(value)) {
    const valid =
      value.length === 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1]);

    if (!valid) {
      throw new Error(
        `Invalid numeric range at "${path}": expected [min, max] with numeric bounds.`,
      );
    }

    if (value[0] > value[1]) {
      throw new Error(
        `Invalid numeric range at "${path}": minimum ${value[0]} exceeds maximum ${value[1]}.`,
      );
    }

    const random = createRandom(`${seed}:${path}`);

    return value[0] + random() * (value[1] - value[0]);
  }

  if (isRecord(value)) {
    const result: UnknownRecord = {};

    for (const [key, entry] of Object.entries(value)) {
      result[key] = resolveRangeValue(
        entry,
        path ? `${path}.${key}` : key,
        seed,
      );
    }

    return result;
  }

  return value;
}

/**
 * Replaces every numeric range in a settings tree with the value
 * picked for it between the bounds, both included. The pick is
 * deterministic from the seed and the setting's path, so the same
 * seed resolves the same ranges on every call.
 *
 * @param value - Settings or settings overrides with ranges.
 * @param seed - Seed the picks are derived from.
 * @returns A copy of the value with every range resolved.
 * @throws {Error} When an array inside the value is not a valid
 * `[min, max]` range.
 */
export function resolveNumericRanges<T>(value: T, seed: string | number): T {
  return resolveRangeValue(value, "", seed) as T;
}

/**
 * Spine scaling shared by the playground desk and the viewer: the
 * page count scales the fold depth onto the curl and stacks sheet
 * edges at the fore-edges. The default of 8 reproduces the
 * original look exactly.
 */
export function spineScaling(pageCount: number): {
  curlFactor: number;
  curlHalf: number;
  blockDepth: number;
} {
  const curlFactor = 0.75 + pageCount / 32;

  return {
    curlFactor,

    curlHalf: 24 * curlFactor,

    blockDepth: Math.min(27, 3 + pageCount),
  };
}

export function hashSeed(value: string | number): number {
  const text = String(value);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createRandom(seed: string | number): () => number {
  let state = hashSeed(seed) || 1;

  return () => {
    state += 0x6d2b79f5;

    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);

    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NAMESPACE, name);
}

export function setAttributes(
  element: Element,
  attributes: Record<string, string | number>,
): void {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
}

export function resolveElement(source: HTMLElement | string): HTMLElement {
  if (source instanceof HTMLElement) {
    return source;
  }

  const element = document.querySelector<HTMLElement>(source);

  if (!element) {
    throw new Error(`Archive Scan source was not found: ${source}`);
  }

  return element;
}

export function supportsSvgFilters(): boolean {
  return (
    typeof SVGFEColorMatrixElement !== "undefined" &&
    typeof SVGFEComponentTransferElement !== "undefined" &&
    typeof CSS !== "undefined" &&
    CSS.supports("filter", "grayscale(1)")
  );
}
