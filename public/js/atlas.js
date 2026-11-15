// The world atlas: a pan/zoom slippy map covering the entire Earth.
//
// It intentionally has no map-library dependency. Raster tiles come through the
// app's same-origin /api/atlas/tile proxy so the browser never needs a tile API
// key and the server can send the User-Agent required by OpenStreetMap.
//
// The atlas is a peer of the 3D hex scene, not a box around it. At street zoom
// it hands the current latitude/longitude to the infinite hex world; at low zoom
// the hex world hands the same coordinate back to the atlas.
const TILE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
const HEX_ZOOM = 15.4;
const DEG = Math.PI / 180;
const MAX_LAT = 85.0511;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function project(lat, lon, zoom) {
  const scale = TILE * 2 ** zoom;
  const x = ((lon + 180) / 360) * scale;
  const sin = Math.sin(clamp(lat, -MAX_LAT, MAX_LAT) * DEG);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y, scale };
}

function unproject(x, y, zoom) {
  const scale = TILE * 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat: clamp(lat, -MAX_LAT, MAX_LAT), lon };
}

export class WorldAtlas {
  constructor(host, { onEnter, onError, onView } = {}) {
    this.host = null;
    this.onEnter = onEnter;
    this.onError = onError;
    this.onView = onView;
    this.view = { lat: 43.218, lon: -77.4, zoom: 8.2 };
    this.goal = null;
    this.markers = [];
    this.tiles = new Map();
    this.failed = new Set();
    this.entered = false;
    this.dragging = false;
    this.pointer = { x: 0, y: 0 };
    this.start = null;
    this.dirty = true;
    this.raf = 0;
    this.last = 0;
    this.fadeDone = null;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'atlas-canvas';
    this.canvas.setAttribute('aria-label', 'World atlas. Drag to pan, scroll to zoom, and zoom in to enter the hex world.');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.bind();
    this.setHost(host);
    this.startLoop();
  }

  setHost(host) {
    if (!host) return;
    this.host = host;
    if (this.canvas.parentElement !== host) host.appendChild(this.canvas);
    this.resize();
    this.canvas.classList.remove('is-leaving');
    this.canvas.style.opacity = '1';
    this.dirty = true;
  }

  setView(lat, lon, zoom = this.view.zoom, animate = false) {
    const next = {
      lat: clamp(Number(lat) || 0, -MAX_LAT, MAX_LAT),
      lon: Number(lon) || 0,
      zoom: clamp(Number(zoom) || MIN_ZOOM, MIN_ZOOM, MAX_ZOOM),
    };
    if (animate) {
      this.goal = next;
      if (next.zoom < HEX_ZOOM) this.entered = false;
    } else {
      this.view = next;
      this.goal = null;
      this.dirty = true;
      if (next.zoom < HEX_ZOOM) this.entered = false;
      else this.maybeEnter();
    }
  }

  flyTo(lat, lon, zoom = 14.3) {
    this.setView(lat, lon, zoom, true);
  }

  getView() {
    return { ...this.view, zoom: this.view.zoom };
  }

