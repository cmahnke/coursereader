/* ==========================================================================
 * Book pagination
 *
 * Splits one continuous document into page hosts so the viewer can
 * present it as a book. Break markers are only honored among the
 * direct children of the source element: nested elements never
 * split lists, tables or figures internally.
 * ========================================================================== */

import type { SplitBookHandle, SplitBookOptions } from "./types.js";
import { resolveElement } from "./utils.js";

/**
 * Class carried by every generated page host.
 */
export const BOOK_PAGE_CLASS = "cr-book-page";

/*
 * The break-after convention: `data-page-break` marks the element
 * that closes the page, mirroring `break-after: page`. Break-before
 * markers open the next page instead.
 */
const BREAK_ATTRIBUTE = "data-page-break";

function closesPage(element: Element): boolean {
  if (element.hasAttribute(BREAK_ATTRIBUTE)) {
    return true;
  }

  return window.getComputedStyle(element).breakAfter === "page";
}

function opensPage(element: Element): boolean {
  return window.getComputedStyle(element).breakBefore === "page";
}

/**
 * Splits a continuous document into page host elements.
 *
 * The source element itself becomes the host of the first page and
 * keeps its id and classes; every further page is collected into a
 * new host element. The content is moved, not cloned, so ids and
 * interactive state stay intact.
 *
 * Pages break at:
 *
 * - `<hr>` markers, which are consumed and hidden
 * - elements carrying `data-page-break`, which end the page
 * - elements whose computed `break-before` or `break-after` is
 *   `page`
 *
 * Empty groups are kept as deliberate blank pages.
 *
 * Call {@link SplitBookHandle.restore} to move every element back
 * into the source in its original order.
 *
 * @param source - The document element, or a selector for it.
 * @param options - Host class overrides.
 * @returns A handle with the page hosts and a restore method.
 * @throws {Error} When the source cannot be found or is not attached.
 */
export function splitBook(
  source: HTMLElement | string,
  options: SplitBookOptions = {},
): SplitBookHandle {
  const sourceElement = resolveElement(source);

  const parent = sourceElement.parentNode;

  if (!parent) {
    throw new Error(
      "The book source element must be attached to the document.",
    );
  }

  const originalNodes = Array.from(sourceElement.childNodes);

  const groups: ChildNode[][] = [[]];

  const markers: ChildNode[] = [];

  for (const node of originalNodes) {
    const group = groups[groups.length - 1];

    if (node instanceof HTMLHRElement) {
      markers.push(node);

      groups.push([]);

      continue;
    }

    if (node instanceof Element) {
      if (opensPage(node)) {
        groups.push([]);
      }

      const target = groups[groups.length - 1];

      target.push(node);

      if (closesPage(node)) {
        groups.push([]);
      }

      continue;
    }

    group.push(node);
  }

  const extraClasses = (
    Array.isArray(options.hostClasses)
      ? options.hostClasses
      : options.hostClasses !== undefined
        ? [options.hostClasses]
        : []
  )
    .flatMap((className) => className.split(/\s+/))
    .filter((className) => className !== "" && className !== BOOK_PAGE_CLASS);

  const anchor = sourceElement.nextSibling;

  const hosts: HTMLElement[] = [];

  for (const [index] of groups.entries()) {
    if (index === 0) {
      hosts.push(sourceElement);

      continue;
    }

    const host = document.createElement("div");

    host.className = [BOOK_PAGE_CLASS, ...extraClasses].join(" ");

    parent.insertBefore(host, anchor);

    hosts.push(host);
  }

  const addedHostClass = !sourceElement.classList.contains(BOOK_PAGE_CLASS);

  if (addedHostClass) {
    sourceElement.classList.add(BOOK_PAGE_CLASS);
  }

  for (const [index, group] of groups.entries()) {
    hosts[index]!.append(...group);
  }

  for (const marker of markers) {
    marker.remove();
  }

  let restored = false;

  return {
    pages: hosts,

    restore(): void {
      if (restored) {
        return;
      }

      restored = true;

      for (const node of originalNodes) {
        sourceElement.append(node);
      }

      for (const [index, host] of hosts.entries()) {
        if (index > 0) {
          host.remove();
        }
      }

      if (addedHostClass) {
        sourceElement.classList.remove(BOOK_PAGE_CLASS);
      }
    },
  };
}
