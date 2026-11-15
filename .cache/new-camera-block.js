// ---------------------------------------------------------------- camera + loop

function fitCamera() {
  const map = activeMap();
  if (!map) return;
  const span = Math.max(map.cols * 1.55, map.rows * 1.85);
  camera.want = Math.max(10, Math.min(88, span * 0.98 + 4));
  camera.dist = camera.want;
  camera.target.set(0, 0.35, 0);
  camera.azimuth = -Math.PI / 4;
  camera.polar = 0.94;
  needsFit = false;

  if (keyLight) {
    const reach = Math.max(22, Math.max(map.cols, map.rows) * 2.1);
    keyLight.shadow.camera.left = -reach;
    keyLight.shadow.camera.right = reach;
    keyLight.shadow.camera.top = reach;
    keyLight.shadow.camera.bottom = -reach;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 120;
    keyLight.shadow.camera.updateProjectionMatrix();
    keyLight.target.position.set(0, 0, 0);
  }
}

function updateCamera() {
  if (!three) return;
  const { camera: cam } = three;
  const x = camera.dist * Math.sin(camera.polar) * Math.sin(camera.azimuth);
  const y = camera.dist * Math.cos(camera.polar);
  const z = camera.dist * Math.sin(camera.polar) * Math.cos(camera.azimuth);
  cam.position.set(camera.target.x + x, y + camera.target.y, camera.target.z + z);
  cam.lookAt(camera.target);
}

function resize() {
  if (!three || !stageEl) return;
  const w = Math.max(1, stageEl.clientWidth);
  const h = Math.max(1, stageEl.clientHeight);
  three.renderer.setSize(w, h, false);
  three.camera.aspect = w / h;
  three.camera.updateProjectionMatrix();
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!three || state.page !== 'world') return;

  if (stageEl && stageEl.isConnected) {
    const w = Math.max(1, stageEl.clientWidth);
    const h = Math.max(1, stageEl.clientHeight);
    const size = three.renderer.getSize(new THREE.Vector2());
    if (Math.abs(size.x - w) > 1 || Math.abs(size.y - h) > 1) resize();
  }

  const time = performance.now() / 1000;
  if (ocean?.material?.uniforms?.uTime) ocean.material.uniforms.uTime.value = time;
  if (foamMaterial) foamMaterial.opacity = 0.31 + Math.sin(time * 1.15) * 0.035;
  for (const material of windMaterials) {
    if (material.userData.windTime) material.userData.windTime.value = time;
  }

  camera.dist += (camera.want - camera.dist) * 0.16;
  updateCamera();
  three.renderer.render(three.scene, three.camera);
  positionOverlay();
}

function startLoop() {
  if (!raf) raf = requestAnimationFrame(loop);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/** Called after every app render. Reattaches the persistent canvas. */
export function mountWorld() {
  if (state.page !== 'world' || !state.campaign) {
    stopLoop();
    return;
  }
  ensureThree();
  stageEl = document.getElementById('world-stage');
  if (!stageEl) { stopLoop(); return; }

  const map = activeMap();
  if (!map) {
    canvas.style.display = 'none';
    overlay.style.display = 'none';
    syncOverlay();
    return;
  }
  canvas.style.display = '';
  overlay.style.display = '';
  stageEl.classList.add('has-world');
  stageEl.appendChild(canvas);
  stageEl.appendChild(overlay);

  resize();
  if (needsFit) fitCamera();
  applyMaps();
  updateRings();
  startLoop();
}

function applyMaps() {
  if (!state.page || state.page !== 'world' || !three) return;
  const map = activeMap();
  if (!map) return;
  const sig = [
    map.id, map.cols, map.rows, Number(map.config?.density) || 1,
    map.tiles.map((t) => [t.q, t.r, t.color, t.terrain, t.important, t.waypoint, t.icon, t.label, t.visible].join('~')).join('|'),
  ].join('::');
  if (sig !== lastSig) {
    lastSig = sig;
    buildTiles();
  } else {
    syncOverlay();
  }
}

/** Reload map data from the API (used after labels and map changes). */
async function reloadMaps() {
  if (!state.campaign) return;
  try {
    const { maps: fresh } = await api('GET', `/api/campaigns/${state.campaign.id}/maps`);
    state.maps = fresh;
    if (!fresh.some((m) => m.id === state.mapId)) state.mapId = fresh[0]?.id || null;
    applyMaps();
  } catch (err) { fail(err); }
}

let mapSyncTimer = 0;
window.addEventListener('dndds:maps', () => {
  if (state.page !== 'world') return;
  // A paint stroke saves hex by hex; coalesce the resulting patches into one
  // rebuild instead of rebuilding the whole environment for every hex.
  clearTimeout(mapSyncTimer);
  mapSyncTimer = setTimeout(() => {
    applyMaps();
    const status = document.getElementById('world-save-state');
    if (status && !ui.saving) status.textContent = 'Synced';
  }, 220);
});
