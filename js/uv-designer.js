// uv-designer.js — UV canvas, layer management, compositing, upload history
// Interactive handles: drag body=move, corner circle=scale, top circle=rotate
// Isolation: composite() merges UV layers first, then stamps the Draw overlay
// on top, so clearing Draw strokes never destroys UV Designer content.

const UV_DESIGNER = (() => {
  const previewCanvas = document.getElementById('uv-canvas');
  const previewCtx    = previewCanvas.getContext('2d');
  const wireCanvas    = document.getElementById('uv-wire-canvas');
  const wireCtx       = wireCanvas.getContext('2d');

  let uvEdges       = [];
  let uvLayers      = [];
  let activeIdx     = -1;
  let layerCounter  = 0;
  let wireVisible   = true;
  let uploadHistory = [];
  let onComposite   = null;

  // The shared scene-texture canvas context (1024×1024) passed from main.js
  let _sceneCtx1024 = null;
  // DRAW's private canvas — stamped on top of UV layers each composite
  let _drawOverlayCtx = null;

  const MAX_HIST = 20;

  // ── Handle interaction state ─────────────────────────────
  let handleState = null;
  let _rafPending = false;

  // ── Resize ───────────────────────────────────────────────
  function resizePreview() {
    const wrap = document.getElementById('uv-canvas-wrap');
    const s = wrap.clientWidth;
    previewCanvas.width = s; previewCanvas.height = s;
    wireCanvas.width    = s; wireCanvas.height    = s;
    drawWire();
    drawPreview();
  }
  new ResizeObserver(resizePreview).observe(document.getElementById('uv-canvas-wrap'));

  // ── UV Wire ──────────────────────────────────────────────
  function drawWire() {
    const s = wireCanvas.width || 1;
    wireCtx.clearRect(0, 0, s, s);
    if (!wireVisible || !uvEdges.length) return;
    wireCtx.save();
    wireCtx.strokeStyle = 'rgba(20,100,220,0.45)';
    wireCtx.lineWidth = 0.5;
    wireCtx.beginPath();
    uvEdges.forEach(([u0,v0,u1,v1]) => {
      wireCtx.moveTo(u0 * s, (1 - v0) * s);
      wireCtx.lineTo(u1 * s, (1 - v1) * s);
    });
    wireCtx.stroke();
    wireCtx.restore();
  }

  // ── Compute layer bounding box in canvas px ───────────────
  function layerBounds(layer, s) {
    const cx = layer.x * s;
    const cy = (1 - layer.y) * s;
    const hw = layer.scale * (s / 2);
    const hh = layer.img ? (layer.img.naturalHeight / layer.img.naturalWidth) * hw : hw;
    return { cx, cy, hw, hh };
  }

  // ── Draw handles for active layer ─────────────────────────
  function drawHandles(layer, s) {
    if (!layer || !layer.img) return;
    const { cx, cy, hw, hh } = layerBounds(layer, s);
    const rot = layer.rot * Math.PI / 180;

    previewCtx.save();
    previewCtx.translate(cx, cy);
    previewCtx.rotate(rot);

    previewCtx.strokeStyle = 'rgba(10,10,10,0.75)';
    previewCtx.lineWidth = 1.5;
    previewCtx.setLineDash([4, 3]);
    previewCtx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    previewCtx.setLineDash([]);

    const corners = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
    corners.forEach(([x, y]) => {
      previewCtx.beginPath();
      previewCtx.arc(x, y, 7, 0, Math.PI * 2);
      previewCtx.fillStyle = '#fff';
      previewCtx.fill();
      previewCtx.strokeStyle = '#0a0a0a';
      previewCtx.lineWidth = 1.5;
      previewCtx.stroke();
    });

    const rotHandleY = -hh - 22;
    previewCtx.beginPath();
    previewCtx.moveTo(0, -hh);
    previewCtx.lineTo(0, rotHandleY + 7);
    previewCtx.strokeStyle = 'rgba(10,10,10,0.5)';
    previewCtx.lineWidth = 1;
    previewCtx.stroke();
    previewCtx.beginPath();
    previewCtx.arc(0, rotHandleY, 7, 0, Math.PI * 2);
    previewCtx.fillStyle = '#0a0a0a';
    previewCtx.fill();
    previewCtx.strokeStyle = '#fff';
    previewCtx.lineWidth = 1.3;
    previewCtx.beginPath();
    previewCtx.arc(0, rotHandleY, 3.5, -Math.PI * 0.8, Math.PI * 0.8);
    previewCtx.stroke();
    previewCtx.beginPath();
    previewCtx.moveTo(3.5 * Math.cos(Math.PI * 0.8), rotHandleY + 3.5 * Math.sin(Math.PI * 0.8));
    previewCtx.lineTo(3.5 * Math.cos(Math.PI * 0.8) + 2.5, rotHandleY + 3.5 * Math.sin(Math.PI * 0.8) - 1.5);
    previewCtx.stroke();

    previewCtx.restore();
  }

  // ── Preview (UV panel thumbnail) ──────────────────────────
  // Shows UV layers + draw overlay for a full picture
  function drawPreview() {
    const s = previewCanvas.width;
    previewCtx.clearRect(0, 0, s, s);
    uvLayers.forEach((layer) => {
      if (!layer.img) return;
      previewCtx.save();
      previewCtx.globalAlpha = layer.opacity;
      const { cx, cy, hw, hh } = layerBounds(layer, s);
      previewCtx.translate(cx, cy);
      previewCtx.rotate(layer.rot * Math.PI / 180);
      drawLayerImage(previewCtx, layer, cx, cy, hw, hh);
      previewCtx.restore();
    });
    // Stamp draw overlay onto preview too
    if (_drawOverlayCtx) {
      previewCtx.drawImage(_drawOverlayCtx.canvas, 0, 0, s, s);
    }
    if (activeIdx >= 0) drawHandles(uvLayers[activeIdx], s);
  }

  // ── Draw a single layer image with optional tint ─────────
  function drawLayerImage(ctx, layer, cx, cy, hw, hh) {
    ctx.drawImage(layer.img, -hw, -hh, hw * 2, hh * 2);
    if (layer.tintStrength > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = layer.tintStrength;
      ctx.fillStyle = layer.tintColor;
      ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ── Composite to scene texture ────────────────────────────
  // 1. Clear the shared 1024px canvas
  // 2. Draw all UV Designer layers
  // 3. Stamp DRAW's stroke canvas on top (preserves UV layers when Draw is cleared)
  function composite() {
    if (!_sceneCtx1024) return;
    _sceneCtx1024.clearRect(0, 0, 1024, 1024);

    // UV Designer layers
    uvLayers.forEach(layer => {
      if (!layer.img) return;
      _sceneCtx1024.save();
      _sceneCtx1024.globalAlpha = layer.opacity;
      const cx = layer.x * 1024;
      const cy = (1 - layer.y) * 1024;
      const hw = layer.scale * 512;
      const hh = (layer.img.naturalHeight / layer.img.naturalWidth) * hw;
      _sceneCtx1024.translate(cx, cy);
      _sceneCtx1024.rotate(layer.rot * Math.PI / 180);
      drawLayerImage(_sceneCtx1024, layer, cx, cy, hw, hh);
      _sceneCtx1024.restore();
    });

    // Draw strokes overlay (separate canvas — unaffected by UV layer ops)
    if (_drawOverlayCtx) {
      _sceneCtx1024.drawImage(_drawOverlayCtx.canvas, 0, 0, 1024, 1024);
    }

    if (onComposite) onComposite();
    drawPreview();
  }

  // ── Layer list UI ─────────────────────────────────────────
  function renderLayers() {
    const container = document.getElementById('uv-layers');
    const emptyMsg  = document.getElementById('uv-empty-msg');
    container.querySelectorAll('.uv-layer').forEach(el => el.remove());
    if (!uvLayers.length) { emptyMsg.style.display = 'block'; return; }
    emptyMsg.style.display = 'none';

    uvLayers.forEach((layer, i) => {
      const el   = document.createElement('div');
      el.className = 'uv-layer' + (i === activeIdx ? ' active' : '');
      const thumb = document.createElement('img');
      thumb.className = 'uv-layer-thumb'; thumb.src = layer.img.src;
      const name  = document.createElement('span');
      name.className = 'uv-layer-name'; name.textContent = layer.name;
      const del   = document.createElement('button');
      del.className = 'uv-layer-del'; del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        uvLayers.splice(i, 1);
        if (activeIdx >= uvLayers.length) activeIdx = uvLayers.length - 1;
        renderLayers();
        composite();
        if (activeIdx >= 0) syncSliders();
        drawPreview();
      });
      el.appendChild(thumb); el.appendChild(name); el.appendChild(del);
      el.addEventListener('click', () => setActive(i));
      container.appendChild(el);
    });
  }

  function setActive(idx) {
    activeIdx = idx;
    document.querySelectorAll('.uv-layer').forEach((el, i) => el.classList.toggle('active', i === idx));
    const nameEl = document.getElementById('uv-selected-name');
    if (idx >= 0) { nameEl.style.display = 'block'; nameEl.textContent = uvLayers[idx].name; syncSliders(); }
    else nameEl.style.display = 'none';
    drawPreview();
  }

  function syncSliders() {
    if (activeIdx < 0) return;
    const l = uvLayers[activeIdx];
    document.getElementById('uv-x').value     = l.x;       document.getElementById('uv-x-val').textContent     = l.x.toFixed(2);
    document.getElementById('uv-y').value     = l.y;       document.getElementById('uv-y-val').textContent     = l.y.toFixed(2);
    document.getElementById('uv-scale').value = l.scale;   document.getElementById('uv-scale-val').textContent = l.scale.toFixed(2);
    document.getElementById('uv-rot').value   = l.rot;     document.getElementById('uv-rot-val').textContent   = l.rot + '°';
    document.getElementById('uv-opacity').value = l.opacity; document.getElementById('uv-opacity-val').textContent = l.opacity.toFixed(2);
    document.getElementById('uv-tint-color').value = l.tintColor || '#000000';
    document.getElementById('uv-tint-swatch').style.background = l.tintColor || '#000000';
    document.getElementById('uv-tint-strength').value = l.tintStrength || 0;
    document.getElementById('uv-tint-strength-val').textContent = (l.tintStrength || 0).toFixed(2);
  }

  // ── History ───────────────────────────────────────────────
  function fmtDate(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return new Date(ts).toLocaleDateString();
  }

  function addToHistory(name, dataUrl) {
    uploadHistory = uploadHistory.filter(h => h.name !== name);
    uploadHistory.unshift({ name, dataUrl, date: Date.now() });
    if (uploadHistory.length > MAX_HIST) uploadHistory.length = MAX_HIST;
  }

  function renderHistory() {
    const list  = document.getElementById('uv-history-list');
    const empty = document.getElementById('uv-history-empty');
    list.querySelectorAll('.hist-item').forEach(el => el.remove());
    if (!uploadHistory.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    uploadHistory.forEach(entry => {
      const el    = document.createElement('div');
      el.className = 'hist-item';
      const thumb = document.createElement('img');
      thumb.className = 'hist-thumb'; thumb.src = entry.dataUrl;
      const info  = document.createElement('div'); info.className = 'hist-info';
      const nameEl = document.createElement('div'); nameEl.className = 'hist-name'; nameEl.textContent = entry.name; nameEl.title = entry.name;
      const dateEl = document.createElement('div'); dateEl.className = 'hist-date'; dateEl.textContent = fmtDate(entry.date);
      info.appendChild(nameEl); info.appendChild(dateEl);
      const addBtn = document.createElement('button');
      addBtn.className = 'hist-add'; addBtn.textContent = '+'; addBtn.title = 'Add to canvas';
      addBtn.addEventListener('click', (e) => { e.stopPropagation(); addLayerFromDataUrl(entry.name, entry.dataUrl); });
      el.appendChild(thumb); el.appendChild(info); el.appendChild(addBtn);
      el.addEventListener('click', () => addLayerFromDataUrl(entry.name, entry.dataUrl));
      list.appendChild(el);
    });
  }

  function addLayerFromDataUrl(name, dataUrl) {
    const img = new Image();
    img.onload = () => {
      uvLayers.push({ id: ++layerCounter, name, img, x: 0.5, y: 0.5, scale: 0.3, rot: 0, opacity: 1, tintColor: '#000000', tintStrength: 0 });
      renderLayers();
      setActive(uvLayers.length - 1);
      composite();
    };
    img.src = dataUrl;
  }

  // ── Hit testing ───────────────────────────────────────────
  function hitTest(px, py, layer, s) {
    if (!layer || !layer.img) return null;
    const { cx, cy, hw, hh } = layerBounds(layer, s);
    const rot = layer.rot * Math.PI / 180;
    const dx = px - cx, dy = py - cy;
    const cosR = Math.cos(-rot), sinR = Math.sin(-rot);
    const lx = dx * cosR - dy * sinR;
    const ly = dx * sinR + dy * cosR;
    const H_R = 7;
    const rotHY = -hh - 22;
    if (Math.hypot(lx, ly - rotHY) < H_R + 4) return { mode: 'rotate' };
    const corners = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
    for (let i = 0; i < corners.length; i++) {
      const [cx2, cy2] = corners[i];
      if (Math.hypot(lx - cx2, ly - cy2) < H_R + 6) return { mode: 'scale', cornerIdx: i };
    }
    if (lx >= -hw && lx <= hw && ly >= -hh && ly <= hh) return { mode: 'move' };
    return null;
  }

  // ── Canvas pointer interaction ────────────────────────────
  function bindInteraction() {
    const wrap = document.getElementById('uv-canvas-wrap');

    function getCanvasPos(e) {
      const rect = previewCanvas.getBoundingClientRect();
      const scaleX = previewCanvas.width / rect.width;
      const scaleY = previewCanvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    function onDown(e) {
      if (activeIdx < 0) return;
      const s = previewCanvas.width;
      const { x, y } = getCanvasPos(e);
      const layer = uvLayers[activeIdx];
      const hit = hitTest(x, y, layer, s);
      if (!hit) {
        for (let i = uvLayers.length - 1; i >= 0; i--) {
          const h = hitTest(x, y, uvLayers[i], s);
          if (h && h.mode === 'move') { setActive(i); return; }
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const { cx, cy, hw, hh } = layerBounds(layer, s);
      const { x: ox, y: oy } = getCanvasPos(e);

      if (hit.mode === 'move') {
        handleState = { mode: 'move', startX: ox, startY: oy, origX: layer.x, origY: layer.y };
      } else if (hit.mode === 'scale') {
        const dist = Math.hypot(ox - cx, oy - cy);
        handleState = { mode: 'scale', cx, cy, origScale: layer.scale, refDist: dist, s };
      } else if (hit.mode === 'rotate') {
        const angle = Math.atan2(oy - cy, ox - cx);
        handleState = { mode: 'rotate', cx, cy, refAngle: angle, origRot: layer.rot };
      }
    }

    function onMove(e) {
      if (!handleState || activeIdx < 0) return;
      e.preventDefault();
      const s = previewCanvas.width;
      const { x, y } = getCanvasPos(e);
      const layer = uvLayers[activeIdx];

      if (handleState.mode === 'move') {
        const dx = (x - handleState.startX) / s;
        const dy = (y - handleState.startY) / s;
        layer.x = Math.max(0, Math.min(1, handleState.origX + dx));
        layer.y = Math.max(0, Math.min(1, handleState.origY - dy));
      } else if (handleState.mode === 'scale') {
        const dist = Math.hypot(x - handleState.cx, y - handleState.cy);
        const ratio = dist / Math.max(0.001, handleState.refDist);
        layer.scale = Math.max(0.02, Math.min(1, handleState.origScale * ratio));
      } else if (handleState.mode === 'rotate') {
        const angle = Math.atan2(y - handleState.cy, x - handleState.cx);
        const delta = (angle - handleState.refAngle) * (180 / Math.PI);
        layer.rot = ((handleState.origRot + delta) % 360 + 360) % 360;
        if (layer.rot > 180) layer.rot -= 360;
      }

      syncSliders();
      if (!_rafPending) {
        _rafPending = true;
        requestAnimationFrame(() => { composite(); _rafPending = false; });
      } else {
        drawPreview();
      }
    }

    function onUp() {
      if (!handleState) return;
      handleState = null;
      _rafPending = false;
      composite();
    }

    function onHover(e) {
      if (handleState) return;
      if (activeIdx < 0) { wrap.style.cursor = 'crosshair'; return; }
      const s = previewCanvas.width;
      const { x, y } = getCanvasPos(e);
      const hit = hitTest(x, y, uvLayers[activeIdx], s);
      if (!hit) wrap.style.cursor = 'crosshair';
      else if (hit.mode === 'rotate') wrap.style.cursor = 'crosshair';
      else if (hit.mode === 'scale') wrap.style.cursor = 'nwse-resize';
      else wrap.style.cursor = 'grab';
    }

    wrap.addEventListener('mousedown', onDown);
    wrap.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', (e) => { onMove(e); onHover(e); });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  }

  // ── Init ─────────────────────────────────────────────────
  function init(sceneCtx1024, mehendiCallback) {
    _sceneCtx1024 = sceneCtx1024;
    onComposite = mehendiCallback;

    // Wire toggle
    document.getElementById('uv-wire-check').addEventListener('change', (e) => {
      wireVisible = e.target.checked;
      drawWire();
    });

    // Upload
    document.getElementById('uv-upload-input').addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          const name    = file.name.replace(/\.[^.]+$/, '');
          addToHistory(name, dataUrl);
          renderHistory();
          addLayerFromDataUrl(name, dataUrl);
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    });

    // History clear
    document.getElementById('uv-history-clear').addEventListener('click', () => {
      uploadHistory = [];
      renderHistory();
    });

    // UV sliders
    const uvSliders = [
      { id: 'uv-x',       valId: 'uv-x-val',       prop: 'x',       fmt: v => v.toFixed(2) },
      { id: 'uv-y',       valId: 'uv-y-val',       prop: 'y',       fmt: v => v.toFixed(2) },
      { id: 'uv-scale',   valId: 'uv-scale-val',   prop: 'scale',   fmt: v => v.toFixed(2) },
      { id: 'uv-rot',     valId: 'uv-rot-val',     prop: 'rot',     fmt: v => v + '°' },
      { id: 'uv-opacity', valId: 'uv-opacity-val', prop: 'opacity', fmt: v => v.toFixed(2) },
      { id: 'uv-tint-strength', valId: 'uv-tint-strength-val', prop: 'tintStrength', fmt: v => v.toFixed(2) },
    ];
    uvSliders.forEach(({ id, valId, prop, fmt }) => {
      document.getElementById(id).addEventListener('input', (e) => {
        if (activeIdx < 0) return;
        const v = parseFloat(e.target.value);
        uvLayers[activeIdx][prop] = v;
        document.getElementById(valId).textContent = fmt(v);
        composite();
      });
    });

    // Tint color picker
    document.getElementById('uv-tint-color').addEventListener('input', (e) => {
      if (activeIdx < 0) return;
      uvLayers[activeIdx].tintColor = e.target.value;
      document.getElementById('uv-tint-swatch').style.background = e.target.value;
      composite();
    });

    bindInteraction();
    renderHistory();
    resizePreview();
  }

  // Called by main.js after DRAW.init() — registers Draw's private canvas
  function setDrawOverlay(drawCtx1024) {
    _drawOverlayCtx = drawCtx1024;
  }

  function setEdges(edges) {
    uvEdges = edges;
    document.getElementById('uv-wire-status').textContent =
      edges.length ? (edges.length + ' UV edges') : 'No UV data found in model';
    drawWire();
  }

  // Clear all UV Designer layers (called on model swap)
  function clearLayers() {
    uvLayers = [];
    activeIdx = -1;
    renderLayers();
    const nameEl = document.getElementById('uv-selected-name');
    if (nameEl) nameEl.style.display = 'none';
    drawPreview();
  }

  // Expose composite so Draw's _onComposite callback can trigger a full re-merge
  return { init, setEdges, setDrawOverlay, composite, resizePreview, drawWire, clearLayers };
})();