  setMarkers(markers) {
    this.markers = (markers || []).filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon));
    this.dirty = true;
  }

  show() {
    this.canvas.classList.remove('is-leaving');
    this.canvas.style.opacity = '1';
    this.startLoop();
    this.dirty = true;
  }

  fadeOut(done) {
    this.canvas.classList.add('is-leaving');
    window.setTimeout(() => {
      if (done) done();
    }, 430);
  }

  startLoop() {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.host?.isConnected) return;
      this.resize();
      if (this.goal) {
        const t = 1 - Math.pow(0.001, dt);
        this.view.lat += (this.goal.lat - this.view.lat) * t;
        this.view.lon += (this.goal.lon - this.view.lon) * t;
        this.view.zoom += (this.goal.zoom - this.view.zoom) * t;
        this.dirty = true;
        if (Math.abs(this.view.lat - this.goal.lat) < 0.0001
          && Math.abs(this.view.lon - this.goal.lon) < 0.0001
          && Math.abs(this.view.zoom - this.goal.zoom) < 0.01) {
          this.view = { ...this.goal };
          this.goal = null;
        }
        this.maybeEnter();
      }
      if (this.dirty) {
        this.dirty = false;
        this.draw();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  maybeEnter() {
    if (this.view.zoom < HEX_ZOOM) {
      this.entered = false;
      return;
    }
    if (this.entered) return;
    this.entered = true;
    if (this.onEnter) this.onEnter({ lat: this.view.lat, lon: this.view.lon });
  }

  resize() {
    if (!this.host) return;
    const w = Math.max(1, Math.round(this.host.clientWidth));
    const h = Math.max(1, Math.round(this.host.clientHeight));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this.dirty = true;
    }
    this.w = w;
    this.h = h;
    this.dpr = dpr;
  }

  draw() {
    if (!this.ctx || !this.w || !this.h) return;
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#d7ded1';
    ctx.fillRect(0, 0, this.w, this.h);

    const z = clamp(Math.round(this.view.zoom), MIN_ZOOM, 19);
    const tileSize = TILE * 2 ** (this.view.zoom - z);
    const screenScale = tileSize / TILE;
    const center = project(this.view.lat, this.view.lon, z);
    const viewLeft = center.x - (this.w / 2) / screenScale;
    const viewTop = center.y - (this.h / 2) / screenScale;
    const x0 = Math.floor(viewLeft / TILE);
    const x1 = Math.ceil((viewLeft + this.w / screenScale) / TILE);
    const y0 = Math.floor(viewTop / TILE);
    const y1 = Math.ceil((viewTop + this.h / screenScale) / TILE);
    const max = 2 ** z;

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= max) continue;
        const wrapped = ((x % max) + max) % max;
        const px = (x * TILE - viewLeft) * screenScale;
        const py = (y * TILE - viewTop) * screenScale;
        const key = `${z}/${wrapped}/${y}`;
        const image = this.tiles.get(key);
        if (image?.complete && image.naturalWidth) {
          ctx.drawImage(image, px, py, tileSize, tileSize);
        } else {
          ctx.fillStyle = (x + y) & 1 ? '#dce3d6' : '#e6e9df';
          ctx.fillRect(px, py, tileSize, tileSize);
          if (!image && !this.failed.has(key)) this.loadTile(z, wrapped, y, key);
        }
      }
    }

    // Subtle map texture: a very light paper-like veil, not a dashboard.
    ctx.fillStyle = 'rgba(239, 234, 218, 0.06)';
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawMarkers(ctx);

    if (this.onView) this.onView(this.getView());
  }

  loadTile(z, x, y, key) {
    if (this.tiles.has(key)) return;
    const image = new Image();
    image.decoding = 'async';
    image.alt = '';
    image.onload = () => {
      this.tiles.set(key, image);
      this.dirty = true;
    };
    image.onerror = () => {
      this.failed.add(key);
      this.dirty = true;
    };
    image.src = `/api/atlas/tile/${z}/${x}/${y}`;
    this.tiles.set(key, image);
    while (this.tiles.size > 600) {
      const oldest = this.tiles.keys().next().value;
      this.tiles.delete(oldest);
    }
  }

  drawMarkers(ctx) {
    const campaign = this.markers.find((m) => m.kind === 'campaign');
    for (const marker of this.markers) {
      const screen = this.screenFor(marker.lat, marker.lon);
      if (!screen || screen.x < -80 || screen.x > this.w + 80 || screen.y < -40 || screen.y > this.h + 40) continue;
      const isCampaign = marker === campaign;
      ctx.save();
      ctx.translate(screen.x, screen.y);
      if (isCampaign) {
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(186, 147, 76, .18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(186, 147, 76, .55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, isCampaign ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isCampaign ? '#c79e57' : '#e6d7aa';
      ctx.strokeStyle = '#2a2418';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      if (marker.name) {
        ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = '#2d2b22';
        ctx.shadowColor = 'rgba(247, 243, 228, .9)';
        ctx.shadowBlur = 5;
        ctx.fillText(marker.name, 10, 3);
      }
      ctx.restore();
    }
  }

  screenFor(lat, lon) {
    if (!this.w) return null;
    const p = project(lat, lon, this.view.zoom);
    const c = project(this.view.lat, this.view.lon, this.view.zoom);
    return { x: p.x - c.x + this.w / 2, y: p.y - c.y + this.h / 2 };
  }

  latLonAt(sx, sy) {
    const c = project(this.view.lat, this.view.lon, this.view.zoom);
    return unproject(c.x + sx - this.w / 2, c.y + sy - this.h / 2, this.view.zoom);
  }

  zoomAt(delta, sx = this.w / 2, sy = this.h / 2) {
    const before = this.latLonAt(sx, sy);
    const next = clamp(this.view.zoom + delta, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(next - this.view.zoom) < 0.0001) return;
    this.view.zoom = next;
    const p = project(before.lat, before.lon, next);
    const c = unproject(p.x + this.w / 2 - sx, p.y + this.h / 2 - sy, next);
    this.view.lat = c.lat;
    this.view.lon = c.lon;
    this.dirty = true;
    if (next < HEX_ZOOM) this.entered = false;
    else this.maybeEnter();
  }

  bind() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.dragMoved = 0;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.start = { ...this.view };
      try { this.canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic */ }
      this.canvas.classList.add('is-dragging');
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = 1;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      const startPx = project(this.start.lat, this.start.lon, this.start.zoom);
      const next = unproject(startPx.x - dx, startPx.y - dy, this.start.zoom);
      this.view.lat = next.lat;
      this.view.lon = next.lon;
      this.view.zoom = this.start.zoom;
      this.dirty = true;
    });
    const stop = () => {
      this.dragging = false;
      this.canvas.classList.remove('is-dragging');
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      this.zoomAt(e.deltaY > 0 ? -0.55 : 0.55, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
    this.canvas.addEventListener('dblclick', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.zoomAt(1, e.clientX - rect.left, e.clientY - rect.top);
    });
  }
}

export { HEX_ZOOM as ATLAS_HEX_ZOOM };
