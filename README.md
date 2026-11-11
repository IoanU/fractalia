# Fractalia

A static fractal explorer. All computation runs in the browser; no backend, API keys, npm dependencies, or build step are required.

**[Open the app](https://ioanu.github.io/fractalia/)**

## Features

- Mandelbrot, Julia, and Burning Ship fractals.
- Rectangle selection zoom, panning, exact coordinate entry, and keyboard controls.
- Adaptive iteration counts and decimal coordinates whose precision grows with zoom.
- Fullscreen-resolution rendering and a bounded memory cache. Fullscreen changes reuse the existing image.
- Palettes and phase changes recolor cached escape values without repeating fractal iterations.
- PNG export, URL-based views, refresh persistence, and a local saved-view library.

Deep zoom is limited in practice by memory, rendering time, and the chosen iteration count. Cache data is kept in memory for the current tab. Saved views use browser local storage.

## Run locally

Install Node.js 22 or newer, then run:

```sh
npm start
```

Open [localhost:4173/fractalia/](http://127.0.0.1:4173/fractalia/). This path also checks compatibility with a GitHub Pages project site. No `npm install` is needed.

```sh
npm test
```

Tests cover fractal math, arbitrary precision, selection, disabled wheel/pinch zoom, refresh persistence, fullscreen caching, recoloring, and stale-worker isolation.

## Deploy with GitHub Pages

In the repository, go to **Settings → Pages → Source** and select **GitHub Actions**. The included [Pages workflow](.github/workflows/pages.yml) runs checks and publishes `dist/` after a push to `main`. Pull requests run the checks without publishing. You can also run the workflow manually from the **Actions** tab.

The site uses relative asset URLs, including module worker imports, so it runs under `/fractalia/` without a base-path build setting. The workflow follows [GitHub's custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Files

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/style.css` | Interface |
| `dist/app.js` | Controls, state, display, and export |
| `dist/worker.js`, `dist/math.js` | Escape-value computation and precision |
| `dist/colorize.js` | Palette conversion |
| `dist/render-cache.js` | Cached fields and fullscreen raster geometry |
| `dist/selection.js` | Rectangle zoom geometry |
| `verify*.mjs` | Regression checks |

This repository is standalone. It contains no hosting-platform credentials or access configuration. On GitHub Pages, the app is publicly accessible and does not require a ChatGPT login. Browser-local saved views from another domain do not automatically move to this domain; a shared view URL's `#view=...` fragment can be appended to the new site URL.
