# Fractalia

Fractalia is a browser-based fractal explorer. Choose a preset, zoom into a region, or build a fractal by combining formulas in Formula Studio. Rendering runs entirely in your browser.

**[Open Fractalia](https://ioanu.github.io/fractalia/)**

## Explore

- Browse 52 presets with thumbnails, including Mandelbrot, Julia, Burning Ship, Multibrot, Tricorn, Phoenix, Newton, Nova, and Lyapunov.
- Draw a rectangle to zoom, pan with the mouse or arrow keys, and enter exact coordinates. The **?** menu lists keyboard shortcuts.
- Adjust the palette, color phase, and iteration count. Fullscreen reuses the rendered image, and panning can reuse overlapping pixels.
- Export a PNG, copy a shareable link, or save the current view to your browser's Library.

## Formula Studio

Combine 24 formulas in a repeating sequence of up to eight steps. Each step can have its own repeat count, Julia constant, and Drift settings. Drift varies the parameter during iteration. Choose escape or convergence coloring, a ring or cross orbit trap, or switch to Lyapunov mode and edit its A/B sequence.

**Shuffle** generates a combination and previews it before you apply it. Shared links and saved views include the formula settings.

All formulas increase numerical precision as you zoom. Deep renders can reuse high-precision reference orbits for nearby pixels, including in custom Studio sequences. Where the faster calculation becomes uncertain, the renderer evaluates those pixels directly at higher precision. The Library stores saved views in the current browser.
