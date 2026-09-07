# tdorffer.com

Personal site: a landing page and five ML demos that run in the browser. Static files, no build step, no framework.

## Layout

```
index.html              landing page
css/main.css            landing page styles
css/demo.css            shared styles for the demo pages
js/hero.js              the heart in the hero (three.js, its own WebGL context)
js/scenes.js            the five demo previews on the landing page (one shared WebGL context)
js/main.js              module entry: one render loop for the hero and the previews
js/site.js              smooth scroll, nav, reveals, scroll-linked motion (plain script)
js/sky.js               the occasional light across the background (meteor / ecg / glint)
js/backdrop.js          the faint layer that keeps the dark from reading flat
heart.bin               the heart surface, ~40k triangles, quantised (see below)
tools/heartmesh.py      makes heart.bin from a tetrahedral cardiac mesh
fonts/                  Bricolage Grotesque (display) and Source Serif 4 (text), self-hosted
projects/
  pinn-playground/      PINN for 1D Burgers, trained live with TensorFlow.js
  rag-scientific-ml/    BM25 retrieval over 24 chunks, optional LLM for the answer
  fno-vs-solver/        Cole-Hopf operator vs. a finite-difference solver
  fluid-playground/     Stam's stable fluids in plain JS
  optimizer-race/       SGD, momentum, RMSProp and Adam on a 3D loss surface
me.jpg, og.jpg, cv.pdf
```

## Running it locally

Any static server works. The RAG demo fetches `corpus.json`, which browsers block on `file://`, so don't just double-click `index.html`.

```
python -m http.server 5173
```

Then open http://localhost:5173.

## Deploying

Cloudflare Pages, connected to this repo: production branch `main`, no build command, output directory `/`. A push to `main` is live in about half a minute.

## The heart in the hero

A real one. `heart.bin` is the surface of the *average* four-chamber heart from Rodero et al. 2021, "Linking statistical shape models and simulated function in the healthy adult human heart" (Zenodo record 4593738, CC BY 4.0): a tetrahedral simulation mesh built from CT scans of healthy adults. `tools/heartmesh.py` reads the legacy VTK (or CARP `.pts/.elem`), keeps the faces that belong to a single tetrahedron (the boundary), orients them outward, carries the region tags through a quadric decimation to ~40k triangles, and writes a small binary with 16-bit positions. In the page the regions are tinted (chambers, arteries, veins, valves), the mesh is lit as a solid with its own wireframe faintly over it, and the beat is a global contraction paced by clicking. Attribution is in the footer; keep it if you keep the mesh.

To rebuild it: download `average.tar.gz` from the record, extract, then

```
pip install numpy fast-simplification
python tools/heartmesh.py average.vtk heart.bin 40000
```

`?yaw=&tilt=&rx=` on the URL override the resting orientation while tuning.

## What fills the dark

A flat near-black page reads as empty, so two layers sit over it, both fixed and both blended so they only lift the black and leave near-white text alone (this is also the only way to sit above `.sheet`, which is opaque so it can slide over the hero).

`data-backdrop` on `<body>` picks the pattern, `?bg=` previews another:

- `contours` (default) iso-lines of a slowly morphing scalar field, drawn with marching squares. Scrolls at its own rate, so new contours keep arriving.
- `points` a sparse scatter of sample points at three depths, each parallaxing differently.
- `wash` broad, barely-there variation in the lighting, so the black is not one flat value across the screen.
- `off` nothing.

`data-grain="on"` adds film grain on top: one fixed tiled `feTurbulence` layer as a data URI, no image request. This is the recipe from illoca.unseen.co (Awwwards Site of the Day, Sep 2026), which does the same thing with a tiled JPEG at `opacity:.2` and `mix-blend-mode:overlay`; on a dark ground the noise is desaturated and kept at ~5% instead. `?grain=off` turns it off.

## The light in the background

A few seconds after load and then every 16–30 seconds, something crosses the dark: `data-sky` on `<body>` picks which. The default `ecg` is a heartbeat trace that draws itself across and fades; `meteor` is a thin warm streak that flies and burns out; `glint` a distant point that brightens with a soft flare and dies; `off` nothing. `?sky=meteor` on the URL previews another; `window.__sky.fire()` in the console triggers one. The canvas is blended with `screen`, so the light passes behind white text. The canvas is fixed but each event is anchored to the page at the scroll position it started from, so it stays over the content and scrolls away rather than riding along with the viewport. Off under `prefers-reduced-motion`.

## Scroll behaviour

Lenis (from jsdelivr) smooths wheel scrolling; if it fails to load the page falls back to native smooth scrolling. The hero is `position: sticky` on desktop so the rest of the page slides over it as a sheet while the heart drifts off and fades. Headings reveal word by word through overflow masks, demo previews clip-reveal, the section label in the left column is sticky, and the lead paragraph in About lights up word by word as you read down. All of it is in `js/site.js` and switched off under `prefers-reduced-motion`.

## Notes

- The demo pages keep a few numbers in `localStorage` (last measured speed-up, best PINN loss, fluid frame rate) and the landing page shows them on the matching card, so a returning visitor sees their own results.
- The RAG demo's API key also lives in `localStorage` and is only ever sent to the endpoint you configure.
- `og.jpg` is rendered from `_og.html`; regenerate it after changing the hero.
