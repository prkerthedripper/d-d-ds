// Google Earth-style approach layer for the campaign world.
//
// The globe is a real Three.js sphere using NASA Blue Marble satellite imagery,
// a topology/bathymetry bump map, an atmospheric rim shader and a very light
// procedural cloud veil. It is deliberately a separate renderer from the hex
// world: the two scenes cross-fade while both cameras move, so there is never a
// satellite texture left underneath a painted hex tile.
import * as THREE from '/vendor/three.module.js';

const DEG = Math.PI / 180;
const CAMPAIGN = { lat: 43.218, lon: -77.43, name: 'Webster & Ontario' };
const MIN_DISTANCE = 1.16;
const MAX_DISTANCE = 4.4;

function latLonToVec3(lat, lon, radius = 1) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function faceQuaternion(lat, lon) {
  const target = latLonToVec3(lat, lon).normalize();
  return new THREE.Quaternion().setFromUnitVectors(target, new THREE.Vector3(0, 0, 1));
}

function distanceToCampaign(lat, lon) {
  const dLat = (lat - CAMPAIGN.lat) * DEG;
  const dLon = (lon - CAMPAIGN.lon) * DEG;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat * DEG) * Math.cos(CAMPAIGN.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class EarthExplorer {
  constructor(host, { onEnter, onError } = {}) {
    this.host = null;
    this.onEnter = onEnter;
    this.onError = onError;
    this.visible = true;
    this.ready = false;
    this.failed = false;
    this.entered = false;
    this.distance = 3.25;
    this.targetDistance = 3.25;
    this.nearCampaign = false;
    this.dragging = false;
    this.dragMoved = 0;
    this.pointer = { x: 0, y: 0 };
    this.targetQuat = faceQuaternion(CAMPAIGN.lat, CAMPAIGN.lon);
    this.last = performance.now();
    this.raf = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.setClearColor(0x02050b, 1);
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'earth-canvas';
    this.canvas.setAttribute('aria-label', 'Interactive satellite Earth. Drag to rotate and scroll to zoom.');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 120);
    this.camera.position.set(0, 0, this.distance);

    this.root = new THREE.Group();
    this.root.quaternion.copy(this.targetQuat);
    this.scene.add(this.root);

    this.scene.add(new THREE.HemisphereLight(0xf3f7ff, 0x080d1c, 0.72));
    const sun = new THREE.DirectionalLight(0xfff4df, 3.1);
    sun.position.set(3.8, 2.5, 4.2);
    this.scene.add(sun);

    this.makeStars();
    this.loadSurface();
    this.bindInput();
    this.setHost(host);
    this.start();
  }

  makeStars() {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(28 + Math.random() * 34);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xbcd0e8, size: 0.055, transparent: true, opacity: 0.72, depthWrite: false,
    })));
  }

  loadSurface() {
    const loader = new THREE.TextureLoader();
    const load = (url) => new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
    Promise.all([
      load('/assets/earth/blue-marble.jpg'),
      load('/assets/earth/topology.png'),
      load('/assets/earth/water-mask.png'),
    ]).then(([map, bump, water]) => {
      map.colorSpace = THREE.SRGBColorSpace;
      bump.colorSpace = THREE.NoColorSpace;
      water.colorSpace = THREE.NoColorSpace;
      map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      const material = new THREE.MeshPhongMaterial({
        map,
        bumpMap: bump,
        bumpScale: 0.012,
        specularMap: water,
        specular: new THREE.Color(0x5f8ca3),
        shininess: 13,
      });
      const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 80), material);
      earth.rotation.y = -Math.PI / 2;
      this.root.add(earth);
      this.earthMesh = earth;

      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.018, 96, 64),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uColor: { value: new THREE.Color(0x62a8ff) } },
          vertexShader: `varying vec3 vNormal; varying vec3 vView;
            void main(){ vNormal = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `varying vec3 vNormal; varying vec3 vView; uniform vec3 uColor;
            void main(){ float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.8); gl_FragColor = vec4(uColor, rim * 0.72); }`,
        }),
      );
      this.root.add(atmosphere);

      this.addCloudVeil();
      this.addCampaignMarker();
      this.ready = true;
    }).catch((err) => {
      this.failed = true;
      if (this.onError) this.onError('Earth imagery could not be loaded.');
      console.error('[earth] texture load failed', err);
    });
  }

  addCloudVeil() {
    // A quiet procedural veil; it is intentionally faint so the satellite
    // landforms stay readable instead of looking like a weather app.
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 p = vec2(vUv.x * 7.0 + uTime * 0.006, vUv.y * 3.4);
          float n = noise(p) * 0.55 + noise(p * 2.3 + 4.0) * 0.28 + noise(p * 5.1 + 9.0) * 0.17;
          float edge = smoothstep(0.03, 0.16, vUv.y) * smoothstep(0.97, 0.84, vUv.y);
          float a = smoothstep(0.58, 0.78, n) * 0.13 * edge;
          gl_FragColor = vec4(0.86, 0.91, 0.95, a);
        }`,
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 96, 64), material);
    clouds.rotation.y = -Math.PI / 2;
    this.root.add(clouds);
    this.clouds = clouds;
  }

  addCampaignMarker() {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf2ce86 }),
    );
    marker.position.copy(latLonToVec3(CAMPAIGN.lat, CAMPAIGN.lon, 1.014));
    this.root.add(marker);
    this.marker = marker;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.023, 32),
      new THREE.MeshBasicMaterial({ color: 0xf2ce86, transparent: true, opacity: 0.58, side: THREE.DoubleSide }),
    );
    ring.position.copy(marker.position);
    ring.lookAt(new THREE.Vector3(0, 0, 0));
    this.root.add(ring);
  }

  setHost(host) {
    if (!host) return;
    this.host = host;
    if (this.canvas.parentElement !== host) host.appendChild(this.canvas);
    this.resize();
  }

  show() {
    this.visible = true;
    this.entered = false;
    this.canvas.classList.remove('is-leaving');
    this.canvas.style.opacity = '1';
    this.start();
  }

  fadeOut(done) {
    this.canvas.classList.add('is-leaving');
    window.setTimeout(() => {
      this.visible = false;
      if (done) done();
    }, 860);
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now) => {
      this.raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.host?.isConnected) return;
    this.resize();
    this.root.quaternion.slerp(this.targetQuat, 0.085);
    this.distance += (this.targetDistance - this.distance) * 0.12;
    this.camera.position.z = this.distance;
    if (this.clouds) {
      this.clouds.rotation.y += dt * 0.003;
      this.clouds.material.uniforms.uTime.value = now / 1000;
    }
    if (this.marker) {
      const pulse = 1 + Math.sin(now / 380) * 0.12;
      this.marker.scale.setScalar(pulse);
    }
    if (this.nearCampaign && this.targetDistance <= 1.29 && !this.entered && this.ready) {
      this.entered = true;
      if (this.onEnter) this.onEnter();
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    if (!this.host) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (Math.abs(size.x - w) > 1 || Math.abs(size.y - h) > 1) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  flyTo(lat, lon, distance = 1.45) {
    const nlat = Number(lat);
    const nlon = Number(lon);
    if (!Number.isFinite(nlat) || !Number.isFinite(nlon)) return;
    this.targetQuat = faceQuaternion(nlat, nlon);
    this.targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, Number(distance) || 1.45));
    this.nearCampaign = distanceToCampaign(nlat, nlon) < 90;
  }

  focusCampaign(distance = 1.55) {
    this.flyTo(CAMPAIGN.lat, CAMPAIGN.lon, distance);
    this.nearCampaign = true;
    this.entered = false;
  }

  reset() {
    this.targetDistance = 3.25;
    this.targetQuat = faceQuaternion(CAMPAIGN.lat, CAMPAIGN.lon);
    this.nearCampaign = false;
    this.entered = false;
  }

  bindInput() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.dragMoved = 0;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.canvas.classList.add('is-dragging');
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.0042);
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -dy * 0.0038);
      this.targetQuat.multiply(qy).multiply(qx).normalize();
    });
    const stopDrag = () => {
      this.dragging = false;
      this.canvas.classList.remove('is-dragging');
    };
    this.canvas.addEventListener('pointerup', stopDrag);
    this.canvas.addEventListener('pointercancel', stopDrag);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, this.targetDistance * (e.deltaY > 0 ? 1.14 : 0.88)));
    }, { passive: false });
  }
}

export { CAMPAIGN as EARTH_CAMPAIGN };
