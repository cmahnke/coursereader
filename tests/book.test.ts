/* ==========================================================================
 * Book pagination tests
 * ========================================================================== */

import { beforeEach, describe, expect, it } from "vitest";

import { BOOK_PAGE_CLASS, splitBook } from "../src/ts/book.js";
import { createCourseReaderViewer } from "../src/ts/viewer.js";

function bookDocument(id: string, markup: string): HTMLElement {
  const element = document.createElement("article");

  element.id = id;

  element.innerHTML = markup;

  document.body.append(element);

  return element;
}

describe("splitBook", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("splits at hr markers and consumes them", () => {
    const source = bookDocument(
      "book-hr",
      "<h1>One</h1><p>First page.</p><hr><h2>Two</h2><p>Second page.</p>",
    );

    const book = splitBook(source);

    expect(book.pages).toHaveLength(2);

    expect(book.pages[0]).toBe(source);

    expect(book.pages[0]!.textContent).toBe("OneFirst page.");

    expect(book.pages[1]!.textContent).toBe("TwoSecond page.");

    expect(source.querySelector("hr")).toBeNull();
  });

  it("treats data-page-break as a break after the element", () => {
    const source = bookDocument(
      "book-attribute",
      "<h1>One</h1><p data-page-break>First page.</p><p>Second page.</p>",
    );

    const book = splitBook(source);

    expect(book.pages).toHaveLength(2);

    expect(book.pages[0]!.textContent).toBe("OneFirst page.");

    expect(book.pages[1]!.textContent).toBe("Second page.");
  });

  it("honours inline break-before and break-after styles", () => {
    const source = bookDocument(
      "book-breaks",
      "<p style='break-after: page'>First.</p><p>Middle.</p><p style='break-before: page'>Last.</p>",
    );

    const book = splitBook(source);

    expect(book.pages).toHaveLength(3);

    expect(book.pages[0]!.textContent).toBe("First.");

    expect(book.pages[1]!.textContent).toBe("Middle.");

    expect(book.pages[2]!.textContent).toBe("Last.");
  });

  it("keeps empty groups as blank pages", () => {
    const source = bookDocument(
      "book-blank",
      "<p>Only.</p><hr><hr><p>After the blank.</p>",
    );

    const book = splitBook(source);

    expect(book.pages).toHaveLength(3);

    expect(book.pages[0]!.textContent).toBe("Only.");

    expect(book.pages[1]!.childElementCount).toBe(0);

    expect(book.pages[2]!.textContent).toBe("After the blank.");
  });

  it("keeps a single page without markers", () => {
    const source = bookDocument("book-single", "<p>All of it.</p>");

    const book = splitBook(source);

    expect(book.pages).toEqual([source]);
  });

  it("ignores break markers below the direct children", () => {
    const source = bookDocument(
      "book-nested",
      "<section><p data-page-break>Nested.</p><hr></section><p>After.</p>",
    );

    const book = splitBook(source);

    expect(book.pages).toEqual([source]);

    expect(source.querySelector("hr")).not.toBeNull();
  });

  it("moves the first host's content into the source element", () => {
    const source = bookDocument("book-host", "<p>One.</p><hr><p>Two.</p>");

    const book = splitBook(source);

    expect(book.pages[1]!.className).toBe(BOOK_PAGE_CLASS);
  });

  it("applies host classes to generated hosts", () => {
    const source = bookDocument("book-classes", "<p>One.</p><hr><p>Two.</p>");

    const book = splitBook(source, { hostClasses: "paper viewer-page" });

    expect(book.pages[1]!.className).toBe(
      `${BOOK_PAGE_CLASS} paper viewer-page`,
    );

    expect(source.classList.contains(BOOK_PAGE_CLASS)).toBe(true);
  });

  it("restores the original document on destroy", () => {
    const source = bookDocument(
      "book-restore",
      "<h1>Head</h1> <p>One.</p><hr><p data-page-break>Two.</p><p>Three.</p><hr><p>Four.</p>",
    );

    const before = source.innerHTML;

    const book = splitBook(source);

    book.restore();

    expect(source.innerHTML).toBe(before);

    expect(document.querySelectorAll(".cr-book-page")).toHaveLength(0);
  });

  it("restore is idempotent", () => {
    const source = bookDocument(
      "book-idempotent",
      "<p>One.</p><hr><p>Two.</p>",
    );

    const book = splitBook(source);

    book.restore();

    book.restore();

    expect(source.innerHTML).toBe("<p>One.</p><hr><p>Two.</p>");
  });

  it("throws for an unknown source", () => {
    expect(() => splitBook("#missing-book")).toThrow(
      /Archive Scan source was not found/,
    );
  });
});

describe("viewer with a continuous document", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function singleLayout(): [{ query: string; mode: "single" }] {
    return [{ query: "all", mode: "single" }];
  }

  it("splits a single element into pages", () => {
    const host = document.createElement("div");

    host.id = "book-viewer-host";

    document.body.append(host);

    bookDocument(
      "book-viewer-doc",
      "<h1>One</h1><hr><p>Two.</p><hr><p>Three.</p>",
    );

    const viewer = createCourseReaderViewer(host, {
      pages: "#book-viewer-doc",

      layouts: singleLayout(),
    });

    expect(viewer.pageCount).toBe(3);

    viewer.destroy();
  });

  it("restores the document when the viewer is destroyed", () => {
    const host = document.createElement("div");

    host.id = "book-viewer-restore-host";

    document.body.append(host);

    const source = bookDocument(
      "book-viewer-restore",
      "<h1>One</h1><hr><p>Two.</p><hr><p>Three.</p>",
    );

    const before = source.innerHTML;

    const viewer = createCourseReaderViewer(host, {
      pages: source,

      bookHostClasses: "extra-class",

      layouts: singleLayout(),
    });

    expect(viewer.pageCount).toBe(3);

    viewer.destroy();

    expect(source.innerHTML).toBe(before);

    expect(source.className).toBe("");

    expect(document.querySelectorAll(".extra-class")).toHaveLength(0);
  });

  it("navigates to pages reached through fragment links", async () => {
    const host = document.createElement("div");

    host.id = "book-viewer-links-host";

    document.body.append(host);

    const source = bookDocument(
      "book-viewer-links",
      "<p><a href='#target'>Jump</a></p><hr><section id='target'><p>There.</p></section>",
    );

    const viewer = createCourseReaderViewer(host, {
      pages: source,

      followLinks: true,

      layouts: singleLayout(),
    });

    const link = source.querySelector("a")!;

    link.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    await Promise.resolve();

    expect(viewer.getPage()).toBe(1);

    viewer.destroy();
  });
});
