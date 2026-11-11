/* ==========================================================================
 * Built-in sample content for the playground
 *
 * The samples keep stable IDs: the playground logic and custom
 * hosts rely on them (#sample-document, #viewer-book, …).
 * ========================================================================== */

export const SAMPLE_DOCUMENT = `
  <article id="sample-document" class="paper">
    <h1>Field Notes of the Ridgeline Survey</h1>
    <p class="paper-lede">
      Prepared for the
      <a href="#sample-document">Advisory Committee on Rural Surveys</a>,
      this bulletin summarises twelve seasons of hedgerow
      observation. The <strong>text remains selectable</strong> and
      every <em>link, control and image</em>
      stays interactive while the scan effect is applied.
    </p>

    <h2>Method</h2>
    <p>
      Plots were walked twice monthly between March and October.
      Observations were recorded on paper forms and later transcribed.
      Species coverage was estimated using the revised Domin scale, and
      hedgerow width was measured at the narrowest point between the
      hedgerow and the adjacent field margin.
    </p>

    <ul>
      <li>142 hedgerows across four parishes</li>
      <li>Two visits per season, five seasons</li>
      <li>Photographs archived at 600 dpi</li>
    </ul>

    <table>
      <caption>Table 1 — Surveyed plots by season</caption>
      <thead>
        <tr>
          <th scope="col">Season</th>
          <th scope="col">Plots</th>
          <th scope="col">Species recorded</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1968</td><td>14</td><td>62</td></tr>
        <tr><td>1969</td><td>19</td><td>71</td></tr>
        <tr><td>1970</td><td>23</td><td>68</td></tr>
      </tbody>
    </table>

    <figure class="paper-figure">
      <svg viewBox="0 0 320 180" role="img" aria-label="Line chart of monthly rainfall, 1969">
        <rect width="320" height="180" fill="#f5f3ee"></rect>
        <line x1="30" y1="150" x2="300" y2="150" stroke="#444" stroke-width="1.5"></line>
        <line x1="30" y1="150" x2="30" y2="20" stroke="#444" stroke-width="1.5"></line>
        <polyline
          fill="none"
          stroke="#333"
          stroke-width="2"
          points="30,120 62,96 94,58 126,44 158,70 190,104 222,132 254,142 286,138"
        ></polyline>
        <circle cx="62" cy="96" r="3" fill="#333"></circle>
        <circle cx="126" cy="44" r="3" fill="#333"></circle>
        <circle cx="190" cy="104" r="3" fill="#333"></circle>
        <circle cx="254" cy="142" r="3" fill="#333"></circle>
      </svg>
      <figcaption>
        Figure 1 — Monthly rainfall recorded at the field station, 1969.
      </figcaption>
    </figure>

    <figure class="paper-figure">
      <canvas class="paper-canvas" width="640" height="360"></canvas>
      <figcaption>
        Figure 2 — Monthly temperature recorded at the field station,
        1969, drawn on a canvas element.
      </figcaption>
    </figure>

    <blockquote>
      “A copy that loses the margins loses the context.” — second
      committee meeting, 1971
    </blockquote>
  </article>
`;

export const SAMPLE_DOCUMENT_RIGHT = `
  <article id="sample-document-2" class="paper">
    <h2>3 · Discussion (continued)</h2>
    <p>
      The second half of the survey period coincided with the
      realignment of the Cottesmore lane, during which two hedgerows
      were clipped by the widened carriageway. Both were retained in the
      sample and are flagged in the parish index as
      <strong>truncated after 1969</strong>.
    </p>
    <p>
      Regeneration on the truncated specimens proceeded from the
      undisturbed hedge base, and the species recovered in those
      sections are therefore reported separately in Table 4 of the full
      report.
    </p>

    <h3>References</h3>
    <ol>
      <li>
        Bexhill, M. (1966)
        <a href="#sample-document-2">Hedgerow dating in practice</a>.
        Field Studies 4.
      </li>
      <li>
        Coombe, R. &amp; Parr, H. (1968) Surviving elm boundaries. Rural
        Survey 12.
      </li>
      <li>
        Advisory Committee (1969) Revised Domin scale, second
        impression.
      </li>
    </ol>

    <h3>Recorder notes</h3>
    <p>
      Measurements were taken with a linen tape and recorded to the
      nearest decimetre. Where the tape sagged over gaps, the recording
      was repeated and the mean entered on the card.
    </p>
    <p class="viewer-imprint">
      Page 2 of 2 — select the text to confirm the effect leaves the
      content intact.
    </p>
  </article>
`;

/*
 * The viewer receives one continuous document and splits it into
 * pages at the book break markers. The ids "viewer-page-2" through
 * "viewer-page-4" live on the chapter headings so the fragment
 * links between the pages keep navigating the viewer; the cover is
 * the document element itself and keeps its own id.
 */
