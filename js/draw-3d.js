// draw-3d.js — UV-space freehand drawing (2D mode) + 3D surface painting
// Pen types: brush, ink, spray, marker, calligraphy, eraser

// ── PEN ENGINE — shared rendering logic ──────────────────────────────────────
const PEN_ENGINE = {
  // Brush: soft round strokes with feathered edges
  brush(ctx, ptA, ptB, color, size, opacity) {
    ctx.save();
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    grad.addColorStop(0,   hexAlpha(color, opacity));
    grad.addColorStop(0.6, hexAlpha(color, opacity * 0.6));
    grad.addColorStop(1,   hexAlpha(color, 0));
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = hexAlpha(color, opacity * 0.92);
    ctx.shadowColor = hexAlpha(color, opacity * 0.3);
    ctx.shadowBlur  = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(ptA.x, ptA.y);
    ctx.lineTo(ptB.x, ptB.y);
    ctx.stroke();
    ctx.restore();
  },

  // Ink pen: crisp thin line, slight taper at ends, no blur
  ink(ctx, ptA, ptB, color, size, opacity, speed) {
    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    // Speed-sensitive width: faster = thinner (simulates ink flow)
    const spd   = Math.min(1, (speed || 0) / 20);
    const w     = Math.max(0.5, size * (1 - spd * 0.55));
    ctx.lineWidth = w;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, opacity * 1.1);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(ptA.x, ptA.y);
    ctx.lineTo(ptB.x, ptB.y);
    ctx.stroke();
    ctx.restore();
  },

  // Spray: random scatter of dots around the point
  spray(ctx, pt, color, size, opacity) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const density = Math.round(size * 1.8);
    const radius  = size * 1.2;
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = Math.pow(Math.random(), 0.7) * radius;
      const x = pt.x + Math.cos(angle) * dist;
      const y = pt.y + Math.sin(angle) * dist;
      ctx.globalAlpha = Math.random() * opacity * 0.7 + 0.05;
      ctx.fillStyle   = color;
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 1.2 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // Marker: flat, semi-transparent, wide strokes (like a chisel tip marker)
  marker(ctx, ptA, ptB, color, size, opacity) {
    ctx.save();
    ctx.lineCap   = 'square';
    ctx.lineJoin  = 'miter';
    ctx.lineWidth = size * 1.4;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha  = opacity * 0.45;  // markers are naturally semi-transparent
    ctx.strokeStyle  = color;
    ctx.beginPath();
    ctx.moveTo(ptA.x, ptA.y);
    ctx.lineTo(ptB.x, ptB.y);
    ctx.stroke();
    ctx.restore();
  },

  // Calligraphy: angle-sensitive width (wide on horizontal, thin on vertical)
  calligraphy(ctx, ptA, ptB, color, size, opacity) {
    ctx.save();
    const angle = Math.atan2(ptB.y - ptA.y, ptB.x - ptA.x);
    // Width varies with stroke angle — classic 45° nib
    const nibAngle = Math.PI / 4;
    const widthFactor = Math.abs(Math.sin(angle - nibAngle));
    const w = Math.max(0.8, size * (0.15 + widthFactor * 0.85));
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    ctx.lineWidth = w;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = opacity;
    ctx.strokeStyle  = color;
    ctx.beginPath();
    ctx.moveTo(ptA.x, ptA.y);
    ctx.lineTo(ptB.x, ptB.y);
    ctx.stroke();
    ctx.restore();
  },

  // Eraser
  eraser(ctx, ptA, ptB, size) {
    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(ptA.x, ptA.y);
    ctx.lineTo(ptB.x, ptB.y);
    ctx.stroke();
    ctx.restore();
  },

  // Dot (for spray/click-only strokes)
  dot(ctx, pt, color, size, opacity) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = opacity;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
};

