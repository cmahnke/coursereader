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

    const button = document.querySelector<HTMLButtonElement>(
      "#control-download",
    )!;

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

    const button = document.querySelector<HTMLButtonElement>(
      "#control-download",
    )!;

    const toneModeSelect = document.querySelector<HTMLSelectElement>(
      "#control-tone-mode",
    )!;

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

    const button = document.querySelector<HTMLButtonElement>(
      "#control-download",
    )!;

    const destroyButton = document.querySelector<HTMLButtonElement>(
      "#control-destroy",
    )!;

    destroyButton.click();

    await flushTimers();

    expect(button.disabled).toBe(true);

    const clicks = stub.blobs.length;

    button.click();

    await flushTimers();

    expect(stub.blobs).toHaveLength(clicks);
  });
});
