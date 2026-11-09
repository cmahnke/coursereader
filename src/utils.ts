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
