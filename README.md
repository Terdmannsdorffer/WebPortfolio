# tdorffer.com

Personal site: a landing page and five ML demos that run in the browser. Static files, no build step, no framework.

## Layout

```
index.html              landing page
css/main.css            landing page styles
css/demo.css            shared styles for the demo pages
js/main.js              module entry: one render loop for everything that moves
js/figure.js            the heart on the stage: the beat, the fibres, the scan plane (its own WebGL context)
js/chapters.js          four demo chapters drawn in plain 2D canvas, each running its demo's own physics
js/scenes.js            the optimizer chapter, through one shared WebGL context
js/site.js              smooth scroll, nav, heading reveals, the stage's scroll state (plain script)
heart.bin               the heart's surface, ~40k triangles, with ventricular coordinates per vertex
fibres.bin              1,154 streamlines of the heart's fibre field
tools/heartfibres.py    makes heart.bin and fibres.bin from the Rodero et al. mesh
media/                  the cine MRI loop and two engravings used in Research
fonts/                  Bricolage Grotesque (display) and Source Serif 4 (text), self-hosted
projects/
  pinn-playground/      PINN for 1D Burgers, trained live with TensorFlow.js
  rag-scientific-ml/    BM25 retrieval over 24 chunks, optional LLM for the answer
  fno-vs-solver/        Cole-Hopf operator vs. a finite-difference solver
  fluid-playground/     Stam's stable fluids in plain JS
  optimizer-race/       SGD, momentum, RMSProp and Adam on a 3D loss surface
me.jpg, og.jpg, cv.pdf
_og.html                renders og.jpg (screenshot .card at 1200x630 once the fibres have loaded)
```

## Running it locally

Any static server works. The RAG demo and the landing page fetch `corpus.json`, which browsers block on `file://`, so don't just double-click `index.html`.

```
python -m http.server 5173
```

Then open http://localhost:5173.

## Deploying

Cloudflare Pages, connected to this repo: production branch `main`, no build command, output directory `/`. A push to `main` is live in about half a minute.

## The page

A split stage. The heart is pinned on the right half for the whole visit; the left half is a reading column. The demos break the split and run full width over it, and the page ends on a red field with the name set across its whole width. Below 900px the stage moves to the top half of the screen and lets go after Research.

The scroll has one idea: in Research, a scan plane square to the heart's long axis rises from the apex, and below it the muscle is shown as its own fibre field. `STATES` in `js/figure.js` holds the four states (the organ, half muscle and half fibres, the fibres alone, the organ again from the left); `js/site.js` turns the scroll position into a progress between them and publishes it on `window.__stage`, and the figure eases toward it every frame.

Only headings move as they arrive (a masked line rise, once). Body text, figures and lists are simply there.

## The heart

A real one. `heart.bin` is the surface of the *average* four-chamber heart from Rodero et al. 2021, "Linking statistical shape models and simulated function in the healthy adult human heart" (Zenodo record 4593739, CC BY 4.0): a tetrahedral mesh built from CT scans of healthy adults for electro-mechanics simulations. Because it was built for simulation it carries more than its shape: a rule-based fibre direction per element and universal ventricular coordinates per point (Z from apex to base, RHO from the inner wall to the outer one). `tools/heartfibres.py` keeps all of it:

- the boundary surface, oriented outward and decimated to ~40k triangles, with each vertex's region, Z, RHO and an activation time, plus the long axis;
- streamlines traced through the ventricular wall along the fibre field (vectorised RK2, 0.55 mm steps, stopping where they leave the wall or kink), seeded evenly through the wall's thickness, so every layer of the helix shows.

The beat is a kinematic model in the vertex shader, not a simulation, but every term is something a ventricle does: an activation front runs from the apical endocardium up and out (it lights the surface as it passes), then the base pulls toward the apex by 13% of the long axis, the wall thickens inward (more inside than out), and apex and base twist in opposite directions, the wringing of systole. The atria squeeze first, and everything above the valve plane is carried by it. Clicking the stage raises the pace from 52 to 112 bpm, decaying over 4.5 s.

To rebuild the data: download `average.tar.gz` from the record, extract, then

```
pip install numpy scipy fast-simplification
python tools/heartfibres.py average.vtk . 40000 1200
```

`?yaw=&tilt=&rx=` on the URL override the resting orientation while tuning; `?wire=0` drops the faint wireframe pass.

## The demo chapters

Each chapter's background is its demo's own physics, not an illustration of it:

- PINN Playground: the exact viscous Burgers solution (Cole-Hopf transform, nu = 0.008) the network is trained toward, sampled at 4,600 random collocation points and swept through time, with the slice u(x, t) drawn at the sweep.
- Ask Research: the 24 passages as a wall of text; the demo's own tokenizer and BM25 (same boosts) run on four of the demo's suggested questions and light up what they retrieve.
- FNO vs. Solver: the demo's finite-difference solver marching step by step against the Cole-Hopf operator answering in one call.
- Fluid Playground: Stam's stable fluids on a 128x128 grid, stirred by two slow emitters and by dragging.
- Optimizer Race: the demo's bumpy bowl with its four optimizers, same update rules, same start.

A returning visitor sees their own numbers from the demos under the matching chapter (the demos keep them in `localStorage` under `demoStats`).

## Keeping it smooth

- Chapters build one screen early and run only while on screen. The PINN and RAG chapters are capped at 30 fps; they change slowly and were the two most expensive per frame.
- The heart stops rendering while the demos or the closing scene cover the stage.
- Two WebGL contexts in total: the stage, and the shared renderer in `scenes.js`. `fibres.bin` is fetched after first paint.
- Measured on an RTX 3090 at 1440x900: 4.2 ms per frame on the stage and most chapters; PINN and RAG were 8.3 and 12.4 ms before the 30 fps cap.
- `?fx=off` turns off WebGL and the chapters in one go, `?grain=off` the film grain.

## Motion and accessibility

Under `prefers-reduced-motion` nothing moves: the heart is still, the scroll states snap, the chapters draw one frame and the MRI shows its poster. "Pause the motion" in the stage's caption stops everything that moves by itself for anyone, and the scroll still turns the stage's states, so the figure always matches the text beside it.

## Credits and licences

- Heart mesh and fibres: Rodero et al. 2021, Zenodo 4593739, CC BY 4.0.
- Cine MRI, four-chamber view: Doregan, Wikimedia Commons, CC BY-SA 4.0 (re-encoded from GIF to MP4).
- Engravings: Richard Lower, Tractatus de Corde, 1669, Wellcome Collection, CC BY 4.0; James Bell Pettigrew, 1860, public domain.

Attribution is in the footer; keep it if you keep the pictures and the mesh.

## Notes

- The RAG demo's API key lives in `localStorage` and is only ever sent to the endpoint you configure.
- `og.jpg` is rendered from `_og.html`; regenerate it after changing the stage.
