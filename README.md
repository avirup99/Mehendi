# ✦ Mehendi 3D Viewer

A browser-based 3D hand viewer and mehendi design tool. Load any hand model, paint patterns directly onto the 3D surface or UV map, pose individual finger bones, and control lighting — all in real time, no installation required.

![Three.js](https://img.shields.io/badge/Three.js-r128-black?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/JS-Vanilla-f0db4f?style=flat-square)
![No build step](https://img.shields.io/badge/Build-None-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## Features

- **3D Viewport** — orbit, pan, and zoom a GLB/GLTF hand model with realistic lighting and shadows
- **Draw Panel** — freehand paint on the UV map or directly on the 3D surface with five pen types: Brush, Ink Pen, Spray, Marker, Calligraphy
- **UV Designer** — upload mehendi pattern images, position/scale/rotate them on the UV map, stack multiple layers with opacity and tint controls
- **Skeleton Panel** — select and rotate individual finger bones via a 2D diagram or searchable bone list; multi-select supported
- **Scene Panel** — adjust background color, exposure, key/fill/ambient lights in real time
- **Model Loader** — drag-and-drop any `.glb` or `.gltf` file to hot-swap the model; recent model history is kept in session
- **Undo / Redo** — full undo/redo stack for draw strokes (up to 30 steps)
- **Touch support** — pinch-to-zoom, single-finger orbit and pan on mobile

---


## Getting Started

### Run locally

No build step or npm install required.

```bash
# Clone the repo
git clone https://github.com/your-username/mehendi-viewer.git
cd mehendi-viewer

# Serve it (any static server works)
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:3000` (or `8080`) in your browser.

> **Note:** You must use a local server — opening `index.html` directly as a `file://` URL will fail due to browser CORS restrictions on loading `.glb` files.

### Your own model

Drag any `.glb` or `.gltf` file onto the **Load Model** panel (cube icon in the sidebar). The model is hot-swapped in place; all designs and strokes reset for the new model.

---

## Deploying

go to https://dancing-fudge-67a568.netlify.app/


## Optimising the GLB

If your model file is large, compress it before deploying:

- **[gltf.report](https://gltf.report)** — drag and drop, gives you Draco-compressed output instantly
- **Blender** — export with Draco compression enabled under the GLTF export settings

The loader already includes `DRACOLoader`, so compressed files work out of the box.

---

## Tech Stack

| What | How |
|---|---|
| 3D rendering | [Three.js r128](https://threejs.org) |
| Model format | GLTF / GLB (with optional Draco compression) |
| Drawing | HTML5 Canvas 2D API |
| Styling | Plain CSS with custom properties |
| Scripts | Vanilla JS — no framework, no bundler |
| Fonts | DM Mono, DM Sans (Google Fonts) |

---

## Browser Support

Works in any modern browser with WebGL support.

| Browser | Support |
|---|---|
| Chrome / Edge | ✅ Full |
| Firefox | ✅ Full |
| Safari (macOS / iOS) | ✅ Full |
| Mobile Chrome / Safari | ✅ Touch controls included |

---

## Known Limitations

- Draw strokes and UV layers are session-only — they are not saved when you close the tab. Export functionality is not yet implemented.
- UV wireframe overlay accuracy depends on the model's UV layout; some models may have overlapping or non-standard UVs.
- Skeleton posing works best on skinned meshes with named bones. Static meshes without a skeleton will show no bones.

---

## License

MIT — do whatever you like with it.
