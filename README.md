# Coursereader

Coursereader is a dependency-free TypeScript library that makes live HTML
resemble photocopies, microfilm, archival scans, photographed books, and
degraded reproductions.

The effect preserves:

- Selectable text
- Links
- Semantic HTML
- Images and diagrams
- Forms and controls
- Screen-reader content
- Responsive layout

It does not rasterize the webpage.

## Live demo

The playground is deployed to GitHub Pages:
<https://cmahnke.github.io/coursereader/>

The API reference is generated from the JSDoc comments with TypeDoc
and published next to it:
<https://cmahnke.github.io/coursereader/docs/>

## Installation

```bash
npm install @projektemacher/coursereader
```

The package is ESM-only and ships TypeScript declarations. Published
tarballs also include the compiled playground at
`playground/dist/index.html`.

## Quick start

```ts
import { courseReader } from "@projektemacher/coursereader";

const page = courseReader("#document", {
  preset: "microfilm-journal",
  seed: 1971,
});
```

The supplied element is wrapped, not converted into an image.

```html
<article id="document">
  <h1>Document title</h1>
  <p>The original text remains selectable.</p>
</article>
```

Destroy the effect and restore the original element:

```ts
page.destroy();
```

Use `page.update()` to change settings without touching the stored preset:

```ts
page.update({
  artifacts: {
    grain: 0.2,
    verticalStreaks: 0.4,
  },

  border: {
    enabled: false,
  },
});
```

## Built-in presets

| Preset                 | Appearance                                                    |
| ---------------------- | ------------------------------------------------------------- |
| `clean`                | Neutral defaults with only the copier frame visible           |
| `book-photo`           | Photographed book page with mild rotation and uneven lighting |
| `bound-volume`         | `book-photo` with higher contrast and edge wear               |
| `microfilm-journal`    | Heavy grain, scratches, streaks and a dark frame              |
| `early-office-bitonal` | Harsh two-tone office-copy appearance                         |
| `xerox-zine`           | Stronger bitonal variant with a worn frame                    |
| `analog-gray-copy`     | Quantized eight-level analog office copy                      |
| `digital-gray-copy`    | Cleaner 32-level digital copier appearance                    |

Gutters and responsive layout are not part of scan presets. They belong
to viewer layouts and gutter styles.

## Custom presets

A preset is plain JSON: a `DeepPartial<ScanSettings>` object that may
inherit another preset with `extends`. Save it as a file next to your
app:

```json
{
  "extends": "analog-gray-copy",
  "exposure": {
    "contrast": 1.6
  },
  "tone": {
    "mode": "quantized",
    "levels": 4,
    "dither": "random",
    "ditherAmount": 0.6
  }
}
```

Every numeric value may also be authored as a range — an array of
two numbers, `[min, max]`. When the renderer encounters a range it
picks a random value between the bounds, both included:

```json
{
  "extends": "microfilm-journal",
  "artifacts": {
    "grain": [0.4, 0.8],
    "dust": [0.1, 0.3]
  }
}
```

The pick is deterministic: every range draws from its own seeded
random derived from the page seed and the setting's path, so the
same seed resolves the same values — pages rendered with equal
seeds are still identical copies, and updating an unrelated setting
never reshuffles the picked ones. Ranges are accepted in preset
definitions and in the `overrides` option and `update()` calls
alike; any array inside the settings that is not a valid
`[min, max]` pair throws a descriptive error. Prefer single values
for integer-valued fields such as `tone.levels`, which receive the
interpolated number as-is.

A single JSON document can also hold a map of presets:

```json
{
  "newsprint": {
    "extends": "analog-gray-copy",
    "artifacts": { "grain": 0.35 }
  },

  "blueprint": {
    "extends": "digital-gray-copy",
    "paper": { "tone": 0.72 }
  }
}
```

Register the presets in your app before creating pages or viewers —
the `preset` option refers to the registered name:

```ts
import { presets } from "@projektemacher/coursereader";

// A single-definition file needs an explicit name:
await presets.fromUrl("./presets/newsprint.json", "newsprint");

// A map file registers every entry:
await presets.fromUrl("./presets/office.json");

// Both also work with plain fetch and the registry directly:
const response = await fetch("./presets/office.json");

presets.import(await response.json());
```

