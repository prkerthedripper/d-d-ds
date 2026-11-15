// ---------------------------------------------------------------- three.js

let three = null;
let canvas = null;
let overlay = null;
let stageEl = null;
let raf = 0;
let cells = [];
let cellIndex = new Map();
let lastSig = '';
let needsFit = true;
let selectedRing = null;
let hoverRing = null;
let tileBody = null;
let tileGroup = null;
let overlayItems = [];
let hovered = null;
let keyLight = null;
let ocean = null;
let foamMaterial = null;
let rebuildTimer = 0;
let assetState = 'idle';

const WATER_Y = -0.16;
const SQRT3 = Math.sqrt(3);
const MAX_TREES = 1600;
const MAX_GROUND = 2400;

const camera = { target: new THREE.Vector3(0, 0.35, 0), dist: 22, want: 22, azimuth: -Math.PI / 4, polar: 0.94 };
const pointer = { down: false, moved: false, x: 0, y: 0, button: 0, mode: '', id: null, stroke: null, draggingLabel: null };
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const GROUND_KEYS = {
  grass: 'grass', forest: 'forest', beach: 'sand', urban: 'concrete',
  road: 'asphalt', dirt: 'dirt', mountain: 'rock',
};
const GROUND_TINTS = {
  grass: '#a8b995', forest: '#849a7c', beach: '#ddc99f', urban: '#aeb0aa',
  road: '#8e9499', dirt: '#b3a087', mountain: '#a7a79f',
};
const MODEL_DEFS = [
  { id: 'leafy1', file: '/assets/world/models/leafy-tree-01.glb', height: 3.15, wind: true, shadow: true },
  { id: 'leafy2', file: '/assets/world/models/leafy-tree-02.glb', height: 2.8, wind: true, shadow: true },
  { id: 'conifer', file: '/assets/world/models/conifer-01.glb', height: 3.35, wind: true, shadow: true },
  { id: 'grass', file: '/assets/world/models/grass-clump-01.glb', height: 0.52, wind: true, shadow: false },
  { id: 'fern', file: '/assets/world/models/fern-01.glb', height: 0.58, wind: true, shadow: false },
  { id: 'boulder', file: '/assets/world/models/boulder-01.glb', height: 0.48, wind: false, shadow: false },
];

const modelTemplates = new Map();
const groundMaterials = new Map();
const groundTextures = {};
const windMaterials = [];
let textureLoader = null;

const hash2 = (q, r, salt = 0) => {
  const v = Math.sin(q * 127.1 + r * 311.7 + salt * 74.7) * 43758.5453123;
  return v - Math.floor(v);
};

function visualOf(tile) {
  if (!tile?.terrain) return 'grass';
  return TERRAINS[tile.terrain]?.visual || 'grass';
}

const tileColor = (tile) => tile?.color || TERRAINS[tile?.terrain]?.color || TERRAINS.grass.color;

function elevation(tile) {
  if (!tile) return 0.34;
  const visual = visualOf(tile);
  if (visual === 'water') return WATER_Y;
  const base = {
    beach: 0.13, grass: 0.34, forest: 0.4, urban: 0.3,
    dirt: 0.31, road: 0.275, mountain: 0.7,
  }[visual] ?? 0.34;
  const jitter = visual === 'mountain' ? hash2(tile.q, tile.r, 2) * 0.34 : (hash2(tile.q, tile.r, 2) - 0.5) * 0.065;
  const extra = (tile.important ? 0.2 : 0) + (tile.waypoint ? 0.045 : 0);
  return Math.max(WATER_Y + 0.04, base + jitter + extra);
}

function hexPoint(q, r, y = 0) {
  return new THREE.Vector3((q + r / 2) * SQRT3, y, r * 1.5);
}

function mapCenter(map) {
  const cols = map?.cols || 12;
  const rows = map?.rows || 10;
  const maxX = (cols - 1 + (rows > 1 ? 0.5 : 0)) * SQRT3;
  return new THREE.Vector3(maxX / 2, 0, ((rows - 1) * 1.5) / 2);
}

