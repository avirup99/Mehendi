// model-loader.js — Custom model upload panel
// Lets users drop/upload any .glb or .gltf and hot-swap it into the scene.
// Calls back into main.js via MODEL_LOADER.onModelSwap so UV_DESIGNER,
// DRAW, DRAW3D, SKELETON all get re-initialised with the new model.
// Zero changes to existing modules required.

const MODEL_LOADER = (() => {

  let _onSwap = null; // set by main.js: function(model, gltf) { ... }

  // ── Public: called from main.js to register the swap callback ──
  function setSwapCallback(fn) { _onSwap = fn; }

  // ── Model history (session only) ──────────────────────────
  let _history = []; // { name, url, objectUrl, thumb }
  const MAX_HIST = 8;

  // ── State ─────────────────────────────────────────────────
  let _loading = false;
  let _currentName = 'hand.glb'; // default built-in

  // ── Thumbnail generation via offscreen Three.js render ────
  function _generateThumb(model, gltf, callback) {
    try {
      const size = 128;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = offCanvas.height = size;
      const offRenderer = new THREE.WebGLRenderer({ canvas: offCanvas, antialias: true, alpha: true });
      offRenderer.setSize(size, size);
      offRenderer.setClearColor(0x000000, 0);
      offRenderer.outputEncoding = THREE.sRGBEncoding;

      const offScene = new THREE.Scene();
      const offCam = new THREE.PerspectiveCamera(45, 1, 0.001, 1000);

      // Clone lights
      offScene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const dl = new THREE.DirectionalLight(0xffffff, 1.2);
      dl.position.set(2, 3, 2);
      offScene.add(dl);

      // Clone model for thumbnail
      const clone = model.clone();
      const box = new THREE.Box3().setFromObject(clone);
      const size3 = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 1.0 / Math.max(size3.x, size3.y, size3.z);
      clone.scale.setScalar(scale);
      clone.position.sub(center.multiplyScalar(scale));
      offScene.add(clone);

      // Position camera
      const box2 = new THREE.Box3().setFromObject(clone);
      const size2 = box2.getSize(new THREE.Vector3());
      const center2 = box2.getCenter(new THREE.Vector3());
      const dist = size2.length() * 1.3;
      offCam.position.set(center2.x + dist * 0.6, center2.y + dist * 0.4, center2.z + dist * 0.8);
      offCam.lookAt(center2);

      offRenderer.render(offScene, offCam);
      const thumb = offCanvas.toDataURL('image/png');
      offRenderer.dispose();
      callback(thumb);
    } catch (e) {
      callback(null);
    }
  }

  // ── Load a model from a URL (objectURL or path) ───────────
  function _loadUrl(url, name, thumb, fromHistory) {
    if (_loading) return;
    _loading = true;
    _setStatus('loading', 'Loading ' + name + '…');
    _setProgress(0);

    if (!THREE.GLTFLoader) {
      _setStatus('error', 'GLTFLoader not ready yet. Try again in a moment.');
      _loading = false;
      return;
    }

    const loader = new THREE.GLTFLoader();
    if (THREE.DRACOLoader) {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
      loader.setDRACOLoader(draco);
    }

    loader.load(url, (gltf) => {
      _loading = false;
      _setProgress(100);
      _currentName = name;
      document.getElementById('ml-current-name').textContent = name;

      const model = gltf.scene;

      // Patch materials
      model.traverse(n => {
        if (!n.isMesh) return;
        n.castShadow = true; n.receiveShadow = true;
        const mat = n.material; if (!mat) return;
        if (mat.isMeshBasicMaterial || mat.isMeshLambertMaterial) {
          n.material = new THREE.MeshStandardMaterial({
            color: mat.color || new THREE.Color(0xcccccc),
            map: mat.map || null, roughness: 0.6, metalness: 0.05,
          });
        }
        if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
          if (mat.roughness === 0 && mat.metalness === 0) { mat.roughness = 0.5; }
          mat.envMapIntensity = 1.0; mat.needsUpdate = true;
        }
        n.material.side = THREE.FrontSide;
      });

      // Generate thumb if not provided
      if (!thumb) {
        _generateThumb(model, gltf, (t) => {
          if (!fromHistory) _addHistory(name, url, t);
          _renderHistory();
        });
      } else {
        if (!fromHistory) _addHistory(name, url, thumb);
        _renderHistory();
      }

      _setStatus('ok', 'Model loaded');
      setTimeout(() => _setStatus('idle', ''), 2500);

      if (_onSwap) _onSwap(model, gltf);
    },
    (xhr) => {
      if (xhr.total) _setProgress(xhr.loaded / xhr.total * 90);
    },
    (err) => {
      _loading = false;
      console.error('Model load error:', err);
      _setStatus('error', 'Failed to load model. Check format (.glb/.gltf).');
    });
  }

  // ── History ───────────────────────────────────────────────
  function _addHistory(name, url, thumb) {
    _history = _history.filter(h => h.name !== name);
    _history.unshift({ name, url, thumb, date: Date.now() });
    if (_history.length > MAX_HIST) {
      // Revoke old object URLs to free memory
      const removed = _history.splice(MAX_HIST);
      removed.forEach(h => { if (h.url && h.url.startsWith('blob:')) URL.revokeObjectURL(h.url); });
    }
  }

  function _fmtDate(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    return Math.floor(diff / 3600000) + 'h ago';
  }

  function _renderHistory() {
    const list  = document.getElementById('ml-history-list');
    const empty = document.getElementById('ml-history-empty');
    if (!list) return;
    list.querySelectorAll('.ml-hist-item').forEach(el => el.remove());
    if (!_history.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    _history.forEach(entry => {
      const el = document.createElement('div');
      el.className = 'ml-hist-item';

      const thumb = document.createElement('div');
      thumb.className = 'ml-hist-thumb';
      if (entry.thumb) {
        thumb.style.backgroundImage = `url(${entry.thumb})`;
        thumb.style.backgroundSize = 'cover';
        thumb.style.backgroundPosition = 'center';
      } else {
        thumb.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2l3 5H5L8 2zM3 9h10l-2 5H5L3 9z" stroke="currentColor" stroke-width="1" fill="none" opacity="0.4"/></svg>`;
        thumb.style.display = 'flex'; thumb.style.alignItems = 'center'; thumb.style.justifyContent = 'center';
      }

      const info = document.createElement('div');
      info.className = 'ml-hist-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'ml-hist-name'; nameEl.textContent = entry.name; nameEl.title = entry.name;
      const dateEl = document.createElement('div');
      dateEl.className = 'ml-hist-date'; dateEl.textContent = _fmtDate(entry.date);
      info.appendChild(nameEl); info.appendChild(dateEl);

      const loadBtn = document.createElement('button');
      loadBtn.className = 'ml-hist-load'; loadBtn.textContent = '↺'; loadBtn.title = 'Reload this model';
      loadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _loadUrl(entry.url, entry.name, entry.thumb, true);
      });

      el.appendChild(thumb); el.appendChild(info); el.appendChild(loadBtn);
      el.addEventListener('click', () => _loadUrl(entry.url, entry.name, entry.thumb, true));
      list.appendChild(el);
    });
  }

  // ── Status / progress helpers ─────────────────────────────
  function _setStatus(type, msg) {
    const el = document.getElementById('ml-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'ml-status ml-status-' + type;
  }

  function _setProgress(pct) {
    const bar = document.getElementById('ml-progress-bar');
    if (!bar) return;
    bar.style.width = pct + '%';
    bar.parentElement.style.display = pct > 0 && pct < 100 ? '' : 'none';
  }

  // ── Drop zone ─────────────────────────────────────────────
  function _bindDropZone() {
    const zone = document.getElementById('ml-dropzone');
    const input = document.getElementById('ml-file-input');
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('ml-drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('ml-drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('ml-drag-over');
      const file = e.dataTransfer.files[0];
      if (file) _handleFile(file);
    });

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) _handleFile(file);
      e.target.value = '';
    });
  }

  function _handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['glb', 'gltf'].includes(ext)) {
      _setStatus('error', 'Only .glb and .gltf files are supported.');
      return;
    }
    const url = URL.createObjectURL(file);
    const name = file.name;
    _loadUrl(url, name, null, false);
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    _bindDropZone();
    _renderHistory();
    _setStatus('idle', '');
    _setProgress(0);

    const clearBtn = document.getElementById('ml-history-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      _history.forEach(h => { if (h.url && h.url.startsWith('blob:')) URL.revokeObjectURL(h.url); });
      _history = [];
      _renderHistory();
    });

    const restoreBtn = document.getElementById('ml-restore-btn');
    if (restoreBtn) restoreBtn.addEventListener('click', () => {
      _loadUrl('assets/hand.glb', 'hand.glb', null, false);
    });
  }

  return { init, setSwapCallback };
})();