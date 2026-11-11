/* ==========================================================================
 * Playground download tests
 * ========================================================================== */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlayground } from "../src/ts/playground.js";

const PRESET_KEYS = [
  "paper",
  "exposure",
  "ink",
  "tone",
  "artifacts",
  "capture",
  "border",
];

interface DownloadStub {
  blobs: Blob[];

  download: string | null;

  createObjectURL: ReturnType<typeof vi.fn>;

  revokeObjectURL: ReturnType<typeof vi.fn>;
}

function stubDownload(): DownloadStub {
  const stub: DownloadStub = {
    blobs: [],
    download: null,
    createObjectURL: vi.fn(),
    revokeObjectURL: vi.fn(),
  };

  stub.createObjectURL.mockImplementation((blob: Blob) => {
    stub.blobs.push(blob);

    return "blob:mock-url";
  });

  Object.defineProperty(URL, "createObjectURL", {
    value: stub.createObjectURL,
    configurable: true,
  });

  Object.defineProperty(URL, "revokeObjectURL", {
    value: stub.revokeObjectURL,
    configurable: true,
  });

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (this.download) {
      stub.download = this.download;
    }
  });

  return stub;
}

async function flushTimers(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Playground preset download", () => {
  let host: HTMLElement;

  let handle: ReturnType<typeof createPlayground> | null = null;

  afterEach(() => {
    handle?.destroy();
    handle = null;

    host?.remove();
    vi.restoreAllMocks();
  });

  it("downloads the resolved settings as a JSON preset file", async () => {
    host = document.createElement("div");

    document.body.append(host);

    handle = createPlayground(host, {
      sections: { playground: true, viewer: false },
    });

    const stub = stubDownload();

    const button =
      document.querySelector<HTMLButtonElement>("#control-download")!;

    expect(button.disabled).toBe(false);

    button.click();

    await flushTimers();

    expect(stub.download).toBe("coursereader-preset.json");

    expect(stub.blobs).toHaveLength(1);

    const text = await stub.blobs[0].text();

    const definition = JSON.parse(text) as Record<string, unknown>;

    for (const key of PRESET_KEYS) {
      expect(definition).toHaveProperty(key);
    }

    expect(stub.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("mirrors the displayed tone in the downloaded definition", async () => {
    host = document.createElement("div");

    document.body.append(host);

    const stub = stubDownload();

    handle = createPlayground(host, {
      sections: { playground: true, viewer: false },
    });

    const button =
      document.querySelector<HTMLButtonElement>("#control-download")!;

    const toneModeSelect =
      document.querySelector<HTMLSelectElement>("#control-tone-mode")!;

    toneModeSelect.value = "bitonal";

    toneModeSelect.dispatchEvent(new Event("change"));

    button.click();

    await flushTimers();

    const text = await stub.blobs[0].text();

    const definition = JSON.parse(text) as {
      tone: { mode: string };
    };

    expect(definition.tone.mode).toBe("bitonal");
  });

  it("disables downloading while the effect is destroyed", async () => {
    host = document.createElement("div");

    document.body.append(host);

    const stub = stubDownload();

    handle = createPlayground(host, {
      sections: { playground: true, viewer: false },
    });

    const button =
      document.querySelector<HTMLButtonElement>("#control-download")!;

    const destroyButton =
      document.querySelector<HTMLButtonElement>("#control-destroy")!;

    destroyButton.click();

    await flushTimers();

    expect(button.disabled).toBe(true);

    const clicks = stub.blobs.length;

    button.click();

    await flushTimers();

    expect(stub.blobs).toHaveLength(clicks);
  });
});

describe("Playground viewer document", () => {
  let host: HTMLElement;

  let handle: ReturnType<typeof createPlayground> | null = null;

  afterEach(() => {
    handle?.destroy();
    handle = null;

    host?.remove();
  });

  it("splits the continuous viewer document into book pages", () => {
    host = document.createElement("div");

    document.body.append(host);

    handle = createPlayground(host, {
      sections: { playground: false, viewer: true },
    });

    /*
     * Continuous seating keeps every page attached to the document;
     * in spread mode only the current row is seated.
     */
    const toggle =
      document.querySelector<HTMLInputElement>("#viewer-continuous")!;

    toggle.checked = true;

    toggle.dispatchEvent(new Event("change"));

    const pages = document.querySelectorAll<HTMLDivElement>(
      "#reader .archive-scan-page",
    );

    expect(pages).toHaveLength(4);

    /*
     * The cover is the document element itself; the generated hosts
     * share the paper styling and read as justified prose.
     */
    expect(document.querySelector("#viewer-book")!.className).toContain(
      "viewer-page-cover",
    );

    for (const page of Array.from(pages).slice(1)) {
      const content = page.querySelector<HTMLElement>(".archive-scan-content");

      const host = content?.querySelector<HTMLElement>(".cr-book-page");

      expect(host?.className).toContain(
        "cr-book-page paper viewer-page cr-prose",
      );
    }

    expect(
      document.querySelectorAll(
        "#reader .archive-scan-content > .cr-book-page .cr-folio",
      ),
    ).toHaveLength(3);
  });

  it("restores the document when the playground is destroyed", () => {
    host = document.createElement("div");

    document.body.append(host);

    handle = createPlayground(host, {
      sections: { playground: false, viewer: true },
    });

    const source = document.querySelector("#viewer-book")!;

    expect(source.childElementCount).toBeGreaterThan(0);

    handle.destroy();

    handle = null;

    /*
     * The split is undone: every page element is back inside the
     * continuous document, break markers included.
     */
    expect(source.querySelectorAll("hr")).toHaveLength(3);

    expect(source.querySelector(".cr-book-page")).toBeNull();
  });
});

describe("Playground expert range mode", () => {
  let host: HTMLElement;

  let handle: ReturnType<typeof createPlayground> | null = null;

  afterEach(() => {
    handle?.destroy();
    handle = null;

    host?.remove();
  });

  function startPlayground(): void {
    host = document.createElement("div");

    document.body.append(host);

    handle = createPlayground(host, {
      sections: { playground: true, viewer: false },
    });
  }

  function readout(): Record<string, unknown> {
    return JSON.parse(
      document.querySelector<HTMLPreElement>("#control-settings")!.textContent!,
    );
  }

  it("applies a ranged ink spread as one shared concrete value", () => {
    startPlayground();

    const toggle = document.querySelector<HTMLInputElement>("#control-ranges")!;

    toggle.checked = true;

    toggle.dispatchEvent(new Event("change"));

    const max = document.querySelector<HTMLInputElement>(
      "#control-ink-spread-range-max",
    )!;

    const min = document.querySelector<HTMLInputElement>(
      "#control-ink-spread-range-min",
    )!;

    /* The collapsed range starts at the preset value. */
    max.value = "0.6";

    max.dispatchEvent(new Event("input"));

    min.value = "0.2";

    min.dispatchEvent(new Event("input"));

    const settings = readout() as { ink: { spread: number } };

    expect(typeof settings.ink.spread).toBe("number");

    expect(settings.ink.spread).toBeGreaterThanOrEqual(0.2);

    expect(settings.ink.spread).toBeLessThanOrEqual(0.6);
  });

  it("keeps single sliders by default", () => {
    startPlayground();

    const toggle = document.querySelector<HTMLInputElement>("#control-ranges")!;

    expect(toggle.checked).toBe(false);

    const min = document.querySelector<HTMLInputElement>(
      "#control-grain-range-min",
    )!;

    const single = document.querySelector<HTMLInputElement>("#control-grain")!;

    expect(min.disabled).toBe(true);

    expect(single.disabled).toBe(false);
  });

  it("switches the sliders to dual handles and applies ranges", () => {
    startPlayground();

    const toggle = document.querySelector<HTMLInputElement>("#control-ranges")!;

    toggle.checked = true;

    toggle.dispatchEvent(new Event("change"));

    const min = document.querySelector<HTMLInputElement>(
      "#control-grain-range-min",
    )!;

    const max = document.querySelector<HTMLInputElement>(
      "#control-grain-range-max",
    )!;

    const single = document.querySelector<HTMLInputElement>("#control-grain")!;

    expect(min.disabled).toBe(false);

    expect(single.disabled).toBe(true);

    /* The collapsed range starts at the current value (0 for the
       clean preset), so the upper handle moves first. */
    max.value = "0.6";

    max.dispatchEvent(new Event("input"));

    min.value = "0.2";

    min.dispatchEvent(new Event("input"));

    const grain = readout().artifacts as { grain: number };

    expect(grain.grain).toBeGreaterThanOrEqual(0.2);

    expect(grain.grain).toBeLessThanOrEqual(0.6);

    /* The handles may not cross: the moved one clamps. */
    min.value = "0.1";

    min.dispatchEvent(new Event("input"));

    expect(min.value).toBe("0.1");

    min.value = "0.7";

    min.dispatchEvent(new Event("input"));

    expect(min.value).toBe("0.6");
  });

  it("carries the authored ranges into the preset download", async () => {
    startPlayground();

    const stub = stubDownload();

    const toggle = document.querySelector<HTMLInputElement>("#control-ranges")!;

    toggle.checked = true;

    toggle.dispatchEvent(new Event("change"));

    const min = document.querySelector<HTMLInputElement>(
      "#control-grain-range-min",
    )!;

    const max = document.querySelector<HTMLInputElement>(
      "#control-grain-range-max",
    )!;

    max.value = "0.6";

    max.dispatchEvent(new Event("input"));

    min.value = "0.2";

    min.dispatchEvent(new Event("input"));

    document.querySelector<HTMLButtonElement>("#control-download")!.click();

    await flushTimers();

    const text = await stub.blobs[0].text();

    const definition = JSON.parse(text) as {
      artifacts: { grain: number[] | number };
    };

    expect(definition.artifacts.grain).toEqual([0.2, 0.6]);
  });

  it("collapses the ranges when the preset changes", async () => {
    startPlayground();

    const stub = stubDownload();

    const toggle = document.querySelector<HTMLInputElement>("#control-ranges")!;

    toggle.checked = true;

    toggle.dispatchEvent(new Event("change"));

    const min = document.querySelector<HTMLInputElement>(
      "#control-grain-range-min",
    )!;

    const max = document.querySelector<HTMLInputElement>(
      "#control-grain-range-max",
    )!;

    max.value = "0.6";

    max.dispatchEvent(new Event("input"));

    min.value = "0.2";

    min.dispatchEvent(new Event("input"));

    const presetSelect =
      document.querySelector<HTMLSelectElement>("#control-preset")!;

    presetSelect.value = "clean";

    presetSelect.dispatchEvent(new Event("change"));

    document.querySelector<HTMLButtonElement>("#control-download")!.click();

    await flushTimers();

    const text = await stub.blobs[0]!.text();

    const definition = JSON.parse(text) as {
      artifacts: { grain: number[] | number };
    };

    expect(typeof definition.artifacts.grain).toBe("number");
  });
});