function axialFor(col, row) {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

function cellAt(q, r) {
  return cells[cellIndex.get(keyOf(q, r))] || null;
}

function groundKeyFor(visual) {
  return GROUND_KEYS[visual] || 'grass';
}

function colorOf(value) {
  return new THREE.Color(value);
}

function tileTint(tile) {
  const visual = visualOf(tile);
  const base = colorOf(GROUND_TINTS[visual] || GROUND_TINTS.grass);
  if (tile?.color && /^#[0-9a-f]{6}$/i.test(tile.color)) base.lerp(colorOf(tile.color), 0.28);
  if (tile?.important) base.lerp(colorOf('#d1ae6f'), 0.2);
  if (tile?.terrain === 'supernatural') base.lerp(colorOf('#8066a8'), 0.16);
  return base;
}

function setAssetStatus(text) {
  const el = document.getElementById('world-assets');
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
}

function loadTextureSet(name) {
  const load = (suffix, srgb = false) => {
    const texture = textureLoader.load(`/assets/world/textures/${name}-${suffix}.webp`, undefined, undefined, () => {
      console.warn('[world] missing texture', name, suffix);
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(8, three?.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    return texture;
  };
  return { diffuse: load('diffuse', true), normal: load('normal'), rough: load('arm') };
}

function ensureGroundTextures() {
  if (textureLoader) return;
  textureLoader = new THREE.TextureLoader();
  for (const key of ['grass', 'forest', 'sand', 'asphalt', 'concrete', 'dirt', 'rock']) {
    groundTextures[key] = loadTextureSet(key);
  }
}

function groundMaterial(key) {
  if (groundMaterials.has(key)) return groundMaterials.get(key);
  const texture = groundTextures[key] || groundTextures.grass;
  const material = new THREE.MeshStandardMaterial({
    map: texture.diffuse,
    normalMap: texture.normal,
    roughnessMap: texture.rough,
    roughness: 0.96,
    metalness: 0,
    vertexColors: true,
  });
  material.normalScale.set(0.6, 0.6);
  groundMaterials.set(key, material);
  return material;
}

function windMaterial(material) {
  if (!material || material.userData.worldWind) return material;
  material.userData.worldWind = true;
  const uniform = { value: 0 };
  material.userData.windTime = uniform;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWorldWindTime = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWorldWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float worldSway = sin(uWorldWindTime * 1.05 + position.x * 2.1 + position.z * 1.7) * 0.018;
        worldSway += sin(uWorldWindTime * 0.67 + position.z * 1.3) * 0.011;
        transformed.x += worldSway * smoothstep(0.0, 2.0, transformed.y);
        transformed.z += worldSway * 0.58 * smoothstep(0.0, 2.0, transformed.y);`,
      );
  };
  windMaterials.push(material);
  return material;
}

function prepareModel(gltf, definition) {
  const scene = gltf.scene || gltf.scenes?.[0];
  if (!scene) throw new Error(`Empty model ${definition.id}`);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = definition.height / Math.max(size.y, 0.01);
  const parts = [];

  scene.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    geometry.translate(-center.x, -box.min.y, -center.z);
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingSphere();

    const source = Array.isArray(node.material) ? node.material[0] : node.material;
    if (!source) return;
    const material = source.clone();
    const foliage = definition.wind;
    if (foliage) {
      material.side = THREE.DoubleSide;
      material.alphaTest = Math.max(material.alphaTest || 0, 0.28);
      material.transparent = false;
      material.depthWrite = true;
      material.shadowSide = THREE.DoubleSide;
      windMaterial(material);
    }
    material.aoMap = null;
    material.needsUpdate = true;
    parts.push({ geometry, material });
  });

  return { ...definition, parts };
}

async function loadModelAssets() {
  if (assetState !== 'idle') return;
  assetState = 'loading';
  setAssetStatus('Growing forests…');
  const loader = new GLTFLoader();
  try {
    await Promise.all(MODEL_DEFS.map(async (definition) => {
      const gltf = await loader.loadAsync(definition.file);
      modelTemplates.set(definition.id, prepareModel(gltf, definition));
    }));
    assetState = 'ready';
    setAssetStatus('');
    if (state.page === 'world' && activeMap() && three) buildTiles();
  } catch (error) {
    assetState = 'failed';
    console.error('[world] terrain models failed to load', error);
    setAssetStatus('Ground map ready · 3D trees unavailable');
    setTimeout(() => setAssetStatus(''), 5000);
  }
}

function ensureThree() {
  if (three) return three;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x9ebec7, 1);
  renderer.domElement.className = 'world-canvas';
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D hexagon campaign world');

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb4cbd0, 0.0042);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  cam.position.set(0, 22, 18);

  const hemi = new THREE.HemisphereLight(0xd8eef2, 0x62684d, 1.35);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d7, 3.0);
  sun.position.set(-20, 32, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  scene.add(sun.target);
  keyLight = sun;

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(280, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uSun: { value: new THREE.Vector3(-0.45, 0.55, 0.4).normalize() } },
      vertexShader: 'varying vec3 vSky; void main(){ vSky = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vSky;
        uniform vec3 uSun;
        void main() {
          vec3 d = normalize(vSky);
          float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 horizon = vec3(0.68, 0.78, 0.79);
          vec3 zenith = vec3(0.24, 0.47, 0.63);
          vec3 col = mix(horizon, zenith, smoothstep(0.48, 0.96, h));
          float sun = pow(max(dot(d, normalize(uSun)), 0.0), 240.0);
          col += vec3(1.0, 0.68, 0.35) * sun * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const waterGeo = new THREE.PlaneGeometry(520, 520, 128, 128);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.45, 0.55, 0.4).normalize() },
      uDeep: { value: new THREE.Color('#0b3547') },
      uShallow: { value: new THREE.Color('#2f8293') },
      uSky: { value: new THREE.Color('#bcdbe1') },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vWaveNormal;
      void main() {
        vec3 p = position;
        float t = uTime;
        float w = sin(p.x * 0.32 + t * 0.7) * 0.105;
        w += sin(p.z * 0.24 - t * 0.55) * 0.075;
        w += sin((p.x + p.z) * 0.68 + t * 1.1) * 0.028;
        p.y += w;
        float nx = -cos(p.x * 0.32 + t * 0.7) * 0.105 * 0.32;
        nx -= cos((p.x + p.z) * 0.68 + t * 1.1) * 0.028 * 0.68;
        float nz = -cos(p.z * 0.24 - t * 0.55) * 0.075 * 0.24;
        nz -= cos((p.x + p.z) * 0.68 + t * 1.1) * 0.028 * 0.68;
        vWaveNormal = normalize(vec3(nx, 1.0, nz));
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      varying vec3 vWorld;
      varying vec3 vWaveNormal;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vWaveNormal);
        float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        vec3 col = mix(uDeep, uShallow, 0.34 + fresnel * 0.42);
        col = mix(col, uSky, fresnel * 0.62);
        vec3 halfSun = normalize(normalize(uSunDir) + viewDir);
        float glint = pow(max(dot(n, halfSun), 0.0), 150.0) * 0.9;
        float ripple = sin(vWorld.x * 4.0 + vWorld.z * 2.0) * 0.006;
        gl_FragColor = vec4(col + vec3(glint) + ripple, 1.0);
      }`,
  });
  ocean = new THREE.Mesh(waterGeo, waterMat);
  ocean.position.y = WATER_Y;
  ocean.receiveShadow = true;
  scene.add(ocean);

  tileGroup = new THREE.Group();
  scene.add(tileGroup);

  const ringGeo = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      return new THREE.Vector3(Math.cos(a) * 1.015, 0, Math.sin(a) * 1.015);
    }),
  );
  selectedRing = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({
    color: 0xffd993, transparent: true, opacity: 0.98, depthTest: false,
  }));
  selectedRing.renderOrder = 20;
  selectedRing.visible = false;
  scene.add(selectedRing);

  hoverRing = new THREE.LineLoop(ringGeo.clone(), new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.6, depthTest: false,
  }));
  hoverRing.renderOrder = 20;
  hoverRing.visible = false;
  scene.add(hoverRing);

  const foamGeo = new THREE.BufferGeometry();
  foamMaterial = new THREE.MeshBasicMaterial({
    color: 0xe6f7f2, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide,
  });

  canvas = renderer.domElement;
  overlay = document.createElement('div');
  overlay.className = 'world-overlay';
  overlay.addEventListener('click', onOverlayClick);
  overlay.addEventListener('pointerdown', onOverlayDown);
  overlay.addEventListener('pointermove', onOverlayMove);
  overlay.addEventListener('pointerup', onOverlayUp);
  overlay.addEventListener('pointercancel', onOverlayUp);

  canvas.addEventListener('pointerdown', onCanvasDown);
  canvas.addEventListener('pointermove', onCanvasMove);
  canvas.addEventListener('pointerup', onCanvasUp);
  canvas.addEventListener('pointercancel', onCanvasUp);
  canvas.addEventListener('pointerleave', () => { if (hoverRing) hoverRing.visible = false; });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  three = { renderer, scene, camera: cam, foamGeo };
  ensureGroundTextures();
  loadModelAssets();
  return three;
}

