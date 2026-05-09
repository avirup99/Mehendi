// skeleton.js — bone discovery, list rendering, checkbox multi-selection, rotation controls
// + 2D hand skeleton diagram with interactive bone highlighting

const SKELETON = (() => {
  const HIDDEN_BONES = new Set(['hand','hand002','hand003','hand004','hand005']);
  const DEG = Math.PI / 180;

  let allBones = [];
  let selectedIndices = new Set();
  let primaryIndex = -1;
  const highlightMeshes = new Map();

  // ── 3-D joint highlight helpers ──────────────────────────
  function getOrCreateHighlight(idx) {
    if (highlightMeshes.has(idx)) return highlightMeshes.get(idx);
    const bone = allBones[idx].bone;
    if (!window.THREE) return null;
    const geo  = new THREE.SphereGeometry(0.012, 8, 8);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xff6600, depthTest: false, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 999;
    bone.add(mesh);
    highlightMeshes.set(idx, mesh);
    return mesh;
  }

  function setHighlight(idx, on) {
    const m = getOrCreateHighlight(idx);
    if (m) m.visible = on;
  }

  // ── 2D Diagram definition ─────────────────────────────────
  // Nodes positioned in normalized [0,1] space (x=right, y=down)
  // Patterns use [_.\s-]* between words and avoid \b (breaks on underscores/digits)
  const DIAGRAM_NODES = [
    { id: 'wrist',       patterns: [/wrist/i, /carpal/i],                                                          x: 0.50, y: 0.93 },
    { id: 'meta_thumb',  patterns: [/thumb[_.\s-]*(meta|00?|mcp)/i, /meta[_.\s-]*thumb/i],                        x: 0.18, y: 0.78 },
    { id: 'meta_index',  patterns: [/index[_.\s-]*(meta|00?|mcp)/i, /meta[_.\s-]*index/i],                        x: 0.33, y: 0.72 },
    { id: 'meta_mid',    patterns: [/midd?l?e?[_.\s-]*(meta|00?|mcp)/i, /meta[_.\s-]*midd?l?e?/i],               x: 0.50, y: 0.70 },
    { id: 'meta_ring',   patterns: [/ring[_.\s-]*(meta|00?|mcp)/i, /meta[_.\s-]*ring/i],                          x: 0.67, y: 0.72 },
    { id: 'meta_pinky',  patterns: [/(pinky|little)[_.\s-]*(meta|00?|mcp)/i, /meta[_.\s-]*(pinky|little)/i],      x: 0.82, y: 0.76 },
    { id: 'prox_thumb',  patterns: [/thumb[_.\s-]*(01?|prox)/i, /prox[_.\s-]*thumb/i],                            x: 0.14, y: 0.63 },
    { id: 'prox_index',  patterns: [/index[_.\s-]*(01?|prox)/i, /prox[_.\s-]*index/i],                            x: 0.32, y: 0.56 },
    { id: 'prox_mid',    patterns: [/midd?l?e?[_.\s-]*(01?|prox)/i, /prox[_.\s-]*midd?l?e?/i],                   x: 0.50, y: 0.53 },
    { id: 'prox_ring',   patterns: [/ring[_.\s-]*(01?|prox)/i, /prox[_.\s-]*ring/i],                              x: 0.67, y: 0.55 },
    { id: 'prox_pinky',  patterns: [/(pinky|little)[_.\s-]*(01?|prox)/i, /prox[_.\s-]*(pinky|little)/i],          x: 0.82, y: 0.61 },
    { id: 'mid_thumb',   patterns: [/thumb[_.\s-]*(02?|inter|mid)/i, /inter[_.\s-]*thumb/i],                       x: 0.10, y: 0.48 },
    { id: 'mid_index',   patterns: [/index[_.\s-]*(02?|inter|mid)/i, /inter[_.\s-]*index/i],                       x: 0.32, y: 0.40 },
    { id: 'mid_mid',     patterns: [/midd?l?e?[_.\s-]*(02?|inter|mid(?!dle))/i, /inter[_.\s-]*midd?l?e?/i],      x: 0.50, y: 0.37 },
    { id: 'mid_ring',    patterns: [/ring[_.\s-]*(02?|inter|mid)/i, /inter[_.\s-]*ring/i],                         x: 0.67, y: 0.40 },
    { id: 'mid_pinky',   patterns: [/(pinky|little)[_.\s-]*(02?|inter|mid)/i, /inter[_.\s-]*(pinky|little)/i],    x: 0.82, y: 0.47 },
    { id: 'dist_thumb',  patterns: [/thumb[_.\s-]*(03?|dist|tip)/i, /dist[_.\s-]*thumb/i],                         x: 0.07, y: 0.34 },
    { id: 'dist_index',  patterns: [/index[_.\s-]*(03?|dist|tip)/i, /dist[_.\s-]*index/i],                         x: 0.32, y: 0.25 },
    { id: 'dist_mid',    patterns: [/midd?l?e?[_.\s-]*(03?|dist|tip)/i, /dist[_.\s-]*midd?l?e?/i],               x: 0.50, y: 0.22 },
    { id: 'dist_ring',   patterns: [/ring[_.\s-]*(03?|dist|tip)/i, /dist[_.\s-]*ring/i],                           x: 0.67, y: 0.24 },
    { id: 'dist_pinky',  patterns: [/(pinky|little)[_.\s-]*(03?|dist|tip)/i, /dist[_.\s-]*(pinky|little)/i],      x: 0.82, y: 0.33 },
  ];

  const DIAGRAM_EDGES = [
    ['wrist','meta_thumb'],['wrist','meta_index'],['wrist','meta_mid'],
    ['wrist','meta_ring'], ['wrist','meta_pinky'],
    ['meta_thumb','prox_thumb'],['meta_index','prox_index'],['meta_mid','prox_mid'],
    ['meta_ring','prox_ring'],  ['meta_pinky','prox_pinky'],
    ['prox_thumb','mid_thumb'], ['prox_index','mid_index'], ['prox_mid','mid_mid'],
    ['prox_ring','mid_ring'],   ['prox_pinky','mid_pinky'],
    ['mid_thumb','dist_thumb'], ['mid_index','dist_index'], ['mid_mid','dist_mid'],
    ['mid_ring','dist_ring'],   ['mid_pinky','dist_pinky'],
    ['meta_index','meta_mid'],['meta_mid','meta_ring'],['meta_ring','meta_pinky'],
  ];

  // diagram node id → global bone index
  let nodeToGlobalIdx = {};

  function matchBoneToNode(boneName) {
    // Primary: pattern matching
    for (const node of DIAGRAM_NODES) {
      for (const pat of node.patterns) {
        if (pat.test(boneName)) return node.id;
      }
    }
    // Fallback: loose keyword matching for unconventional naming
    const n = boneName.toLowerCase();
    if (/wrist/.test(n)) return 'wrist';
    const fingerMap = { thumb:'thumb', index:'index', middle:'mid', ring:'ring', pinky:'pinky', little:'pinky' };
    let finger = null;
    for (const [k,v] of Object.entries(fingerMap)) { if (n.includes(k)) { finger = v; break; } }
    if (!finger) return null;
    // Extract trailing number — grab full integer (handles _01, _02, _1, _2, _03 etc.)
    const numMatch = n.match(/[_.\s-]0*(\d+)\s*$/);
    const num = numMatch ? parseInt(numMatch[1]) : null;
    if (num === 0) return `meta_${finger}`;
    if (num === 1) return `prox_${finger}`;
    if (num === 2) return `mid_${finger}`;
    if (num === 3) return `dist_${finger}`;
    // Keyword fallbacks when no number found
    if (/meta|mcp/.test(n))              return `meta_${finger}`;
    if (/prox/.test(n))                  return `prox_${finger}`;
    if (/inter|mid(?!dle)/.test(n))      return `mid_${finger}`;
    if (/dist|tip/.test(n))              return `dist_${finger}`;
    return null;
  }

  // ── Diagram canvas ────────────────────────────────────────
  let diagCanvas = null;
  let diagCtx    = null;

  function initDiagram() {
    diagCanvas = document.getElementById('skel-diagram');
    if (!diagCanvas) return;
    diagCtx = diagCanvas.getContext('2d');
    resizeDiagram();
    new ResizeObserver(resizeDiagram).observe(diagCanvas.parentElement);
    diagCanvas.addEventListener('click', onDiagramClick);
    diagCanvas.addEventListener('mousemove', onDiagramHover);
    diagCanvas.addEventListener('mouseleave', () => {
      diagCanvas.style.cursor = 'default';
      const hoverEl = document.getElementById('skel-diagram-bone-hover');
      if (hoverEl) hoverEl.textContent = '';
    });
  }

  function resizeDiagram() {
    if (!diagCanvas) return;
    const s = diagCanvas.parentElement.clientWidth;
    diagCanvas.width  = s;
    diagCanvas.height = Math.round(s * 1.08);
    drawDiagram();
  }

  function nodePixel(node) {
    const PAD = 16;
    const w = diagCanvas.width, h = diagCanvas.height;
    return {
      x: PAD + node.x * (w - PAD * 2),
      y: PAD + node.y * (h - PAD * 2),
    };
  }

  function drawDiagram() {
    if (!diagCtx || !diagCanvas) return;
    const w = diagCanvas.width, h = diagCanvas.height;
    diagCtx.clearRect(0, 0, w, h);

    // Draw edges
    DIAGRAM_EDGES.forEach(([aId, bId]) => {
      const a = DIAGRAM_NODES.find(n => n.id === aId);
      const b = DIAGRAM_NODES.find(n => n.id === bId);
      if (!a || !b) return;
      const pa = nodePixel(a), pb = nodePixel(b);
      const aSel = selectedIndices.has(nodeToGlobalIdx[aId]);
      const bSel = selectedIndices.has(nodeToGlobalIdx[bId]);
      diagCtx.beginPath();
      diagCtx.moveTo(pa.x, pa.y);
      diagCtx.lineTo(pb.x, pb.y);
      if (aSel && bSel) {
        diagCtx.strokeStyle = 'rgba(255,102,0,0.55)';
        diagCtx.lineWidth = 2.5;
      } else {
        diagCtx.strokeStyle = 'rgba(0,0,0,0.12)';
        diagCtx.lineWidth = 1.5;
      }
      diagCtx.stroke();
    });

    // Draw nodes
    DIAGRAM_NODES.forEach(node => {
      const p          = nodePixel(node);
      const idx        = nodeToGlobalIdx[node.id];
      const isMapped   = idx !== undefined;
      const isSelected = isMapped && selectedIndices.has(idx);
      const R = isSelected ? 7.5 : 5;

      if (isSelected) {
        // Glow
        const grd = diagCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R + 8);
        grd.addColorStop(0, 'rgba(255,102,0,0.3)');
        grd.addColorStop(1, 'rgba(255,102,0,0)');
        diagCtx.beginPath();
        diagCtx.arc(p.x, p.y, R + 8, 0, Math.PI * 2);
        diagCtx.fillStyle = grd;
        diagCtx.fill();
        // Node
        diagCtx.beginPath();
        diagCtx.arc(p.x, p.y, R, 0, Math.PI * 2);
        diagCtx.fillStyle = '#ff6600';
        diagCtx.fill();
        diagCtx.strokeStyle = '#fff';
        diagCtx.lineWidth = 1.8;
        diagCtx.stroke();
      } else if (isMapped) {
        diagCtx.beginPath();
        diagCtx.arc(p.x, p.y, R, 0, Math.PI * 2);
        diagCtx.fillStyle = '#0a0a0a';
        diagCtx.fill();
        diagCtx.strokeStyle = '#fff';
        diagCtx.lineWidth = 1.2;
        diagCtx.stroke();
      } else {
        // Unmapped placeholder
        diagCtx.beginPath();
        diagCtx.arc(p.x, p.y, R, 0, Math.PI * 2);
        diagCtx.fillStyle = '#d0d0d0';
        diagCtx.fill();
        diagCtx.strokeStyle = '#bbb';
        diagCtx.lineWidth = 1;
        diagCtx.stroke();
      }
    });

    // Hint if no bones matched
    if (!Object.keys(nodeToGlobalIdx).length && allBones.length > 0) {
      diagCtx.fillStyle = 'rgba(0,0,0,0.3)';
      diagCtx.font = '10px DM Mono, monospace';
      diagCtx.textAlign = 'center';
      diagCtx.fillText('Bone names not recognised', w / 2, h / 2 - 8);
      diagCtx.fillText('Use the list below to select', w / 2, h / 2 + 10);
    }
  }

  function hitNode(px, py) {
    for (const node of DIAGRAM_NODES) {
      const p = nodePixel(node);
      if (Math.hypot(px - p.x, py - p.y) < 12) return node;
    }
    return null;
  }

  function canvasXY(e) {
    const rect = diagCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (diagCanvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (diagCanvas.height / rect.height),
    };
  }

  function onDiagramClick(e) {
    const { x, y } = canvasXY(e);
    const node = hitNode(x, y);
    if (!node) return;
    const idx = nodeToGlobalIdx[node.id];
    if (idx === undefined) return;
    const entry = allBones[idx];
    const el    = document.querySelector(`.bone-item[data-bone-idx="${idx}"]`);
    const chk   = el ? el.querySelector('.bone-chk') : null;
    toggleBone(idx, entry, el, chk);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function onDiagramHover(e) {
    if (!diagCanvas) return;
    const { x, y } = canvasXY(e);
    const node = hitNode(x, y);
    const idx  = node ? nodeToGlobalIdx[node.id] : undefined;
    diagCanvas.style.cursor = idx !== undefined ? 'pointer' : 'default';
    const hoverEl = document.getElementById('skel-diagram-bone-hover');
    if (hoverEl) hoverEl.textContent = idx !== undefined ? allBones[idx].name : '';
  }

  // ── Init ─────────────────────────────────────────────────
  function init(model) {
    allBones = [];
    selectedIndices.clear();
    primaryIndex = -1;
    highlightMeshes.clear();
    nodeToGlobalIdx = {};
    const seen = new Set();

    // Pass 1: skinned mesh skeletons
    model.traverse(n => {
      if (n.isSkinnedMesh && n.skeleton) {
        n.skeleton.bones.forEach(bone => {
          if (!seen.has(bone.uuid)) {
            seen.add(bone.uuid);
            allBones.push({ bone, name: bone.name || ('bone_' + allBones.length), origRot: bone.rotation.clone() });
          }
        });
      }
    });

    // Pass 2: named bone-like nodes
    if (allBones.length === 0) {
      model.traverse(n => {
        if (n.isBone || (n.name && /bone|joint|finger|palm|wrist|thumb|index|middle|ring|pinky|carpal|phalanx/i.test(n.name))) {
          if (!seen.has(n.uuid)) {
            seen.add(n.uuid);
            allBones.push({ bone: n, name: n.name || ('node_' + allBones.length), origRot: n.rotation.clone() });
          }
        }
      });
    }

    // Pass 3: any non-mesh named nodes
    if (allBones.length === 0) {
      model.traverse(n => {
        if (n !== model && n.name && !n.isMesh && !n.isLight && !n.isCamera) {
          if (!seen.has(n.uuid)) {
            seen.add(n.uuid);
            allBones.push({ bone: n, name: n.name, origRot: n.rotation.clone() });
          }
        }
      });
    }

    // Build node → bone index map
    allBones.forEach((entry, idx) => {
      const nodeId = matchBoneToNode(entry.name);
      if (nodeId && !(nodeId in nodeToGlobalIdx)) {
        nodeToGlobalIdx[nodeId] = idx;
      }
    });

    const visible = allBones.filter(b => !HIDDEN_BONES.has(b.name));
    if (visible.length === 0) document.getElementById('no-bones-msg').style.display = 'block';
    else renderList(visible);

    bindControls();
    initDiagram();
  }

  // ── List rendering with checkboxes ───────────────────────
  function renderList(bones) {
    const list = document.getElementById('bone-list');
    list.innerHTML = '';
    if (!bones.length) { document.getElementById('no-bones-msg').style.display = 'block'; return; }
    document.getElementById('no-bones-msg').style.display = 'none';

    bones.forEach(b => {
      const globalIdx  = allBones.indexOf(b);
      const isSelected = selectedIndices.has(globalIdx);

      const el = document.createElement('div');
      el.className = 'bone-item' + (isSelected ? ' selected' : '');
      el.dataset.boneIdx = globalIdx;

      const chkWrap = document.createElement('span');
      chkWrap.className = 'bone-chk' + (isSelected ? ' checked' : '');
      chkWrap.innerHTML = isSelected
        ? `<svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1.5,4.5 3.5,7 7.5,2" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : '';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'bone-item-name';
      nameSpan.textContent = b.name;
      nameSpan.title = b.name;

      el.appendChild(chkWrap);
      el.appendChild(nameSpan);
      el.addEventListener('click', () => toggleBone(globalIdx, b, el, chkWrap));
      list.appendChild(el);
    });

    updateSelectionInfo();
  }

  // ── Toggle bone selection ─────────────────────────────────
  function toggleBone(globalIdx, entry, el, chkWrap) {
    if (selectedIndices.has(globalIdx)) {
      selectedIndices.delete(globalIdx);
      setHighlight(globalIdx, false);
      if (el) el.classList.remove('selected');
      if (chkWrap) { chkWrap.classList.remove('checked'); chkWrap.innerHTML = ''; }
      if (primaryIndex === globalIdx)
        primaryIndex = selectedIndices.size ? [...selectedIndices].at(-1) : -1;
    } else {
      selectedIndices.add(globalIdx);
      setHighlight(globalIdx, true);
      if (el) el.classList.add('selected');
      if (chkWrap) {
        chkWrap.classList.add('checked');
        chkWrap.innerHTML = `<svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1.5,4.5 3.5,7 7.5,2" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      }
      primaryIndex = globalIdx;
    }
    updateSelectionInfo();
    if (primaryIndex >= 0) syncSliders(allBones[primaryIndex]);
    else clearSliders();
    drawDiagram();
  }

  function updateSelectionInfo() {
    const count = selectedIndices.size;
    const nameEl = document.getElementById('bone-name-display');
    const unselectAllBtn = document.getElementById('bone-unselect-all-btn');

    if (count === 0)      nameEl.textContent = '— select a bone —';
    else if (count === 1) nameEl.textContent = allBones[primaryIndex].name;
    else                  nameEl.textContent = count + ' bones selected';

    unselectAllBtn.disabled = count === 0;
    const badge = document.getElementById('panel-head-badge');
    if (count > 0) { badge.style.display = 'block'; badge.textContent = count + ' selected'; }
    else badge.style.display = 'none';
  }

  function syncSliders(entry) {
    const rot = entry.bone.rotation;
    ['x','y','z'].forEach(ax => {
      const deg = Math.round(rot[ax] / DEG);
      document.getElementById('bone-r' + ax).value = deg;
      document.getElementById('bone-r' + ax + '-val').textContent = deg + '°';
    });
  }

  function clearSliders() {
    ['x','y','z'].forEach(ax => {
      document.getElementById('bone-r' + ax).value = 0;
      document.getElementById('bone-r' + ax + '-val').textContent = '0°';
    });
  }

  // ── Controls ─────────────────────────────────────────────
  function bindControls() {
    ['x','y','z'].forEach(ax => {
      document.getElementById('bone-r' + ax).addEventListener('input', (e) => {
        if (primaryIndex < 0) return;
        const deg = parseFloat(e.target.value);
        document.getElementById('bone-r' + ax + '-val').textContent = deg + '°';
        selectedIndices.forEach(i => { allBones[i].bone.rotation[ax] = deg * DEG; });
      });
    });

    document.getElementById('bone-reset-btn').addEventListener('click', () => {
      selectedIndices.forEach(i => { allBones[i].bone.rotation.copy(allBones[i].origRot); });
      if (primaryIndex >= 0) syncSliders(allBones[primaryIndex]);
    });

    document.getElementById('bone-reset-all-btn').addEventListener('click', () => {
      allBones.forEach(e => e.bone.rotation.copy(e.origRot));
      if (primaryIndex >= 0) syncSliders(allBones[primaryIndex]);
    });

    document.getElementById('bone-unselect-all-btn').addEventListener('click', () => {
      selectedIndices.forEach(i => setHighlight(i, false));
      selectedIndices.clear();
      primaryIndex = -1;
      document.querySelectorAll('.bone-item').forEach(el => {
        el.classList.remove('selected');
        const chk = el.querySelector('.bone-chk');
        if (chk) { chk.classList.remove('checked'); chk.innerHTML = ''; }
      });
      updateSelectionInfo();
      clearSliders();
      drawDiagram();
    });

    document.getElementById('bone-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const base = allBones.filter(b => !HIDDEN_BONES.has(b.name));
      renderList(q ? base.filter(b => b.name.toLowerCase().includes(q)) : base);
    });
  }

  return { init };
})();