// scene-controls.js — binds the Scene and Colors panel UI to Three.js
const SCENE_CONTROLS = (() => {
  const DEFAULTS = {
    bgColor: '#ffffff', exposure: 1.1,
    keyColor: '#fff5e8', keyIntensity: 1.4,
    fillColor: '#e8f0ff', fillIntensity: 0.5,
    ambColor: '#ffffff',  ambIntensity: 0.6,
  };

  function bindColor(inputId, swatchId, onChange) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => {
      document.getElementById(swatchId).style.background = el.value;
      onChange(el.value);
    });
  }

  function bindSlider(inputId, labelId, onChange) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      document.getElementById(labelId).textContent = v.toFixed(2).replace(/\.?0+$/, '') || '0';
      onChange(v);
    });
  }

  // Standard Scene Controls (Background, Lights, Exposure)
  function init(renderer, scene, lights) {
    const { ambLight, keyLight, fillLight } = lights;

    bindColor('bg-color', 'bg-swatch', hex => {
      const c = new THREE.Color(hex);
      scene.background = c;
      renderer.setClearColor(c, 1);
      document.documentElement.style.setProperty('--bg', hex);
    });

    bindSlider('exposure', 'exposure-val', v => { renderer.toneMappingExposure = v; });
    bindColor('key-color',  'key-swatch',  hex => { keyLight.color.set(hex); });
    bindSlider('key-intensity',  'key-val',  v => { keyLight.intensity = v; });
    bindColor('fill-color', 'fill-swatch', hex => { fillLight.color.set(hex); });
    bindSlider('fill-intensity', 'fill-val', v => { fillLight.intensity = v; });
    bindColor('amb-color',  'amb-swatch',  hex => { ambLight.color.set(hex); });
    bindSlider('amb-intensity',  'amb-val',  v => { ambLight.intensity = v; });

    document.getElementById('scene-reset-btn').addEventListener('click', () => {
      const d = DEFAULTS;
      document.getElementById('bg-color').value = d.bgColor;
      document.getElementById('bg-swatch').style.background = d.bgColor;
      const c = new THREE.Color(d.bgColor); scene.background = c; renderer.setClearColor(c, 1);
      document.documentElement.style.setProperty('--bg', d.bgColor);
      document.getElementById('exposure').value = d.exposure;
      document.getElementById('exposure-val').textContent = d.exposure;
      renderer.toneMappingExposure = d.exposure;
      // ... reset light values similarly ...
    });
  }

  // New Design/Color Controls
  function initDesignControls(getOpacitySetter, getColorSetter) {
    // Opacity Slider for the Colors Panel
    bindSlider('design-opacity', 'design-opacity-val', v => {
      const setter = getOpacitySetter();
      if (setter) setter(v);
    });
  }

  return { init, initDesignControls };
})();