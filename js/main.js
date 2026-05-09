// main.js — entry point: loads loaders then wires SCENE → SKELETON, UV_DESIGNER, SCENE_CONTROLS, UI

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

Promise.all([
  loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'),
  loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js'),
]).then(start).catch(start);

// Shared overlay reference — set once, re-used on model swap
let _overlay = null;

function start() {
  // Initialise UI interaction (orbit/pan/zoom/touch)
  UI.initInteraction(SCENE);
  UI.initHint(SCENE.canvas);

  // Expose resetCamera globally for onclick in HTML
  window.resetCamera = SCENE.resetCamera;

  // Bind scene panel sliders
  SCENE_CONTROLS.init(
    SCENE.renderer,
    SCENE.scene,
    SCENE.lights
  );

  // Init model loader panel (drop zone, history, etc.)
  if (typeof MODEL_LOADER !== 'undefined') {
    MODEL_LOADER.init();
    MODEL_LOADER.setSwapCallback(swapModel);
  }

  // Load the default 3D model
  SCENE.loadModel((model, gltf) => {
    _wireModel(model, gltf, true);
  });
}

// ── Wire a (new) model into all subsystems ──────────────────
function _wireModel(model, gltf, isFirst) {

  // Remove previous model from scene (but keep lights, shadow plane, etc.)
  if (!isFirst) {
    // Only remove Groups (loaded models are typically Groups) and
    // top-level Meshes that aren't the shadow plane
    const toRemove = SCENE.scene.children.filter(c =>
      c.isGroup || (c.isMesh && c.material && !(c.material instanceof THREE.ShadowMaterial))
    );
    toRemove.forEach(c => SCENE.scene.remove(c));
  }

  if (!isFirst) {
    // Re-add and fit the new model (reuse SCENE.loadModel logic inline)
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.0 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));

    model.traverse(n => {
      if (!n.isMesh) return;
      n.castShadow = true; n.receiveShadow = true;
    });

    SCENE.scene.add(model);

    // Force matrix update so raycasting works immediately after swap
    model.updateMatrixWorld(true);

    const box2 = new THREE.Box3().setFromObject(model);
    const size2 = box2.getSize(new THREE.Vector3());
    const center2 = box2.getCenter(new THREE.Vector3());
    SCENE.getTarget().copy(center2);
    SCENE.setRadius(size2.length() * 1.1);
    SCENE.updateCamera();

    let tris = 0;
    model.traverse(n => {
      if (n.isMesh && n.geometry.index) tris += n.geometry.index.count / 3;
      else if (n.isMesh && n.geometry.attributes.position) tris += n.geometry.attributes.position.count / 3;
    });
    document.getElementById('poly-count').textContent = Math.round(tris).toLocaleString() + ' tris';
  }

  // Skeleton controls (re-init on swap)
  SKELETON.init(model);

  // Mehendi overlay — only created once; re-applied to new model's materials
  if (isFirst) {
    _overlay = SCENE.setupMehendiOverlay(model);

    SCENE_CONTROLS.initDesignControls(
      () => _overlay.setOpacity,
      () => _overlay.setColor
    );

    UV_DESIGNER.init(_overlay.ctx, () => {
      _overlay.texture.needsUpdate = true;
    });

    if (typeof DRAW !== 'undefined') {
      DRAW.init(
        _overlay.ctx,
        () => UV_DESIGNER.composite(),
        []
      );

      UV_DESIGNER.setDrawOverlay(DRAW.getDrawCtx1024());

      DRAW3D.init(
        DRAW.getDrawCtx1024(),
        () => UV_DESIGNER.composite(),
        SCENE,
        model
      );

      document.getElementById('draw-wire-check').addEventListener('change', (e) => {
        const edges = SCENE.extractUVEdges(model);
        DRAW.setEdges(e.target.checked ? edges : []);
        DRAW.drawWire();
      });
    }
  } else {
    // On model swap: re-apply overlay texture to new model's materials
    _reapplyOverlay(model, _overlay.texture);

    // Update DRAW3D model reference so raycasting targets the new model
    if (typeof DRAW3D !== 'undefined') {
      DRAW3D.init(
        DRAW.getDrawCtx1024(),
        () => UV_DESIGNER.composite(),
        SCENE,
        model
      );
    }

    // Clear all draw strokes and reset undo/redo history for the new model
    if (typeof DRAW !== 'undefined') {
      DRAW.clearAll();
    }

    // Clear all UV Designer layers for the new model
    UV_DESIGNER.clearLayers();
  }

  // Extract UV edges for both UV Designer and Draw panels
  const edges = SCENE.extractUVEdges(model);
  UV_DESIGNER.setEdges(edges);
  if (typeof DRAW !== 'undefined') {
    DRAW.setEdges(edges);
    DRAW.drawWire();
  }

  // Clear the shared scene texture and trigger a full composite so
  // UV Designer layers + (now-empty) draw canvas are merged correctly
  _overlay.ctx.clearRect(0, 0, 1024, 1024);
  UV_DESIGNER.composite(); // re-merges layers → texture, triggers needsUpdate
}

// ── Re-apply the shared mehendi CanvasTexture to a new model ─
function _reapplyOverlay(model, mehendiTex) {
  const mehendiUniforms = [];
  model.traverse(n => {
    if (!n.isMesh) return;
    const origMat = n.material; if (!origMat) return;
    const mat = origMat.clone();
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.mehendiMap     = { value: mehendiTex };
      shader.uniforms.mehendiOpacity = { value: 1.0 };
      shader.uniforms.mehendiColor   = { value: new THREE.Color(0x000000) };
      mehendiUniforms.push(shader.uniforms);
      shader.fragmentShader = `uniform sampler2D mehendiMap;\nuniform float mehendiOpacity;\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <dithering_fragment>`,
        `#include <dithering_fragment>
        vec4 mehendiSample = texture2D(mehendiMap, vUv);
        float blendA = mehendiSample.a * mehendiOpacity;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mehendiSample.rgb, blendA);`
      );
    };
    mat.needsUpdate = true;
    n.material = mat;
  });
  // Update overlay setOpacity/setColor to point to new uniforms
  _overlay.setOpacity = (v) => mehendiUniforms.forEach(u => { u.mehendiOpacity.value = v; });
  _overlay.setColor   = (c) => mehendiUniforms.forEach(u => { u.mehendiColor.value = c; });
}

// ── Called by MODEL_LOADER when a new model is ready ─────────
function swapModel(model, gltf) {
  _wireModel(model, gltf, false);
}
