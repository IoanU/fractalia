# Fractalia: Deep-Zoom Rendering of Composable Fractals

The [technical article (PDF)](fractalia-deep-zoom-rendering.pdf) derives the orbit maps, perturbation recurrences, approximation conditions and arithmetic work model, and includes the complete catalog table. The [prior-art review](literature-review.md) records the searches, closest precedents, evidence limits and candidate contributions.

Compile the report from the project root with Tectonic:

~~~sh
tectonic docs/fractalia-deep-zoom-rendering.tex
~~~

The [LaTeX source](fractalia-deep-zoom-rendering.tex) also builds with XeLaTeX. Repeat compilation until citations, references and the contents page stabilize.

The operation counts and the frame timings are different kinds of evidence. To regenerate the fixed-budget cost tables and replay a saved view:

~~~sh
node scripts/fractal-cost-model.mjs --csv
node scripts/fractal-cost-model.mjs --decades
node scripts/benchmark-paper.mjs mini12 3
~~~

The [cost script](../scripts/fractal-cost-model.mjs) enumerates the 52 presets and the mixed Warp recipe. The [benchmark runner](../scripts/benchmark-paper.mjs) uses the [archived views and measurements](data/). Timings depend on the viewport, numerical route, orbit lengths, fallback rates and environment.