// ---------------------------------------------------------------- procedural terrain

function newBucket() {
  return { position: [], normal: [], uv: [], color: [], index: [] };
}

function addVertex(bucket, x, y, z, nx, ny, nz, u, v, color) {
  bucket.position.push(x, y, z);
  bucket.normal.push(nx, ny, nz);
  bucket.uv.push(u, v);
  bucket.color.push(color.r, color.g, color.b);
  return bucket.position.length / 3 - 1;
}

function addQuad(bucket, a, b, c, d, color, uvs) {
  const nx = (b.z - a.z) * (d.y - a.y) - (b.y - a.y) * (d.z - a.z);
  const ny = (b.x - a.x) * (d.z - a.z) - (b.z - a.z) * (d.x - a.x);
  const nz = (b.y - a.y) * (d.x - a.x) - (b.x - a.x) * (d.y - a.y);
  const len = Math.hypot(nx, ny, nz) || 1;
  const normal = [nx / len, ny / len, nz / len];
  const i0 = addVertex(bucket, a.x, a.y, a.z, ...normal, uvs[0][0], uvs[0][1], color);
  const i1 = addVertex(bucket, b.x, b.y, b.z, ...normal, uvs[1][0], uvs[1][1], color);
  const i2 = addVertex(bucket, c.x, c.y, c.z, ...normal, uvs[2][0], uvs[2][1], color);
  const i3 = addVertex(bucket, d.x, d.y, d.z, ...normal, uvs[3][0], uvs[3][1], color);
  bucket.index.push(i0, i1, i2, i0, i2, i3);
}