// ── Utility ───────────────────────────────────────────────────────────────────
function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,a)).toFixed(3)})`;
}


// ── DRAW3D: 3D raycast painting ──────────────────────────────────────────────
const DRAW3D = (() => {
  let _active = false, _grabMode = false, _tool = 'brush', _penType = 'brush';
  let _sceneRef = null, _modelRef = null, _drawCtx1024 = null, _onComp = null;
  let _is3DDrawing = false;
  let _color = '#8B1A1A', _size = 18, _eraserSize = 28, _opacity = 0.85;
  let _lastUV = null;
  let _rafPending = false, cursor3d = null;

  function init(drawCtx1024, onComposite, sceneRef, model) {
    _drawCtx1024 = drawCtx1024; _onComp = onComposite;
    _sceneRef = sceneRef; _modelRef = model;
    cursor3d = document.getElementById('cursor-3d');
    _lastUV = null;
  }

  function setActive(on) {
    _active = on;
    if (!on) { _is3DDrawing = false; _lastUV = null; if (cursor3d) cursor3d.style.opacity = '0'; }
  }
  function setGrabMode(on) {
    _grabMode = on;
    const b = document.getElementById('btn-grab');
    if (b) b.classList.toggle('active', on);
  }
  function setTool(name) { _tool = name; }
  function setPenType(name) { _penType = name; }
  function syncFromDraw(color, size, eraserSize, opacity, penType) {
    _color = color; _size = size; _eraserSize = eraserSize; _opacity = opacity;
    if (penType) _penType = penType;
  }

  function _getUVAtMouse(e) {
    if (!_sceneRef || !_modelRef || typeof THREE === 'undefined') return null;
    const canvas = _sceneRef.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x, y }, _sceneRef.camera);
    // Ensure world matrices are up to date before raycasting
    _modelRef.updateMatrixWorld(true);
    const meshes = [];
    _modelRef.traverse(n => { if (n.isMesh) meshes.push(n); });
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length || !hits[0].uv) return null;
    return { u: hits[0].uv.x, v: hits[0].uv.y };
  }

  function _uvToCanvas(uv) {
    return { x: uv.u * 1024, y: (1 - uv.v) * 1024 };
  }

  function _paintUV(uv, prevUV, speed) {
    if (!_drawCtx1024) return;
    const pt    = _uvToCanvas(uv);
    const prevPt = prevUV ? _uvToCanvas(prevUV) : pt;

    if (_tool === 'eraser') {
      PEN_ENGINE.eraser(_drawCtx1024, prevPt, pt, _eraserSize);
      return;
    }

    switch (_penType) {
      case 'ink':
        PEN_ENGINE.ink(_drawCtx1024, prevPt, pt, _color, _size, _opacity, speed || 0);
        break;
      case 'spray':
        PEN_ENGINE.spray(_drawCtx1024, pt, _color, _size, _opacity);
        break;
      case 'marker':
        PEN_ENGINE.marker(_drawCtx1024, prevPt, pt, _color, _size, _opacity);
        break;
      case 'calligraphy':
        PEN_ENGINE.calligraphy(_drawCtx1024, prevPt, pt, _color, _size, _opacity);
        break;
      default:
        PEN_ENGINE.brush(_drawCtx1024, prevPt, pt, _color, _size, _opacity);
    }
  }

  function onCanvas3DMouseDown(e) {
    if (!_active || _grabMode) return false;
    const uv = _getUVAtMouse(e);
    if (!uv) return false;
    _is3DDrawing = true;
    _paintUV(uv, null, 0);
    _lastUV = uv;
    if (_onComp) _onComp();
    if (typeof DRAW !== 'undefined') DRAW.drawPreview();
    return true;
  }

  function onCanvas3DMouseMove(e) {
    if (!_active) return;
    const uv = _getUVAtMouse(e);
    if (cursor3d) {
      if (uv) {
        const sz = (_tool === 'eraser' ? _eraserSize : _size) * 0.5;
        cursor3d.style.left = e.clientX + 'px'; cursor3d.style.top = e.clientY + 'px';
        cursor3d.style.width = sz + 'px'; cursor3d.style.height = sz + 'px';
        cursor3d.style.opacity = '1';
        cursor3d.style.borderColor = _tool === 'eraser'
          ? 'rgba(255,60,60,0.85)'
          : (_penType === 'spray' ? hexAlpha(_color, 0.7) : _color);
      } else { cursor3d.style.opacity = '0'; }
    }
    if (!_is3DDrawing || !uv) { _lastUV = uv; return; }

    const speed = _lastUV
      ? Math.hypot(uv.u - _lastUV.u, uv.v - _lastUV.v) * 1024
      : 0;

    _paintUV(uv, _lastUV, speed);
    _lastUV = uv;

    if (!_rafPending) {
      _rafPending = true;
      requestAnimationFrame(() => {
        if (_onComp) _onComp();
        if (typeof DRAW !== 'undefined') DRAW.drawPreview();
        _rafPending = false;
      });
    }
  }

  function onCanvas3DMouseUp() {
    if (_is3DDrawing) {
      _is3DDrawing = false;
      _lastUV = null;
      if (typeof DRAW !== 'undefined') DRAW.saveSnapshot();
    }
  }

  return {
    init, setActive, setGrabMode, setTool, setPenType, syncFromDraw,
    onCanvas3DMouseDown, onCanvas3DMouseMove, onCanvas3DMouseUp,
    undo: () => { if (typeof DRAW !== 'undefined') DRAW.undo(); },
    redo: () => { if (typeof DRAW !== 'undefined') DRAW.redo(); },
    clearAll: () => { if (typeof DRAW !== 'undefined') DRAW.clearAll(); },
  };
})();


// ── DRAW: 2D UV-space freehand drawing panel ─────────────────────────────────
const DRAW = (() => {
  let wrapEl = null, wireCanvas = null, drawCanvas = null, cursorDot = null;

  let _drawCtx1024 = null;
  let _onComposite = null, _uvEdges = [];
  let wireCtx = null, drawCtx = null;
  let _tool = 'brush', _penType = 'brush';
  let _color = '#8B1A1A', _size = 18, _eraserSize = 28;
  let _opacity = 0.85, _wireVis = true, _pressure = false;
  let _drawMode = '2d';

  let _undoStack = [], _redoStack = [];
  const MAX_UNDO = 30;

  let _isDrawing = false, _lastPt = null, _lastSpeed = 0;
  let _rafPending = false, _side = 0;

  let cursorCanvas = null, cursorCtx = null;
  let _cursorPt = null, _cursorActive = false;

  function getDrawCtx1024() { return _drawCtx1024; }
  function getPenType() { return _penType; }

  // ── Undo/Redo ─────────────────────────────────────────────
  // IMPORTANT: _drawCtx1024 is the single source of truth (1024×1024 offscreen).
  // Never copy drawCanvas back into it — that resamples and blurs every stroke.
  // All painting goes directly to _drawCtx1024; drawPreview() only reads from it.
  function saveSnapshot() {
    if (!_drawCtx1024) return;
    _undoStack.push(_drawCtx1024.getImageData(0, 0, 1024, 1024));
    if (_undoStack.length > MAX_UNDO) _undoStack.shift();
    _redoStack = [];
    _refreshUndoButtons();
  }

  function undo() {
    if (!_undoStack.length || !_drawCtx1024) return;
    _redoStack.push(_drawCtx1024.getImageData(0, 0, 1024, 1024));
    _drawCtx1024.putImageData(_undoStack.pop(), 0, 0);
    if (_onComposite) _onComposite();
    drawPreview(); _refreshUndoButtons();
  }

  function redo() {
    if (!_redoStack.length || !_drawCtx1024) return;
    _undoStack.push(_drawCtx1024.getImageData(0, 0, 1024, 1024));
    _drawCtx1024.putImageData(_redoStack.pop(), 0, 0);
    if (_onComposite) _onComposite();
    drawPreview(); _refreshUndoButtons();
  }

  function clearAll() {
    if (!_drawCtx1024) return;
    saveSnapshot();
    _drawCtx1024.clearRect(0, 0, 1024, 1024);
    if (drawCtx && drawCanvas) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    if (_onComposite) _onComposite();
    drawPreview(); _refreshUndoButtons();
  }

  function _refreshUndoButtons() {
    const u = document.getElementById('draw-undo-btn');
    const r = document.getElementById('draw-redo-btn');
    if (u) u.disabled = _undoStack.length === 0;
    if (r) r.disabled = _redoStack.length === 0;
  }

  // ── Wire ──────────────────────────────────────────────────
  function drawWire() {
    if (!wireCtx || !wireCanvas) return;
    const s = wireCanvas.width || 1;
    wireCtx.clearRect(0, 0, s, s);
    if (!_wireVis || !_uvEdges.length) return;
    wireCtx.save();
    wireCtx.strokeStyle = 'rgba(20,100,220,0.45)';
    wireCtx.lineWidth = 0.5;
    wireCtx.beginPath();
    _uvEdges.forEach(([u0, v0, u1, v1]) => {
      wireCtx.moveTo(u0 * s, (1 - v0) * s);
      wireCtx.lineTo(u1 * s, (1 - v1) * s);
    });
    wireCtx.stroke();
    wireCtx.restore();
  }

  function drawPreview() {
    if (!drawCtx || !drawCanvas || !_drawCtx1024) return;
    const s = drawCanvas.width;
    drawCtx.clearRect(0, 0, s, s);
    drawCtx.drawImage(_drawCtx1024.canvas, 0, 0, s, s);
  }

  // ── Resize ────────────────────────────────────────────────
  function resizePreview() {
    if (!wrapEl || !wireCanvas || !drawCanvas) return;
    const rect = drawCanvas.getBoundingClientRect();
    const sw = Math.round(rect.width);
    const sh = Math.round(rect.height);
    if (sw === 0 || sh === 0) return;
    _side = sw;
    wireCanvas.width  = sw; wireCanvas.height  = sh;
    drawCanvas.width  = sw; drawCanvas.height  = sh;
    if (cursorCanvas) { cursorCanvas.width = sw; cursorCanvas.height = sh; }
    drawWire(); drawPreview(); _drawCursor();
  }

  // ── Coordinate mapping ─────────────────────────────────────
  function _clientToCanvas(clientX, clientY) {
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (drawCanvas.width  / rect.width),
      y: (clientY - rect.top)  * (drawCanvas.height / rect.height),
    };
  }

  // Map canvas pixel → 1024px UV space
  function _canvasTo1024(pt) {
    return {
      x: pt.x * (1024 / drawCanvas.width),
      y: pt.y * (1024 / drawCanvas.height),
    };
  }

  function _eventCoords(e) {
    return e.touches
      ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
      : { clientX: e.clientX, clientY: e.clientY };
  }

  // ── Cursor overlay ─────────────────────────────────────────
  function _drawCursor() {
    if (!cursorCtx || !cursorCanvas) return;
    const s = cursorCanvas.width;
    cursorCtx.clearRect(0, 0, s, cursorCanvas.height);
    if (!_cursorPt) return;
    const size = _tool === 'eraser' ? _eraserSize : _size;
    const r = Math.max(2, (size / 1024) * s * 0.5);
    cursorCtx.save();
    cursorCtx.beginPath();
    cursorCtx.arc(_cursorPt.x, _cursorPt.y, r, 0, Math.PI * 2);

    // Pen-type specific cursor styling
    if (_tool === 'eraser') {
      cursorCtx.strokeStyle = 'rgba(255,60,60,0.85)';
      cursorCtx.lineWidth = 1.5;
    } else if (_penType === 'ink') {
      cursorCtx.strokeStyle = _color;
      cursorCtx.lineWidth = 1;
      // Crosshair for precision ink
      cursorCtx.moveTo(_cursorPt.x - r - 4, _cursorPt.y);
      cursorCtx.lineTo(_cursorPt.x + r + 4, _cursorPt.y);
      cursorCtx.moveTo(_cursorPt.x, _cursorPt.y - r - 4);
      cursorCtx.lineTo(_cursorPt.x, _cursorPt.y + r + 4);
    } else if (_penType === 'spray') {
      cursorCtx.strokeStyle = hexAlpha(_color, 0.6);
      cursorCtx.lineWidth = 1;
      cursorCtx.setLineDash([3, 3]);
    } else if (_penType === 'marker') {
      cursorCtx.strokeStyle = hexAlpha(_color, 0.7);
      cursorCtx.lineWidth = 2;
    } else if (_penType === 'calligraphy') {
      cursorCtx.strokeStyle = _color;
      cursorCtx.lineWidth = 1;
    } else {
      cursorCtx.strokeStyle = _color;
      cursorCtx.lineWidth = 1.5;
    }
    cursorCtx.stroke();

    if (_cursorActive) {
      cursorCtx.setLineDash([]);
      cursorCtx.globalAlpha = _penType === 'marker' ? 0.08 : 0.14;
      cursorCtx.fillStyle = _tool === 'eraser' ? 'rgba(255,60,60,0.10)' : _color;
      cursorCtx.beginPath();
      cursorCtx.arc(_cursorPt.x, _cursorPt.y, r, 0, Math.PI * 2);
      cursorCtx.fill();
    }
    cursorCtx.restore();
  }

  function _hideCursor() { _cursorPt = null; _cursorActive = false; _drawCursor(); }
  function hideCursorDot() { if (cursorDot) cursorDot.style.opacity = '0'; }

  // ── Paint directly into _drawCtx1024 (1024×1024, always) ──
  // Never touches drawCanvas — drawPreview() is the only reader of _drawCtx1024.
  function paintAt(ptA, ptB, speed) {
    if (!_drawCtx1024) return;

    const a1 = _canvasTo1024(ptA);
    const b1 = _canvasTo1024(ptB || ptA);
    const displaySize = _size * (1024 / (drawCanvas ? drawCanvas.width : 1024));

    if (_tool === 'eraser') {
      PEN_ENGINE.eraser(_drawCtx1024, a1, b1, _eraserSize);
      return;
    }

    switch (_penType) {
      case 'ink':
        PEN_ENGINE.ink(_drawCtx1024, a1, b1, _color, displaySize, _opacity, speed || 0);
        break;
      case 'spray':
        PEN_ENGINE.spray(_drawCtx1024, b1, _color, displaySize, _opacity);
        break;
      case 'marker':
        PEN_ENGINE.marker(_drawCtx1024, a1, b1, _color, displaySize, _opacity);
        break;
      case 'calligraphy':
        PEN_ENGINE.calligraphy(_drawCtx1024, a1, b1, _color, displaySize, _opacity);
        break;
      default:
        PEN_ENGINE.brush(_drawCtx1024, a1, b1, _color, displaySize, _opacity);
    }
  }

  // scheduleComposite: on each RAF, sync display canvas from _drawCtx1024
  // then trigger the 3D texture composite. One drawPreview per frame max.
  function scheduleComposite() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => {
      drawPreview();           // _drawCtx1024 → display canvas (read-only)
      if (_onComposite) _onComposite();
      _rafPending = false;
    });
  }

  // ── Pointer handlers (2D) ─────────────────────────────────
  function onDown(e) {
    if (_drawMode !== '2d') return;
    e.preventDefault(); e.stopPropagation();
    saveSnapshot();
    const { clientX, clientY } = _eventCoords(e);
    const pt = _clientToCanvas(clientX, clientY);
    _isDrawing = true; _lastPt = pt; _lastSpeed = 0;
    paintAt(pt, pt, 0);
    scheduleComposite();
    _cursorPt = pt; _cursorActive = true; _drawCursor();
  }

  function onMove(e) {
    if (_drawMode !== '2d') return;
    const { clientX, clientY } = _eventCoords(e);
    const pt = _clientToCanvas(clientX, clientY);
    if (!_isDrawing) {
      _cursorPt = pt; _cursorActive = false; _drawCursor();
      return;
    }
    e.preventDefault();
    const speed = _lastPt ? Math.hypot(pt.x - _lastPt.x, pt.y - _lastPt.y) : 0;
    _lastSpeed = speed;
    paintAt(_lastPt || pt, pt, speed);
    _lastPt = pt;
    scheduleComposite();
    _cursorPt = pt; _cursorActive = true; _drawCursor();
  }

  function onUp() {
    if (_isDrawing) {
      drawPreview();
      if (_onComposite) _onComposite();
    }
    _isDrawing = false; _lastPt = null; _lastSpeed = 0;
    _cursorActive = false; _drawCursor();
  }

  function onLeave() {
    if (_isDrawing) {
      drawPreview();
      if (_onComposite) _onComposite();
    }
    _isDrawing = false; _lastPt = null;
    _hideCursor(); hideCursorDot();
  }

  function bindCanvas() {
    if (!drawCanvas) return;
    const evTarget = cursorCanvas || drawCanvas;
    evTarget.addEventListener('mousedown',  onDown, { capture: true });
    evTarget.addEventListener('touchstart', onDown, { capture: true, passive: false });
    evTarget.addEventListener('mousemove',  onMove);
    evTarget.addEventListener('touchmove',  onMove, { passive: false });
    window.addEventListener('mouseup',  onUp);
    window.addEventListener('touchend', onUp);
    evTarget.addEventListener('mouseleave', onLeave);
  }

  // ── 2D/3D mode toggle ─────────────────────────────────────
  function _buildModeToggle() {
    const panel = document.getElementById('content-draw');
    if (!panel) return;
    const oldHint = panel.querySelector('p');
    if (oldHint) oldHint.remove();

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;gap:4px;';

    const hint = document.createElement('p');
    hint.id = 'draw-mode-hint';
    hint.style.cssText = "font-family:'DM Mono',monospace;font-size:9px;color:var(--text-secondary);line-height:1.7;margin:0;";
    hint.textContent = 'Paint on the UV map below — strokes appear on the 3D model.';

    ['2d', '3d'].forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'draw-tool-btn' + (m === '2d' ? ' active' : '');
      btn.dataset.drawMode = m;
      btn.style.flex = '1';
      btn.innerHTML = m === '2d'
        ? '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M2 6h10M6 2v10" stroke="currentColor" stroke-width="0.8" opacity="0.5"/></svg> 2D UV'
        : '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 2L2 5v4l5 3 5-3V5L7 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> 3D Paint';
      btn.addEventListener('click', () => setDrawMode(m));
      wrapper.appendChild(btn);
    });

    panel.insertBefore(hint, panel.firstChild);
    panel.insertBefore(wrapper, panel.firstChild);
  }

  function setDrawMode(m) {
    _drawMode = m;
    document.querySelectorAll('[data-draw-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.drawMode === m);
    });
    const hint = document.getElementById('draw-mode-hint');
    if (hint) hint.textContent = m === '2d'
      ? 'Paint on the UV map below — strokes appear on the 3D model.'
      : 'Paint directly on the 3D model in the viewport.';

    const cvWrap = document.getElementById('draw-canvas-wrap');
    if (cvWrap) cvWrap.style.display = m === '2d' ? '' : 'none';
    const wireToggle = document.getElementById('draw-wire-toggle');
    if (wireToggle) wireToggle.style.display = m === '2d' ? '' : 'none';

    const mc = document.getElementById('canvas');
    if (mc) mc.style.cursor = m === '3d' ? 'crosshair' : 'grab';

    if (m === '3d') _bind3DCanvasEvents();
    else _unbind3DCanvasEvents();
  }

  // ── 3D canvas events ──────────────────────────────────────
  let _3dBound = false;

  function _on3DDown(e) {
    if (_drawMode !== '3d') return;
    DRAW3D.syncFromDraw(_color, _size, _eraserSize, _opacity, _penType);
    const handled = DRAW3D.onCanvas3DMouseDown(e);
    if (handled) { e.stopPropagation(); saveSnapshot(); }
  }
  function _on3DMove(e) {
    if (_drawMode !== '3d') return;
    DRAW3D.syncFromDraw(_color, _size, _eraserSize, _opacity, _penType);
    DRAW3D.onCanvas3DMouseMove(e);
  }
  function _on3DUp() { DRAW3D.onCanvas3DMouseUp(); }

  function _bind3DCanvasEvents() {
    if (_3dBound) return;
    const c = document.getElementById('canvas');
    if (!c) return;
    c.addEventListener('mousedown', _on3DDown, { capture: true });
    c.addEventListener('mousemove', _on3DMove);
    window.addEventListener('mouseup', _on3DUp);
    _3dBound = true;
  }

  function _unbind3DCanvasEvents() {
    if (!_3dBound) return;
    const c = document.getElementById('canvas');
    if (c) {
      c.removeEventListener('mousedown', _on3DDown, { capture: true });
      c.removeEventListener('mousemove', _on3DMove);
    }
    window.removeEventListener('mouseup', _on3DUp);
    _3dBound = false;
    const cur = document.getElementById('cursor-3d');
    if (cur) cur.style.opacity = '0';
  }

  // ── Sync UI ───────────────────────────────────────────────
  function syncUI() {
    // Tool buttons (brush/eraser)
    document.querySelectorAll('.draw-tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    // Pen type buttons
    document.querySelectorAll('.draw-pen-btn').forEach(btn => {
      btn.addEventListener('click', () => setPenType(btn.dataset.pen));
    });

    // Color swatches
    document.querySelectorAll('.draw-swatch:not(.draw-swatch-custom)').forEach(sw => {
      sw.addEventListener('click', () => {
        _color = sw.dataset.color;
        document.querySelectorAll('.draw-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
      });
    });
    const picker = document.getElementById('draw-color-picker');
    if (picker) picker.addEventListener('input', (e) => {
      _color = e.target.value;
      const sw = document.getElementById('draw-custom-swatch');
      if (sw) sw.style.background = _color;
      document.querySelectorAll('.draw-swatch').forEach(s => s.classList.remove('active'));
      picker.closest('.draw-swatch')?.classList.add('active');
    });

    const sizeEl = document.getElementById('draw-size');
    if (sizeEl) sizeEl.addEventListener('input', e => {
      _size = parseFloat(e.target.value);
      document.getElementById('draw-size-val').textContent = e.target.value + 'px';
    });
    const eraserEl = document.getElementById('draw-eraser-size');
    if (eraserEl) eraserEl.addEventListener('input', e => {
      _eraserSize = parseFloat(e.target.value);
      const v = document.getElementById('draw-eraser-size-val');
      if (v) v.textContent = e.target.value + 'px';
    });
    const opEl = document.getElementById('draw-opacity');
    if (opEl) opEl.addEventListener('input', e => {
      _opacity = parseFloat(e.target.value);
      document.getElementById('draw-opacity-val').textContent = parseFloat(e.target.value).toFixed(2);
    });
    const wireChk = document.getElementById('draw-wire-check');
    if (wireChk) wireChk.addEventListener('change', e => { _wireVis = e.target.checked; drawWire(); });
    const pressChk = document.getElementById('draw-pressure-check');
    if (pressChk) pressChk.addEventListener('change', e => { _pressure = e.target.checked; });

    const undoBtn  = document.getElementById('draw-undo-btn');
    const redoBtn  = document.getElementById('draw-redo-btn');
    const clearBtn = document.getElementById('draw-clear-btn');
    if (undoBtn)  undoBtn.addEventListener('click',  undo);
    if (redoBtn)  redoBtn.addEventListener('click',  redo);
    if (clearBtn) clearBtn.addEventListener('click', clearAll);
    _refreshUndoButtons();
  }

  function setTool(name) {
    _tool = name;
    document.querySelectorAll('.draw-tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === name);
    });
    const brushRow  = document.getElementById('draw-brush-size-row');
    const eraserRow = document.getElementById('draw-eraser-size-row');
    const penRow    = document.getElementById('draw-pen-type-row');
    if (brushRow)  brushRow.style.display  = name === 'eraser' ? 'none' : '';
    if (eraserRow) eraserRow.style.display = name === 'eraser' ? '' : 'none';
    if (penRow)    penRow.style.display    = name === 'eraser' ? 'none' : '';
    DRAW3D.setTool(name);
  }

  const PEN_DESCRIPTIONS = {
    brush:       'Soft round strokes with feathered edges — ideal for shading.',
    ink:         'Precise ink pen — line thins as you draw faster, simulating real ink flow.',
    spray:       'Scatter of tiny dots — hold still to build up, move to spread.',
    marker:      'Semi-transparent flat strokes with a chisel tip — great for bold fills.',
    calligraphy: '45° nib pen — wide on horizontal strokes, thin on vertical ones.',
  };

  function setPenType(name) {
    _penType = name;
    document.querySelectorAll('.draw-pen-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.pen === name);
    });
    DRAW3D.setPenType(name);

    // Update description chip
    const descEl = document.getElementById('pen-desc');
    if (descEl) {
      descEl.style.opacity = '0';
      setTimeout(() => {
        descEl.textContent = PEN_DESCRIPTIONS[name] || '';
        descEl.style.opacity = '1';
      }, 80);
    }
  }

  // ── Public init ───────────────────────────────────────────
  function init(ctx1024, onCompositeCallback, edges) {
    _onComposite = onCompositeCallback;
    _uvEdges = edges || [];

    const offscreen = document.createElement('canvas');
    offscreen.width = 1024; offscreen.height = 1024;
    _drawCtx1024 = offscreen.getContext('2d');

    wrapEl     = document.getElementById('draw-canvas-wrap');
    wireCanvas = document.getElementById('draw-wire-canvas');
    drawCanvas = document.getElementById('draw-canvas');
    cursorDot  = document.getElementById('draw-cursor-dot');
    if (!wrapEl || !wireCanvas || !drawCanvas) return;
    wireCtx = wireCanvas.getContext('2d');
    drawCtx = drawCanvas.getContext('2d');

    cursorCanvas = document.createElement('canvas');
    cursorCanvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:auto;cursor:none;';
    wrapEl.appendChild(cursorCanvas);
    cursorCtx = cursorCanvas.getContext('2d');

    if (cursorDot) cursorDot.style.display = 'none';

    resizePreview();
    new ResizeObserver(resizePreview).observe(wrapEl);
    bindCanvas();
    syncUI();
    _buildModeToggle();
  }

  function setEdges(edges) { _uvEdges = edges || []; drawWire(); }

  return {
    init, setEdges, resizePreview, drawWire, drawPreview,
    saveSnapshot, undo, redo, clearAll, 
    getDrawCtx1024, getPenType,
  };
})();