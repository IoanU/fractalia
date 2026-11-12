# Fractalia

Fractalia is a browser-based fractal explorer. Choose a preset, zoom into a region, or build a fractal by combining formulas in Formula Studio. Rendering runs entirely in your browser.

**[Open Fractalia](https://ioanu.github.io/fractalia/)**

## Explore

- Browse 52 presets with thumbnails, including Mandelbrot, Julia, Burning Ship, Multibrot, Tricorn, Phoenix, Newton, Nova, and Lyapunov.
- Turn on **Drag + scroll** to pan by dragging and zoom toward the pointer with the wheel. Newly exposed areas show a blurred preview while they render. Turn it off to draw a rectangle to zoom. Arrow keys, exact coordinates, and the **?** shortcuts menu are always available.
- Adjust the palette, color phase, and iteration count. Fullscreen reuses the rendered image, and panning can reuse overlapping pixels.
- Export a PNG, copy a shareable link, or save the current view to your browser's Library.

## Formula Studio

Combine 24 formulas in a repeating sequence of up to eight steps. Each step can have its own repeat count, Julia constant, and Drift settings. Drift varies the parameter during iteration. Choose escape or convergence coloring, a ring or cross orbit trap, or switch to Lyapunov mode and edit its A/B sequence.

**Shuffle** generates a combination and previews it before you apply it. Shared links and saved views include the formula settings.

All formulas increase numerical precision as you zoom. Deep renders can reuse high-precision reference orbits for nearby pixels, including in custom Studio sequences. Where the faster calculation becomes uncertain, the renderer evaluates those pixels directly at higher precision. The Library stores saved views in the current browser.

## Technical notes

[Fractalia: Deep-Zoom Rendering of Composable Fractals](docs/fractalia-deep-zoom-rendering.pdf) derives the formulas and optimizations, documents how Formula Studio combines them, and gives reproducible cost calculations for all 52 presets. See the [LaTeX source](docs/fractalia-deep-zoom-rendering.tex), [report guide](docs/fractalia-deep-zoom-rendering.md), and [prior-art review](docs/literature-review.md).

Compile the LaTeX source with `tectonic docs/fractalia-deep-zoom-rendering.tex` or run XeLaTeX twice to resolve the table of contents, references, and citations.