function bucketToMesh(bucket, material, { owned = true, castShadow = true } = {}) {
  if (!bucket.position.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.color, 3));
  geometry.setIndex(bucket.index);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.userData.ownedGeometry = owned;
  return mesh;
}

const SIDE_TINT = new THREE.Color('#8a7558');
const SAND_TINT = new THREE.Color('#e0caa2');
const ROAD_MARK = new THREE.Color('#d9c585');

function buildTerrain(map) {
  const buckets = new Map();
  const sideBucket = newBucket();
  const sandBucket = newBucket();
  const roadBucket = newBucket();
  const foam = newBucket();
  const center = mapCenter(map);

  const bucketFor = (key) => {
    if (!buckets.has(key)) buckets.set(key, newBucket());
    return buckets.get(key);
  };

  const edgeDirs = [
    { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 },
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
  ];

  for (const cell of cells) {
    const visual = visualOf(cell.tile);
    const top = cell.elevation;
    const tint = tileTint(cell.tile);
    const shade = 0.88 + hash2(cell.q, cell.r, 9) * 0.18;
    const worldX = cell.x;
    const worldZ = cell.z;

    if (visual === 'water') {
      cell.water = true;
      continue;
    }
    cell.water = false;

    const key = groundKeyFor(visual);
    const bucket = bucketFor(key);
    const yaw = hash2(cell.q, cell.r, 13) * Math.PI * 2;
    const offsetU = hash2(cell.q, cell.r, 17) * 40;
    const offsetV = hash2(cell.q, cell.r, 19) * 40;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const color = tint.clone().multiplyScalar(shade);

    const corners = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const x = worldX + Math.cos(a) * 0.995;
      const z = worldZ + Math.sin(a) * 0.995;
      corners.push({ x, z });
    }

    const uv = (x, z) => [
      (x * cos - z * sin) * 0.29 + offsetU,
      (x * sin + z * cos) * 0.29 + offsetV,
    ];
    const centerIndex = addVertex(bucket, worldX, top, worldZ, 0, 1, 0, ...uv(worldX, worldZ), color);
    const topIndices = corners.map((c) => addVertex(bucket, c.x, top, c.z, 0, 1, 0, ...uv(c.x, c.z), color));
    for (let i = 0; i < 6; i++) {
      bucket.index.push(centerIndex, topIndices[i], topIndices[(i + 1) % 6]);
    }

    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      const dir = edgeDirs[i];
      const neighbor = cellAt(cell.q + dir.q, cell.r + dir.r);
      const nVisual = neighbor ? visualOf(neighbor.tile) : 'water';
      const nTop = neighbor ? neighbor.elevation : WATER_Y;
      const a = corners[i];
      const b = corners[next];

      if (nVisual === 'water' || !neighbor) {
        // A sandy shelf planes down into the sea, with a thin foam edge.
        const outerA = {
          x: worldX + (a.x - worldX) * 1.14,
          z: worldZ + (a.z - worldZ) * 1.14,
        };
        const outerB = {
          x: worldX + (b.x - worldX) * 1.14,
          z: worldZ + (b.z - worldZ) * 1.14,
        };
        const sandA = new THREE.Vector3(a.x, top - 0.012, a.z);
        const sandB = new THREE.Vector3(b.x, top - 0.012, b.z);
        const sandC = new THREE.Vector3(outerB.x, WATER_Y + 0.035, outerB.z);
        const sandD = new THREE.Vector3(outerA.x, WATER_Y + 0.035, outerA.z);
        addQuad(sandBucket, sandA, sandB, sandC, sandD, SAND_TINT, [uv(sandA.x, sandA.z), uv(sandB.x, sandB.z), uv(sandC.x, sandC.z), uv(sandD.x, sandD.z)]);

        const foamA = new THREE.Vector3(
          worldX + (a.x - worldX) * 1.14, WATER_Y + 0.055,
          worldZ + (a.z - worldZ) * 1.14,
        );
        const foamB = new THREE.Vector3(
          worldX + (b.x - worldX) * 1.14, WATER_Y + 0.055,
          worldZ + (b.z - worldZ) * 1.14,
        );
        const foamC = new THREE.Vector3(
          worldX + (a.x - worldX) * 1.25, WATER_Y + 0.03,
          worldZ + (a.z - worldZ) * 1.25,
        );
        const foamD = new THREE.Vector3(
          worldX + (b.x - worldX) * 1.25, WATER_Y + 0.03,
          worldZ + (b.z - worldZ) * 1.25,
        );
        addQuad(foam, foamA, foamB, foamD, foamC, new THREE.Color('#ffffff'), [[0, 0], [1, 0], [1, 1], [0, 1]]);
        continue;
      }

      if (nTop < top - 0.028) {
        const bottom = nTop + 0.012;
        const sideTint = SIDE_TINT.clone().multiplyScalar(0.82 + hash2(cell.q, cell.r, 23) * 0.2);
        const sideA = new THREE.Vector3(a.x, top - 0.018, a.z);
        const sideB = new THREE.Vector3(b.x, top - 0.018, b.z);
        const sideC = new THREE.Vector3(b.x, bottom, b.z);
        const sideD = new THREE.Vector3(a.x, bottom, a.z);
        addQuad(sideBucket, sideA, sideB, sideC, sideD, sideTint, [[0, 1], [1, 1], [1, 0], [0, 0]]);
      }

      if (visual === 'road' && nVisual === 'road' && i < 3) {
        const dx = (a.x - worldX) + (b.x - worldX);
        const dz = (a.z - worldZ) + (b.z - worldZ);
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const start = 0.16;
        const end = 0.82;
        const width = 0.032;
        const p1 = new THREE.Vector3(worldX + (dx / len) * start + nx * width, top + 0.018, worldZ + (dz / len) * start + nz * width);
        const p2 = new THREE.Vector3(worldX + (dx / len) * start - nx * width, top + 0.018, worldZ + (dz / len) * start - nz * width);
        const p3 = new THREE.Vector3(worldX + (dx / len) * end - nx * width, top + 0.018, worldZ + (dz / len) * end - nz * width);
        const p4 = new THREE.Vector3(worldX + (dx / len) * end + nx * width, top + 0.018, worldZ + (dz / len) * end + nz * width);
        addQuad(roadBucket, p1, p2, p3, p4, ROAD_MARK, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
    }
  }

  for (const [key, bucket] of buckets.entries()) {
    const mesh = bucketToMesh(bucket, groundMaterial(key));
    if (mesh) tileGroup.add(mesh);
  }
  const sideMesh = bucketToMesh(sideBucket, groundMaterial('rock'));
  if (sideMesh) tileGroup.add(sideMesh);
  const sandMesh = bucketToMesh(sandBucket, groundMaterial('sand'));
  if (sandMesh) tileGroup.add(sandMesh);

  if (roadBucket.position.length) {
    const roadMesh = bucketToMesh(roadBucket, new THREE.MeshBasicMaterial({ color: 0xddc88b, transparent: true, opacity: 0.72 }), { castShadow: false });
    if (roadMesh) tileGroup.add(roadMesh);
  }

  if (foam.position.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(foam.position, 3));
    geometry.setIndex(foam.index);
    const mesh = new THREE.Mesh(geometry, foamMaterial);
    mesh.userData.ownedGeometry = true;
    tileGroup.add(mesh);
  }
}

