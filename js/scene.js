// scene.js — Three.js renderer, camera, lights, shadow plane, model loader

const SCENE = (() => {
  const canvas = document.getElementById('canvas');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xffffff, 1);
  renderer.physicallyCorrectLights = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.001, 1000);

  // Lights
  const ambLight  = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambLight);

  const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.4);
  keyLight.position.set(2, 4, 3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xe8f0ff, 0.5);
  fillLight.position.set(-3, 1, -2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
  rimLight.position.set(0, -2, -3);
  scene.add(rimLight);

  const hemi = new THREE.HemisphereLight(0xddeeff, 0xffeedd, 0.4);
  scene.add(hemi);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.08 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  // Camera orbit state
  let theta = 0.4, phi = 1.3, radius = 1.5;
  const target = new THREE.Vector3();
  let defaultTheta, defaultPhi, defaultRadius;

  function updateCamera() {
    camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(target);
  }

  function resetCamera() {
    theta = defaultTheta; phi = defaultPhi; radius = defaultRadius;
    updateCamera();
  }

  function zoomBy(d) {
    radius = Math.max(radius * 0.05, Math.min(radius * 20, radius + d * radius));
    updateCamera();
  }

  // Resize
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(document.body);
  resize();

  // Render loop
  function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }
  animate();

  // Load model
  function loadModel(onLoaded) {
    if (!THREE.GLTFLoader) { setTimeout(() => loadModel(onLoaded), 100); return; }
    const loader = new THREE.GLTFLoader();
    const bar = document.getElementById('load-bar');

    loader.load('assets/hand.glb',
      (gltf) => {
        const model = gltf.scene;
        model.traverse(n => {
          if (!n.isMesh) return;
          n.castShadow = true; n.receiveShadow = true;
          const mat = n.material; if (!mat) return;
          if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
            if (mat.roughness === 0 && mat.metalness === 0) { mat.roughness = 0.5; mat.metalness = 0.0; }
            mat.envMapIntensity = 1.0; mat.needsUpdate = true;
          }
          if (mat.isMeshBasicMaterial || mat.isMeshLambertMaterial) {
            n.material = new THREE.MeshStandardMaterial({
              color: mat.color || new THREE.Color(0xcccccc),
              map: mat.map || null, roughness: 0.6, metalness: 0.05,
            });
          }
          n.material.side = THREE.FrontSide;
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 1.0 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        const box2 = new THREE.Box3().setFromObject(model);
        shadowPlane.position.y = box2.min.y - 0.001;
        scene.add(model);

        const box3 = new THREE.Box3().setFromObject(model);
        const size3 = box3.getSize(new THREE.Vector3());
        const center3 = box3.getCenter(new THREE.Vector3());
        target.copy(center3);
        radius = size3.length() * 1.1;
        defaultTheta = theta; defaultPhi = phi; defaultRadius = radius;
        updateCamera();

        let tris = 0;
        model.traverse(n => {
          if (n.isMesh && n.geometry.index) tris += n.geometry.index.count / 3;
          else if (n.isMesh && n.geometry.attributes.position) tris += n.geometry.attributes.position.count / 3;
        });
        document.getElementById('poly-count').textContent = Math.round(tris).toLocaleString() + ' tris';

        bar.style.width = '100%';
        setTimeout(() => { document.getElementById('loading').classList.add('hidden'); }, 400);

        onLoaded(model, gltf);
      },
      (xhr) => { if (xhr.total) bar.style.width = (xhr.loaded / xhr.total * 90) + '%'; },
      (err) => {
        console.error(err);
        document.getElementById('loading').style.display = 'none';
        const el = document.getElementById('error');
        el.style.display = 'flex';
        document.getElementById('error-msg').textContent =
          'Could not load assets/hand.glb — make sure the file is in the assets/ folder.';
      }
    );
  }

  // Mehendi overlay setup (called after model loads)
  function setupMehendiOverlay(model) {
    const uvOffscreen = document.createElement('canvas');
    uvOffscreen.width = 1024; uvOffscreen.height = 1024;
    const uvOffCtx = uvOffscreen.getContext('2d');
    const mehendiTex = new THREE.CanvasTexture(uvOffscreen);
    mehendiTex.encoding = THREE.sRGBEncoding;
    const mehendiUniforms = [];

    model.traverse(n => {
      if (!n.isMesh) return;
      const origMat = n.material; if (!origMat) return;
      // Clone the material so we get a fresh (uncompiled) instance,
      // preserving all textures/properties, then inject the mehendi shader
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

    return {
      texture: mehendiTex,
      ctx: uvOffCtx,
      setOpacity: (v) => mehendiUniforms.forEach(u => { u.mehendiOpacity.value = v; }),
      setColor: (c) => mehendiUniforms.forEach(u => { u.mehendiColor.value = c; })
    };
  }

  // Extract UV edges for wireframe preview
  function extractUVEdges(model) {
    const uvEdges = [];
    model.traverse(n => {
      if (!n.isMesh) return;
      const geo = n.geometry;
      const uvAttr = geo.attributes.uv;
      if (!uvAttr) return;
      const idx = geo.index;
      if (idx) {
        const arr = idx.array;
        for (let i = 0; i < arr.length; i += 3) {
          const a = arr[i], b = arr[i+1], c = arr[i+2];
          uvEdges.push([uvAttr.getX(a), uvAttr.getY(a), uvAttr.getX(b), uvAttr.getY(b)]);
          uvEdges.push([uvAttr.getX(b), uvAttr.getY(b), uvAttr.getX(c), uvAttr.getY(c)]);
          uvEdges.push([uvAttr.getX(c), uvAttr.getY(c), uvAttr.getX(a), uvAttr.getY(a)]);
        }
      } else {
        for (let i = 0; i < uvAttr.count; i += 3) {
          uvEdges.push([uvAttr.getX(i),   uvAttr.getY(i),   uvAttr.getX(i+1), uvAttr.getY(i+1)]);
          uvEdges.push([uvAttr.getX(i+1), uvAttr.getY(i+1), uvAttr.getX(i+2), uvAttr.getY(i+2)]);
          uvEdges.push([uvAttr.getX(i+2), uvAttr.getY(i+2), uvAttr.getX(i),   uvAttr.getY(i)]);
        }
      }
    });
    return uvEdges;
  }

  return {
    renderer, scene, camera, canvas,
    lights: { ambLight, keyLight, fillLight },
    updateCamera, resetCamera, zoomBy,
    theta: () => theta, phi: () => phi,
    setTheta: (v) => { theta = v; }, setPhi: (v) => { phi = v; },
    getRadius: () => radius, setRadius: (v) => { radius = v; },
    getTarget: () => target,
    loadModel, setupMehendiOverlay, extractUVEdges,
  };
})();