export const VIEWER_BOOK = `
  <article id="viewer-book" class="paper viewer-page viewer-page-cover cr-titlepage">
    <p class="paper-kicker cr-kicker">Annual Bulletin</p>
    <h1 class="cr-book-title">Reports of the<br />Ridgeline Survey</h1>
    <p class="cr-subtitle">Volume XII · 1968–1971</p>
    <p>
      Prepared for the
      <a href="#viewer-page-2">Advisory Committee on Rural Surveys</a>
    </p>
    <p class="viewer-imprint cr-imprint">The Field Station Press</p>

    <hr />

    <h2 id="viewer-page-2" class="cr-chapter-title">1 · Method</h2>
    <p>
      Plots were walked twice monthly between March and October.
      Observations were recorded on paper forms and transcribed during
      the winter months. Species coverage was estimated on the revised
      Domin scale.
    </p>
    <p>
      Hedgerow width was measured at the narrowest point between the
      hedgerow and the adjacent field margin, and hedgerow height was
      recorded as the mean of three measurements taken at evenly spaced
      intervals.
    </p>
    <h3>1.1 · Coverage</h3>
    <ul>
      <li>142 hedgerows across four parishes</li>
      <li>Two visits per season, five seasons</li>
      <li>Photographs archived at 600 dpi</li>
    </ul>
    <p>
      Where a hedgerow crossed a metalled road, the two halves were
      recorded as separate entries and cross-referenced in the parish
      index; the mean figures are set out in
      <a href="#viewer-page-3">Table 2</a>.
    </p>
    <p class="cr-folio"></p>

    <hr />

    <h2 id="viewer-page-3" class="cr-chapter-title">2 · Results</h2>
    <table>
      <caption>Table 2 — Mean species richness by parish</caption>
      <thead>
        <tr>
          <th scope="col">Parish</th>
          <th scope="col">Hedgerows</th>
          <th scope="col">Mean species</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Ashcombe</td><td>41</td><td>7.2</td></tr>
        <tr><td>Nettlebed</td><td>38</td><td>6.1</td></tr>
        <tr><td>Ockley</td><td>33</td><td>5.4</td></tr>
        <tr><td>Thurlow</td><td>30</td><td>8.0</td></tr>
      </tbody>
    </table>
    <figure class="paper-figure">
      <svg viewBox="0 0 320 160" role="img" aria-label="Bar chart of mean species richness by parish">
        <rect width="320" height="160" fill="#f5f3ee"></rect>
        <line x1="24" y1="136" x2="300" y2="136" stroke="#444" stroke-width="1.5"></line>
        <rect x="40" y="52" width="34" height="84" fill="#555"></rect>
        <rect x="100" y="66" width="34" height="70" fill="#555"></rect>
        <rect x="160" y="78" width="34" height="58" fill="#555"></rect>
        <rect x="220" y="40" width="34" height="96" fill="#555"></rect>
      </svg>
      <figcaption>
        Figure 2 — Mean species richness by parish, pooled seasons.
      </figcaption>
    </figure>

    <figure class="paper-figure">
      <canvas class="paper-canvas" width="640" height="360"></canvas>
      <figcaption>
        Figure 3 — Mean monthly temperature at the field station, 1969,
        drawn on a canvas element.
      </figcaption>
    </figure>

    <p>
      Species richness correlated most strongly with hedgerow age and
      least with altitude. Management frequency showed a weak negative
      relationship. The standard recording form is reproduced in the
      <a href="#viewer-page-4">appendix</a>.
    </p>
    <p class="cr-folio"></p>

    <hr />

    <h2 id="viewer-page-4" class="cr-chapter-title">Appendix · Form 3C</h2>
    <p>
      Standard field form used by recorders between 1968 and 1971,
      following the methods on
      <a href="#viewer-page-2">the method page</a>.
    </p>
    <form class="paper-form">
      <fieldset>
        <legend>Hedgerow record</legend>
        <label>Parish <input type="text" name="parish" value="Ashcombe" /></label>
        <label>Plot number <input type="number" name="plot" value="41" /></label>
        <label>
          Aspect
          <select name="aspect">
            <option>North</option>
            <option>East</option>
            <option>South</option>
            <option selected>West</option>
          </select>
        </label>
        <label class="paper-checkbox">
          <input type="checkbox" name="ditch" checked /> Adjacent ditch
          present
        </label>
        <label class="paper-checkbox">
          <input type="checkbox" name="remnant" /> Remnant hedge
        </label>
        <button type="button">File record</button>
      </fieldset>
    </form>
    <p class="viewer-imprint">
      Retain the original card. Duplicates were forwarded to the county
      office at the end of each season.
    </p>
    <p class="cr-folio"></p>
  </article>
`;

/*
 * The canvas figures are drawn at runtime with the Canvas 2D API.
 * The scan pipeline treats them like any other content, but the
 * show-through ghosts copy elements without their bitmap, so the
 * routine draws into every canvas that carries the figure class —
 * the source sheets and the ghost clones alike.
 */
const SAMPLE_TEMPERATURES = [
  4.2, 5.1, 8.3, 12.6, 16.9, 20.4, 22.8, 22.1, 18.5, 13.7, 8.9, 5.4,
];

export function drawSampleCanvasFigures(): void {
  for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
    "canvas.paper-canvas",
  )) {
    const context = canvas.getContext("2d");

    if (!context) {
      continue;
    }

    const ink = "#16150f";

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.save();

    context.scale(canvas.width / 320, canvas.height / 180);

    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(30, 150);
    context.lineTo(300, 150);
    context.stroke();

    context.beginPath();
    context.moveTo(30, 150);
    context.lineTo(30, 20);
    context.stroke();

    const points = SAMPLE_TEMPERATURES.map((temperature, index) => ({
      x: 30 + (index / (SAMPLE_TEMPERATURES.length - 1)) * 256,

      y: 150 - (temperature / 26) * 130,
    }));

    context.beginPath();

    for (const [index, point] of points.entries()) {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    }

    context.stroke();

    for (const point of points) {
      context.beginPath();
      context.arc(point.x, point.y, 3, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }
}