function buildVegetation(map) {
  const density = Math.max(0.4, Math.min(1.8, Number(map?.config?.density) || 1));
  const placements = new Map();

  const queue = (type, x, y, z, rot, scale, tint = null) => {
    if (!modelTemplates.has(type)) return;
    const list = placements.get(type) || [];
    const max = type === 'boulder' ? MAX_GROUND : type === 'grass' || type === 'fern' ? MAX_GROUND : MAX_TREES;
    if (list.length >= max) return;
    list.push({ x, y, z, rot, scale, tint });
    placements.set(type, list);
  };

  for (const cell of cells) {
    const visual = visualOf(cell.tile);
    if (visual === 'water') continue;
    const rnd = (() => {
      let seed = ((cell.q + 50) * 374761393 + (cell.r + 50) * 668265263 + Math.round(density * 100) * 1442695040) >>> 0;
      return () => {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    const at = (radius = 0.58) => {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * radius;
      return { x: cell.x + Math.cos(a) * d, z: cell.z + Math.sin(a) * d };
    };
    const addTree = (forcedType = null, forceScale = 1) => {
      const point = at(0.58);
      const roll = rnd();
      const type = forcedType || (roll < 0.42 ? 'leafy1' : roll < 0.73 ? 'leafy2' : 'conifer');
      const tint = new THREE.Color().setHSL(0.24 + rnd() * 0.035, 0.18 + rnd() * 0.15, 0.83 + rnd() * 0.14);
      queue(type, point.x, cell.elevation - 0.025, point.z, rnd() * Math.PI * 2, forceScale * (0.76 + rnd() * 0.46), tint);
    };
    const addCover = (type, count) => {
      for (let i = 0; i < count; i++) {
        const point = at(0.68);
        queue(type, point.x, cell.elevation - 0.01, point.z, rnd() * Math.PI * 2, 0.75 + rnd() * 0.6);
      }
    };
    const addRocks = (count) => {
      for (let i = 0; i < count; i++) {
        const point = at(0.6);
        queue('boulder', point.x, cell.elevation - 0.015, point.z, rnd() * Math.PI * 2, 0.55 + rnd() * 0.75);
      }
    };

    if (visual === 'forest') {
      const trees = Math.max(1, Math.round((1.6 + rnd() * 1.9) * density));
      for (let i = 0; i < trees; i++) addTree();
      addCover('fern', Math.round((1.2 + rnd() * 1.5) * density));
      addCover('grass', Math.round((1.4 + rnd() * 1.8) * density));
      if (rnd() < 0.36) addRocks(1);
    } else if (visual === 'grass') {
      if (rnd() < 0.18 * density) addTree();
      addCover('grass', Math.round((1.5 + rnd() * 2.2) * density));
      if (rnd() < 0.3) addCover('fern', 1);
      if (rnd() < 0.28) addRocks(1);
    } else if (visual === 'mountain') {
      if (rnd() < 0.62 * density) addTree('conifer', 0.9);
      addRocks(1 + Math.round(rnd() * 2 * density));
      if (rnd() < 0.35) addCover('grass', 1);
    } else if (visual === 'beach') {
      if (rnd() < 0.18) addRocks(1);
      if (rnd() < 0.23) addCover('grass', 1);
    } else if (visual === 'dirt') {
      if (rnd() < 0.12 * density) addTree('conifer', 0.7);
      addRocks(rnd() < 0.5 ? 1 : 0);
      if (rnd() < 0.4) addCover('grass', 1);
    } else if (visual === 'urban') {
      if (rnd() < 0.09 * density) addTree(null, 0.8);
      if (rnd() < 0.16) addCover('grass', 1);
    }
  }

  for (const [type, list] of placements.entries()) {
    const template = modelTemplates.get(type);
    if (!template || !list.length) continue;
    for (const part of template.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      mesh.userData.sharedGeometry = true;
      mesh.castShadow = !!template.shadow;
      mesh.receiveShadow = true;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      list.forEach((item, index) => {
        position.set(item.x, item.y, item.z);
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.rot);
        scale.set(item.scale, item.scale, item.scale);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        if (item.tint) mesh.setColorAt(index, item.tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      tileGroup.add(mesh);
    }
  }
}

function clearEnvironment() {
  for (const child of [...tileGroup.children]) {
    tileGroup.remove(child);
    if (child.geometry && !child.userData.sharedGeometry) child.geometry.dispose();
  }
  tileBody = null;
}

function buildTiles() {
  const map = activeMap();
  if (!three || !map) return;
  clearEnvironment();
  cells = [];
  cellIndex = new Map();
  const center = mapCenter(map);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  const count = map.cols * map.rows;
  const pickGeo = new THREE.CylinderGeometry(0.995, 0.995, 0.03, 6, 1);
  pickGeo.rotateY(Math.PI / 6);
  const pick = new THREE.InstancedMesh(
    pickGeo,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    count,
  );
  pick.userData.ownedGeometry = true;
  pick.frustumCulled = false;

  let i = 0;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const { q, r } = axialFor(col, row);
      const tile = tileAt(q, r, map);
      const point = hexPoint(q, r);
      const cell = {
        q, r, col, row, tile,
        x: point.x - center.x,
        z: point.z - center.z,
        elevation: elevation(tile),
      };
      cells.push(cell);
      cellIndex.set(keyOf(q, r), i);
      position.set(cell.x, cell.elevation + 0.015, cell.z);
      matrix.compose(position, quaternion, scale.set(1, 1, 1));
      pick.setMatrixAt(i, matrix);
      i++;
    }
  }
  pick.instanceMatrix.needsUpdate = true;
  pick.computeBoundingSphere();
  tileGroup.add(pick);
  tileBody = pick;

  buildTerrain(map);
  buildVegetation(map);

  updateRings();
  syncOverlay();
}

function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    if (state.page === 'world' && three && activeMap()) buildTiles();
  }, 70);
}

function refreshCell(q, r, { overlay = true } = {}) {
  const i = cellIndex.get(keyOf(q, r));
  if (i === undefined || !three) return;
  const cell = cells[i];
  cell.tile = tileAt(q, r);
  cell.elevation = elevation(cell.tile);
  if (overlay) syncOverlay();
  scheduleRebuild();
  updateRings();
}

function updateRings() {
  const map = activeMap();
  if (!three || !map) return;
  const sel = ui.selected ? cells[cellIndex.get(keyOf(ui.selected.q, ui.selected.r))] : null;
  if (selectedRing) {
    selectedRing.visible = !!sel;
    if (sel) selectedRing.position.set(sel.x, sel.elevation + 0.075, sel.z);
  }
  if (hoverRing && hovered) {
    hoverRing.position.set(hovered.x, hovered.elevation + 0.082, hovered.z);
    hoverRing.visible = true;
  } else if (hoverRing) {
    hoverRing.visible = false;
  }
}
