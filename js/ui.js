// ui.js — panel drawer, icon strip, mode toggle, zoom, orbit/pan interaction

const UI = (() => {

  // ── Panel drawer ─────────────────────────────────────────
  const drawer    = document.getElementById('panel-drawer');
  const headTitle = document.getElementById('panel-head-title');

  const PANELS = {
    skeleton: { label: 'Skeleton',     content: 'content-skeleton' },
    scene:    { label: 'Scene',        content: 'content-scene'    },
    uv:       { label: 'UV Designer',  content: 'content-uv'       },
    draw:     { label: 'Draw',         content: 'content-draw'     },
    models:   { label: 'Load Model',   content: 'content-models'   },
  };

  let activePanel = null;
  let pinned      = false;

  function showContent(name) {
    Object.values(PANELS).forEach(p => {
      document.getElementById(p.content).style.display = 'none';
    });
    document.getElementById(PANELS[name].content).style.display = 'flex';
    headTitle.textContent = PANELS[name].label;
    if (name === 'uv') {
      setTimeout(() => {
        if (UV_DESIGNER) { UV_DESIGNER.resizePreview(); UV_DESIGNER.drawWire(); }
      }, 20);
    }
    if (name === 'draw') {
      setTimeout(() => {
        if (typeof DRAW !== 'undefined') { DRAW.resizePreview(); DRAW.drawWire(); }
      }, 20);
    }
    // Activate / deactivate 3D surface drawing
    if (typeof DRAW3D !== 'undefined') {
      DRAW3D.setActive(name === 'draw');
    }
    // Show Grab button only in Draw panel; hide + deactivate it elsewhere
    showGrabBtn(name === 'draw');
    // Reset canvas cursor when switching away from draw
    const canvas = document.getElementById('canvas');
    if (canvas && name !== 'draw') {
      canvas.style.cursor = 'grab';
    }
  }

  function openPanel(name) {
    activePanel = name;
    drawer.classList.add('open');
    showContent(name);
    document.querySelectorAll('.strip-btn[data-panel]').forEach(b => {
      b.classList.toggle('active', b.dataset.panel === name);
    });
  }

  function closePanel() {
    activePanel = null;
    drawer.classList.remove('open');
    document.querySelectorAll('.strip-btn[data-panel]').forEach(b => b.classList.remove('active'));
    if (typeof DRAW3D !== 'undefined') DRAW3D.setActive(false);
    // Always restore cursor to grab when panel closes
    const canvas = document.getElementById('canvas');
    if (canvas) canvas.style.cursor = 'grab';
    showGrabBtn(false);
  }

  document.querySelectorAll('.strip-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.panel;
      if (activePanel === name && !pinned) closePanel();
      else openPanel(name);
    });
  });

  // Pin
  const stripPin = document.getElementById('strip-pin');
  const pinTip   = document.getElementById('pin-tip');
  stripPin.addEventListener('click', () => {
    pinned = !pinned;
    stripPin.classList.toggle('active', pinned);
    pinTip.textContent = pinned ? 'Unpin panel' : 'Pin panel open';
  });

  // Drawer resize
  const drawerResize = document.getElementById('drawer-resize');
  let drawerDragging = false;
  drawerResize.addEventListener('mousedown', (e) => {
    drawerDragging = true;
    drawerResize.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!drawerDragging) return;
    drawer.style.width = Math.max(180, Math.min(480, e.clientX - 44)) + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (!drawerDragging) return;
    drawerDragging = false;
    drawerResize.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (UV_DESIGNER) UV_DESIGNER.resizePreview();
  });

  // ── Mode toggle ──────────────────────────────────────────
  let mode = 'orbit';

  function setMode(m) {
    mode = m;
    document.getElementById('btn-orbit').classList.toggle('active', m === 'orbit');
    document.getElementById('btn-pan').classList.toggle('active', m === 'pan');
    // Deactivate grab when switching to orbit/pan
    const grabBtn = document.getElementById('btn-grab');
    if (grabBtn) grabBtn.classList.remove('active');
    if (typeof DRAW3D !== 'undefined') DRAW3D.setGrabMode(false);
  }

  // Show/hide the Grab button and wire its toggle behaviour
  function showGrabBtn(visible) {
    const grabBtn = document.getElementById('btn-grab');
    if (!grabBtn) return;
    grabBtn.style.display = visible ? '' : 'none';
    if (!visible) {
      grabBtn.classList.remove('active');
      if (typeof DRAW3D !== 'undefined') DRAW3D.setGrabMode(false);
    }
  }

  // ── Camera interaction ───────────────────────────────────
  function initInteraction(sceneRef) {
    const canvas = sceneRef.canvas;
    let isDragging = false, lastX = 0, lastY = 0;

    canvas.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
    canvas.addEventListener('touchstart', e => { isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }, { passive: true });

    function onMove(cx, cy) {
      if (!isDragging) return;
      const dx = cx - lastX, dy = cy - lastY;
      lastX = cx; lastY = cy;
      if (mode === 'orbit') {
        sceneRef.setTheta(sceneRef.theta() - dx * 0.007);
        sceneRef.setPhi(Math.max(0.05, Math.min(Math.PI - 0.05, sceneRef.phi() + dy * 0.007)));
      } else {
        const camera = sceneRef.camera;
        const right  = new THREE.Vector3();
        right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
        const speed  = sceneRef.getRadius() * 0.001;
        sceneRef.getTarget().addScaledVector(right, -dx * speed);
        sceneRef.getTarget().addScaledVector(camera.up, dy * speed);
      }
      sceneRef.updateCamera();
    }

    canvas.addEventListener('mousemove',  e => onMove(e.clientX, e.clientY));
    canvas.addEventListener('touchmove',  e => { if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });

    const endDrag = () => { isDragging = false; };
    canvas.addEventListener('mouseup',    endDrag);
    canvas.addEventListener('mouseleave', endDrag);
    canvas.addEventListener('touchend',   endDrag);

    canvas.addEventListener('wheel', e => { sceneRef.zoomBy(e.deltaY * 0.001); e.preventDefault(); }, { passive: false });

    // Pinch zoom
    let lastPinch = null;
    canvas.addEventListener('touchstart', e => { if (e.touches.length === 2) lastPinch = null; }, { passive: true });
    canvas.addEventListener('touchmove',  e => {
      if (e.touches.length !== 2) return;
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (lastPinch !== null) sceneRef.zoomBy((lastPinch - dist) * 0.003);
      lastPinch = dist;
    }, { passive: true });

    // Zoom buttons
    let zoomTimer = null;
    function startZoom(d) { sceneRef.zoomBy(d); zoomTimer = setInterval(() => sceneRef.zoomBy(d), 60); }
    function stopZoom()    { clearInterval(zoomTimer); }
    document.getElementById('z-in').addEventListener('mousedown',  () => startZoom(-0.04));
    document.getElementById('z-out').addEventListener('mousedown', () => startZoom(0.04));
    ['mouseup','mouseleave'].forEach(ev => {
      document.getElementById('z-in').addEventListener(ev,  stopZoom);
      document.getElementById('z-out').addEventListener(ev, stopZoom);
    });
    document.getElementById('z-in').addEventListener('click',  () => sceneRef.zoomBy(-0.06));
    document.getElementById('z-out').addEventListener('click', () => sceneRef.zoomBy(0.06));
  }

  // ── Hint auto-hide ───────────────────────────────────────
  function initHint(canvas) {
    const hint = document.getElementById('hint');
    setTimeout(() => { hint.style.opacity = '0'; }, 5000);
    canvas.addEventListener('mousedown', () => { hint.style.opacity = '0'; });
  }

  return { setMode, initInteraction, initHint };
})();

// Expose setMode globally for inline onclick in HTML
window.setMode = UI.setMode;

// Expose grab toggle globally for the Grab button onclick
window.setDrawGrab = function() {
  const grabBtn = document.getElementById('btn-grab');
  if (!grabBtn) return;
  const isNowActive = !grabBtn.classList.contains('active');
  grabBtn.classList.toggle('active', isNowActive);
  if (typeof DRAW3D !== 'undefined') DRAW3D.setGrabMode(isNowActive);
  // Update main canvas cursor
  const canvas = document.getElementById('canvas');
  if (canvas) canvas.style.cursor = isNowActive ? 'grab' : 'crosshair';
};