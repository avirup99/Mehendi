# Mehendi Viewer

A 3D hand viewer with skeleton controls, scene lighting, and UV mehendi designer.

## Setup

1. Place your `hand.glb` file inside the `assets/` folder.
2. Run a local server (required — the `.glb` won't load over `file://`):

```bash
npm run serve
```

Then open `http://localhost:3000` in your browser.

## Deploy

Drag and drop the entire folder onto [Netlify](https://netlify.com) or run:

```bash
npx vercel
```

That's it. Visitors open the URL and the model streams from the server — nothing needs to be installed locally.

## File structure

```
mehendi-viewer/
├── index.html              # HTML structure
├── style.css               # All UI styles
├── package.json
├── README.md
├── js/
│   ├── main.js             # Entry point — wires everything together
│   ├── scene.js            # Three.js renderer, camera, lights, model loader
│   ├── skeleton.js         # Bone discovery and rotation controls
│   ├── uv-designer.js      # UV canvas, layers, compositing
│   ├── ui.js               # Panel drawer, orbit/pan/zoom interaction
│   └── scene-controls.js   # Scene panel sliders (lights, exposure)
└── assets/
    └── hand.glb            # ← put your model here
```

## Panels

- **Skeleton** — select and rotate individual bones
- **Scene** — adjust background colour, exposure, and light settings
- **UV Designer** — upload mehendi pattern images and position them on the UV map