Then reference the preset by name:

```ts
courseReader("#document", {
  preset: "newsprint",
});
```

`presets.fromUrl()` fetches the document over HTTP, registers it and
returns the loaded preset names. Unknown or circular preset names
throw when they are resolved.

Presets can also be defined in code, as shown in
[Defining presets in code](#defining-presets-in-code).

## Enhancement modes

`enhancement` selects the rendering strategy:

```ts
courseReader("#document", {
  preset: "analog-gray-copy",
  enhancement: "auto",
});
```

- `"auto"` uses SVG filters where supported and otherwise falls back to CSS.
- `"svg"` requests SVG filters.
- `"css"` forces the basic HTML/CSS fallback.

The CSS fallback retains:

- Grayscale
- Brightness
- Contrast
- Basic blur
- Paper tone
- Grain
- Dust
- Scratches
- Streaks
- Dark borders
- Uneven exposure
- Responsive gutters

It cannot perform a strict per-pixel threshold. Bitonal and quantized
modes therefore become high-contrast grayscale approximations in CSS
fallback mode.

If JavaScript fails entirely, the source HTML remains normal HTML and
does not depend on a canvas or generated image.

## Tuning the tone

### Strict bitonal mode

Bitonal mode produces an SVG-filtered black-and-white representation:

```ts
courseReader("#document", {
  preset: "early-office-bitonal",

  overrides: {
    tone: {
      mode: "bitonal",
      threshold: 0.62,
      dither: "random",
      ditherAmount: 0.1,
    },
  },
});
```

A higher threshold produces more black:

```ts
tone: {
  threshold: 0.7;
}
```

A lower threshold preserves more white:

```ts
tone: {
  threshold: 0.48;
}
```

Strict bitonal output is an SVG rendering effect. The underlying DOM and
text are unchanged.

### Quantized grayscale

Restrict the visible output to a fixed number of gray levels:

```ts
courseReader("#document", {
  preset: "analog-gray-copy",

  overrides: {
    tone: {
      mode: "quantized",
      levels: 8,
      dither: "random",
      ditherAmount: 0.32,
    },
  },
});
```

Suggested values:

| Levels | Appearance                    |
| -----: | :---------------------------- |
|      2 | Black and white               |
|      4 | Very coarse gray              |
|      8 | Coarse analog-copy appearance |
|     16 | Moderate grayscale            |
|     32 | Cleaner digital copier        |
|    256 | Effectively continuous        |

### Random dithering

Random-looking dithering uses seeded SVG turbulence before thresholding
or quantization:

```ts
courseReader("#document", {
  preset: "analog-gray-copy",
  seed: "document-12-page-4",

  overrides: {
    tone: {
      mode: "quantized",
      levels: 6,
      dither: "random",
      ditherAmount: 0.4,
    },
  },
});
```

The same seed produces the same SVG noise configuration. Browser SVG
implementations can still differ slightly, so this is deterministic
configuration rather than guaranteed pixel-identical output across all
browsers.

The seed also steers the placement of the exposure falloff, the
show-through pattern, the noise tile alignment and the sheet edge
shadows, so pages with different seeds produce visibly different scans
even with identical settings.

## Defining presets in code

Presets are plain serializable configuration objects:

```ts
import { presets } from "@projektemacher/coursereader";

presets.define("library-copy", {
  extends: "analog-gray-copy",

  exposure: {
    contrast: 1.35,
    unevenness: 0.2,
  },

  tone: {
    mode: "quantized",
    levels: 6,
    dither: "random",
    ditherAmount: 0.38,
  },

  artifacts: {
    grain: 0.25,
    verticalStreaks: 0.08,
  },
});
```

Use the custom preset:

```ts
courseReader("#document", {
  preset: "library-copy",
  seed: 42,
});
```

Update it:

```ts
presets.update("library-copy", {
  artifacts: {
    grain: 0.4,
  },
});
```

Export one preset or every preset:

```ts
const one = JSON.stringify(presets.export("library-copy"), null, 2);
const all = JSON.stringify(presets.export(), null, 2);
```

Import preset data:

```ts
presets.import({
  "machine-number-three": {
    extends: "early-office-bitonal",

    tone: {
      threshold: 0.66,
      ditherAmount: 0.14,
    },
  },
});
```

`PresetRegistry` also supports `get`, `has`, `names`, `remove` and
`resolve`.

## Responsive viewer

`createCourseReaderViewer` renders multiple pages and switches between
single-page and spread layouts as media queries match.

```ts
import { createCourseReaderViewer } from "@projektemacher/coursereader";

const viewer = createCourseReaderViewer("#reader", {
  pages: ["#page-1", "#page-2", "#page-3", "#page-4"],

  preset: "microfilm-journal",
  seed: 1971,

  layouts: [
    {
      query: "(max-width: 767px)",
      mode: "single",
      pageFit: "width",
      gutter: false,
      background: "#222",
    },

    {
      query: "(min-width: 768px)",
      mode: "spread",
      pageFit: "contain",
      gap: 0,
      gutter: "deep-bound-volume",
      background: "#222",
    },
  ],
});
```

In spread mode pages pair sequentially (1-2, 3-4, 5-6, …) so the
viewer opens on a full two-page spread. Set
`spread: { firstPageSide: "right" }` on a layout to seat the first
page alone on the right like a book cover, then pair the remaining
pages (2-3, 4-5, …).

Set `continuous: true` on the viewer options to stack every seat
below the previous one — pages in single layouts, paired rows in
spread layouts — and scroll through the stack. Navigation buttons
and arrow keys scroll to the current seat instead of paging.

Instead of an array, `pages` also accepts a single element or
selector: that element is then treated as one continuous document
and split into book pages — see [Book convention](#book-convention).

### Links

Links inside the pages read as ink: the browser's default link,
visited and hover colours would survive the tone processing as
mid-gray, so they are overridden. An underline appears only on
mouse hover and keyboard focus. The show-through ghost mirrors the
content behind the paper — its links are part of the print and
always stay plain black with no decoration.

### Linking between pages

Give each page element an id and link to it with a fragment URL:

```html
<article id="page-1">
  <p>See <a href="#page-4">the appendix</a> for the parish index.</p>
</article>

<article id="page-4">
  <h2>Appendix</h2>
  <p>Deep links to sections inside a page also work:</p>
  <section id="appendix-2">
    <a href="#page-1">Back to the cover</a>
  </section>
</article>
```

Enable `followLinks` on the viewer options to intercept clicks on
those fragment links:

```ts
const viewer = createCourseReaderViewer("#reader", {
  pages: ["#page-1", "#page-4"],
  followLinks: true,
  layouts: [{ query: "all", mode: "single" }],
});
```

The click resolves to the first page whose source carries the
target id — either the page itself or any descendant, so both
`#page-4` and `#appendix-2` land on the second page. In paged
mode the page is seated; in continuous mode the stack scrolls to
it. Links without a matching fragment keep the browser's default
behaviour, as do links opened with modifier keys (Cmd/Ctrl/Shift/
Alt) or in a new target.

Navigation:

```ts
await viewer.next();
await viewer.previous();
await viewer.goTo(5);
```

Page indices are zero-based. Use `viewer.getPage()` for the current
index, `viewer.refresh()` after external changes, and `viewer.destroy()`
to tear the viewer down.

## Book convention

The viewer usually receives pages that already exist as separate
elements. A single continuous document — one long HTML file, a
Markdown render, a feed of chapters — can be fed to the viewer
directly instead:

```ts
const viewer = createCourseReaderViewer("#reader", {
  pages: "#manuscript",

  bookHostClasses: "paper cr-prose",

  layouts: [{ query: "all", mode: "spread" }],
});
```

The document element itself becomes the first page and keeps its id
and classes; every further page is collected into a generated host
element (marked `cr-book-page`, plus the classes from
`bookHostClasses`). Content is moved, not cloned, so ids, links and
form state stay intact. Destroying the viewer moves everything back
into the document in its original order.

### Break markers

Pagination is marker-driven: the library never reflows content on
its own, so pages end where the author says they end. Three
markers are honoured among the direct children of the document:

| Marker                                     | Effect                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `<hr>`                                     | Ends the page; the rule itself is consumed                                        |
| `data-page-break` attribute                | Ends the page after the carrying element                                          |
| `break-before: page` / `break-after: page` | Honoured through the computed style, so stylesheet rules work like in paged media |

`<hr>` needs no wrapper markup and is what Markdown `---` emits,
which makes it the natural marker for generated documents. The CSS
`break-*` properties are the native paged-media convention and
compose with any element — a chapter heading can carry
`break-before: page` and start a fresh sheet. Nested markers are
ignored, so lists, tables and figures never split internally.
Empty groups are kept as deliberate blank pages (versos).

### Structure and typography

The book classes style the furniture of a printed book while
leaning on the document's own semantics: `h1`–`h3` for the title
tiers, `<hgroup>` for title and subtitle, `<address>` for the
imprint or colophon, `<aside>` for notes, `<blockquote>` with
`<cite>` for epigraphs.

| Class               | Feature                                                        |
| ------------------- | -------------------------------------------------------------- |
| `cr-titlepage`      | Title page; content is centred                                 |
| `cr-book-title`     | Book title (`h1`)                                              |
| `cr-part-title`     | Part title (`h2`)                                              |
| `cr-chapter-title`  | Chapter title (`h3`)                                           |
| `cr-subtitle`       | Subtitle, set in italic                                        |
| `cr-author`         | Author line, set in small caps                                 |
| `cr-kicker`         | Kicker above a title, small caps with tracking                 |
| `cr-imprint`        | Imprint or colophon line, set smaller                          |
| `cr-epigraph`       | Epigraph block, inset and ragged                               |
| `cr-dropcap`        | Dropped initial letter on the carrying paragraph               |
| `cr-smallcaps`      | Small-caps run inside the text                                 |
| `cr-folio`          | Page number; an empty element numbers itself automatically     |
| `cr-running-head`   | Running head, centred in small caps                            |
| `cr-sidenote`       | Marginal note, floated into the fore-edge margin               |
| `cr-footnote`       | Note set smaller beneath the prose                             |
| `cr-verse`          | Verse block, indented and ragged                               |
| `cr-hanging-indent` | Hanging indent for reference lists                             |
| `cr-prose`          | Prose defaults: justified, hyphenated, widows and orphans kept |
| `cr-ragged`         | Returns a page to ragged setting                               |

The folio counter increments on every sheet, so an empty
`<span class="cr-folio"></span>` renders its own page number in
reading order. `cr-prose` is opt-in and meant for text pages;
title pages, tables and forms read better without it.

### Splitting without the viewer

`splitBook` performs the split on its own and returns the page
hosts, for pipelines that manage pages themselves:

```ts
import { splitBook } from "@projektemacher/coursereader";

const book = splitBook("#manuscript", { hostClasses: "paper" });

// book.pages — page host elements in reading order
// book.restore() — undo the split
```

## Gutter styles

Register a reusable binding style through `bindings`:

```ts
import { bindings } from "@projektemacher/coursereader";

bindings.define("library-binding", {
  width: 40,
  darkness: 0.72,
  blur: 14,
  curvature: 0.6,
  highlight: 0.12,
});
```

Use it only in the desktop spread layout:

```ts
layouts: [
  {
    query: "(max-width: 767px)",
    mode: "single",
    gutter: false,
  },

  {
    query: "(min-width: 768px)",
    mode: "spread",
    gutter: "library-binding",
  },
];
```

The compositor determines the gutter edge:

```text
left page   → right gutter
right page  → left gutter
single page → no gutter
```

An inline gutter configuration is also supported:

```ts
{
  query: "(min-width: 768px)",
  mode: "spread",

  gutter: {
    width: 36,
    darkness: 0.65,
    blur: 12,
    curvature: 0.5,
    highlight: 0.08
  }
}
```

### Spine rendering

Spread layouts render the same spine as the playground desk — both use
the same renderer. Each sheet shows a curl half at the seam and the
stacked page-block edges at the outer fore-edges. The chrome is keyed
on a `data-spine-side="left" | "right"` attribute the viewer places on
every sheet seated in a spread, and it is anchored to the sheet's
content, so it follows the sheet's rotation and passes through the
page's own tone processing. The spine appears whenever a spread seats
a page — including when `gutter` is disabled.

Pass `spinePages` (sheets stacked per side, like the playground's
"Pages per side" control) to scale the fold the same way the desk
does; without it the CSS defaults reproduce the original look. The
look can also be tuned per instance through custom properties:

```ts
const viewer = createCourseReaderViewer("#reader", {
  pages: ["#page-1", "#page-2"],
  layouts: [{ query: "all", mode: "spread" }],

  spinePages: 8,
});
```

```css
.archive-scan-viewer {
  --archive-curl-half: 24px; /* seam curl width */
  --archive-block-depth: 11px; /* fore-edge stack depth */

  --archive-curl-light-1: 0.55; /* curl highlight bands */
  --archive-curl-light-2: 0.25;
  --archive-curl-edge: 0.34; /* curl shadow stops */
  --archive-curl-mid: 0.9;
  --archive-curl-core: 0.96;
}
```

## Playground

`createPlayground` renders the self-contained playground UI used by the
live demo: tabs, controls, sample sheets and a multi-page viewer.

```ts
import { createPlayground } from "@projektemacher/coursereader";

const playground = createPlayground("#app", {
  title: "Archive Scan",
  sections: {
    playground: true,
    viewer: true,
  },
});

// Later:
playground.destroy();
```

Options include `title`, `subtitle`, `sampleDocument`,
`sampleDocumentRight`, `viewerDocument` and `sections`. The viewer
section receives one continuous document and splits it into pages
with the book convention described above.

The rendered demo exposes its own controls: tone and artifact sliders,
preset, seed and enhancement selects, a frame toggle and a ring-binder
toggle. In spread mode, "Pages per side" stacks extra sheets at the
fore-edges and deepens the spine fold (1–16 sheets), the rotation
sliders tilt each sheet manually in both directions, and the
"Grayscale dithering" toggle reproduces every gray tone as random
black dots through stochastic screening. A collapsed "Advanced
settings" section below the live overrides exposes every remaining
`ScanSettings` option — paper tone and texture, the full exposure
curve, ink erosion, all scan artifacts, capture handling and the
copier frame's darkness, thickness, roughness and sides.

The advanced settings also carry the expert "Ranges" toggle. When
it is active, every numeric slider grows a second handle and
authors a `[min, max]` range instead of a single value: the pages
pick a fresh value between the handles, deterministically from the
seed, so each rendered sheet is a different copy of the same
setting. Authored ranges round-trip — the preset download emits
them as arrays and "Show in viewer" passes them through to the
viewer's pages — and leaving the toggle or switching the preset
collapses the sliders back to single values.

## API overview

| Export                                            | Purpose                                          |
| ------------------------------------------------- | ------------------------------------------------ |
| `createCourseReaderPage(source, options)`         | Wrap an attached element in the scan effect      |
| `courseReader`                                    | Alias for `createCourseReaderPage`               |
| `createCourseReaderViewer(target, options)`       | Render a responsive single-page or spread viewer |
| `splitBook(source, options)`                      | Split a continuous document into book pages      |
| `createPlayground(target, options)`               | Render the demo playground                       |
| `createToneFilter(settings, seed, id)`            | Build a standalone SVG tone filter               |
| `createToneTable(settings, sampleCount)`          | Build an SVG component-transfer table            |
| `presets` / `PresetRegistry`                      | Manage and resolve named scan presets            |
| `bindings` / `BindingRegistry`                    | Manage named gutter styles                       |
| `builtInPresets`, `builtInBindings`               | Built-in definitions                             |
| `defaultSettings`                                 | Baseline `ScanSettings`                          |
| `ScanSettings`                                    | Complete scan and reproduction settings          |
| `CourseReaderPageOptions`, `CourseReaderPage`     | Page options and handle                          |
| `CourseReaderViewerOptions`, `CourseReaderViewer` | Viewer options and handle                        |
| `ResponsiveLayout`, `GutterOptions`               | Layout and gutter configuration                  |
| `SplitBookOptions`, `SplitBookHandle`             | Book splitting options and handle                |
| `PlaygroundOptions`, `PlaygroundHandle`           | Playground options and handle                    |

All public factories and types carry JSDoc with parameter, return and
error documentation. The full reference is generated with TypeDoc and
published on GitHub Pages:
<https://cmahnke.github.io/coursereader/docs/>

## Development

The repository requires Node.js 24 (matching CI) and npm.

Install dependencies:

```bash
npm ci
```

Useful commands:

```bash
npm run build                # Generate embedded styles and compile to dist/
npm run build:all            # Build the library and the playground
npm run validate             # ESLint, Stylelint, library and playground typechecks
npm run format               # Prettier
npm run format:check         # Check formatting
npm run dev                  # Start the playground at localhost:5173
npm run playground:dev       # Start the playground at localhost:5173
npm run playground:build
npm run docs                 # Generate the TypeDoc API reference
```

The library CSS lives in `src/css/styles.css` and
`src/css/playground-styles.css`. `scripts/generate-styles.mjs` embeds it
into ignored `src/ts/*.generated.ts` modules during `prepare`, `build`
and `typecheck`. While editing styles, run `npm run watch:styles` to
keep the generated modules up to date.

### Project layout

```text
src/ts/                Library TypeScript source and public types
src/css/               Stylesheet sources embedded at build time
scripts/               Style generation script
playground/            Vite playground and live demo
.github/workflows/     Validation and GitHub Pages workflows
```

### Continuous integration

- `validate.yml` runs ESLint, Stylelint, the library typecheck and the
  playground typecheck on pushes and pull requests to `main`.
- `pages.yml` builds the playground and deploys it to GitHub Pages on
  pushes to `main`.

## Plain HTML-only fallback

A page can use a simplified static effect without importing the library:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />

    <style>
      .archive-fallback {
        position: relative;
        isolation: isolate;
        color: #111;
        background: #eee;
        filter: grayscale(1) contrast(1.35) brightness(1.04);
        box-shadow:
          inset 14px 0 18px rgba(0, 0, 0, 0.12),
          inset -8px 0 12px rgba(0, 0, 0, 0.08);
      }

      .archive-fallback::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 10;
        pointer-events: none;
        opacity: 0.22;
        mix-blend-mode: multiply;
        background:
          repeating-radial-gradient(
            circle at 24% 31%,
            rgba(0, 0, 0, 0.18) 0 0.5px,
            transparent 0.8px 3px
          ),
          linear-gradient(
            90deg,
            rgba(0, 0, 0, 0.12),
            transparent 10%,
            transparent 88%,
            rgba(0, 0, 0, 0.1)
          );
      }
    </style>
  </head>

  <body>
    <article class="archive-fallback">
      <h1>Original HTML</h1>
      <p>This text remains selectable and does not require JavaScript.</p>
    </article>
  </body>
</html>
```

This fallback intentionally does not claim exact bitonal thresholding or
stochastic per-pixel dithering. It provides the general scan appearance
using only HTML and CSS.

## Historical photocopy eras

### Terminology

“Xerox” is a trademark and manufacturer name. It is also frequently used
informally for photocopying.

The presets are visual approximations, not exact simulations of specific
machine models.

Actual appearance depended on:

- Machine model
- Drum and toner condition
- Exposure controls
- Original document
- Paper
- Maintenance
- Copy generation
- Halftone or screening method
- Later scanning and compression

### 1930s–1950s: early xerography

Early xerographic systems were not equivalent to later automatic office
copiers. Some required multiple manual or semi-manual processing stages.

Associated reproduction characteristics include:

- Strong contrast
- Weak tonal continuity
- Toner grain
- Background fog
- Uneven solids
- Loss of pale detail

Suggested starting point: `early-office-bitonal`.

### 1960s: practical plain-paper office copying

Automatic plain-paper copying became substantially more practical. Text
and line art were generally reproduced more successfully than
continuous-tone photographs.

Common archival characteristics include:

- Darkened type
- Lost highlights
- Background marks
- Uneven exposure
- Limited photographic detail
- Platen-edge shadows

Suggested preset: `early-office-bitonal`.

Analog output could appear bitonal without being a literal digital one-bit
image. Toner density and paper texture could create intermediate values.

### 1970s: widespread office and library use

Photocopiers became common in offices, universities and libraries.

Copies may show:

- Strong text reproduction
- Toner expansion around characters
- Book-gutter shadows
- Dark platen edges
- Dust and streaking
- Progressive deterioration in copies of copies

For text-heavy reproductions use `early-office-bitonal`. For pages
retaining some gray tone use `analog-gray-copy`. For pages later
transferred through microfilm use `microfilm-journal`.

### 1980s: improved analog copying

Many machines offered better exposure control, reduction, enlargement and
mixed-original handling.

Common characteristics include:

- More stable text density
- Coarse photographic tones
- Grain or screening
- Edge shadows
- Maintenance streaks
- Detail loss over repeated generations

Suggested preset: `analog-gray-copy`.

```ts
overrides: {
  tone: {
    mode: "quantized",
    levels: 6,
    dither: "random",
    ditherAmount: 0.32
  }
}
```

### 1990s: transition toward digital copiers

Digital copiers increasingly scanned an original and reproduced it
through a digital print engine.

Common differences include:

- More repeatable output
- Cleaner backgrounds
- Digital edge enhancement
- Explicit halftoning
- Multiple gray levels
- More regular screening patterns

Suggested preset: `digital-gray-copy`.

### 2000s onward: multifunction digital devices

Scanner, copier and printer functions increasingly shared one digital
imaging pipeline.

Typical properties include:

- Higher grayscale resolution
- Automatic background removal
- Text/photo classification
- Edge enhancement
- Compression
- Cleaner white regions
- More consistent repeated output

Suggested preset: `digital-gray-copy`.

For a cleaner result:

```ts
overrides: {
  tone: {
    mode: "continuous",
    dither: "none",
    ditherAmount: 0
  },

  artifacts: {
    grain: 0.02,
    dust: 0,
    verticalStreaks: 0
  }
}
```

## Copies of copies

Much of the familiar harsh photocopy appearance results from repeated
reproduction rather than from one machine era.

Each generation may:

- Increase contrast
- Expand dark type
- Remove pale detail
- Convert gray texture into spots
- Strengthen borders
- Accumulate dust and marks

Example:

```ts
presets.define("third-generation-copy", {
  extends: "early-office-bitonal",

  exposure: {
    contrast: 2,
    blownHighlights: 0.4,
    crushedShadows: 0.62,
  },

  ink: {
    spread: 0.7,
  },

  artifacts: {
    grain: 0.4,
    dust: 0.24,
    edgeNoise: 0.52,
  },
});
```

## Bitonal versus old-looking grayscale

A literal bitonal image contains only black and white output values. Use
this for strict two-tone display:

```ts
tone: {
  mode: "bitonal",
  levels: 2,
  threshold: 0.6,
  dither: "none",
  ditherAmount: 0
}
```

Use low-level grayscale when paper and toner variation should remain
visible:

```ts
tone: {
  mode: "quantized",
  levels: 4,
  threshold: 0.6,
  dither: "random",
  ditherAmount: 0.3
}
```

## Limitations

- SVG filter rendering can vary between browsers.
- SVG filters on very large DOM trees may be expensive.
- Random dithering is an SVG turbulence approximation.
- Floyd–Steinberg error diffusion is not possible in live DOM mode.
- CSS fallback cannot perform strict bitonal thresholding.
- Page curvature is represented through transforms and shading rather
  than a full mesh warp.
- PNG or JPEG export requires an optional external rasterizer or a
  browser screenshot tool.
- Physical objects such as hands, paper clips and handwritten notes
  should be supplied by the application rather than procedurally
  invented.

## License

MIT
