// Real geography for the Webster / Ontario campaign region.
//
// Coordinates are WGS84. Roads are simplified © OpenStreetMap contributors
// (ODbL 1.0), captured once into region-data.json. The seeded hex map is only a
// starting point: every tile is ordinary editable campaign data afterwards.
import { readFileSync } from 'node:fs';

const geo = JSON.parse(readFileSync(new URL('./region-data.json', import.meta.url), 'utf8'));
const [WEST, SOUTH, EAST, NORTH] = geo.bbox;
const COLS = 40;
const ROWS = 18;
const SQRT3 = Math.sqrt(3);

export const REGION = {
  id: 'webster-ontario',
  name: 'Webster & Ontario · Lake Ontario',
  cols: COLS,
  rows: ROWS,
  bbox: geo.bbox,
  center: { lat: 43.218, lon: -77.40 },
  attribution: geo.attribution,
};

// One global hex covers roughly 160 m at this latitude. The atlas crosses into
// the hex layer at zoom 15.4, where that scale reads as a playable local map.
// This same projection is mirrored in public/js/world.js.
export const WORLD_HEX_METERS = 160;
const MERCATOR_R = 6378137;

export function latLonToGlobalHex(lat, lon) {
  const x = (MERCATOR_R * lon * Math.PI / 180) / WORLD_HEX_METERS;
  const my = MERCATOR_R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const z = -my / WORLD_HEX_METERS;
  const qf = x / SQRT3 - z / 3;
  const rf = (2 / 3) * z;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const xf = qf;
  const zf = rf;
  const xr = Math.round(xf - q);
  const zr = Math.round(zf - r);
  if (Math.abs(xr) > Math.abs(zr)) q += xr;
  else r += zr;
  return { q, r };
}

/**
 * A world map seed containing the authored Webster/Ontario geography on the
 * global hex lattice. Everything outside these 720 authored cells is generated
 * by the client as frontier terrain; the saved map remains editable.
 */
export function worldSeed() {
  const base = regionalSeed();
  const start = REGION.center;
  const startPoint = latLonToGlobalHex(start.lat, start.lon);
  const startX = (startPoint.q + startPoint.r / 2) * SQRT3;
  const startZ = startPoint.r * 1.5;
  const cells = new Map();

  for (const tile of base.tiles) {
    if (!Number.isFinite(tile.lat) || !Number.isFinite(tile.lon)) continue;
    const { q, r } = latLonToGlobalHex(tile.lat, tile.lon);
    const key = `${q}:${r}`;
    const previous = cells.get(key);
    if (!previous || tile.important) {
      cells.set(key, {
        q, r, terrain: tile.terrain,
        waypoint: tile.waypoint || '', category: tile.category || '',
        icon: tile.icon || '', description: tile.description || '',
        image: tile.image || '', important: tile.important ? 1 : 0,
      });
    }
  }

  const labels = base.labels.map((label) => {
    const { q, r } = latLonToGlobalHex(label.lat, label.lon);
    const x = Math.round(((q + r / 2) * SQRT3 - startX) * 10) / 10;
    const y = Math.round((r * 1.5 - startZ) * 10) / 10;
    return { ...label, x, y };
  });

  return {
    cols: 6,
    rows: 6,
    tiles: [...cells.values()],
    labels,
    config: {
      infinite: true,
      hexSizeMeters: WORLD_HEX_METERS,
      mapType: 'world',
      start,
      geo: {
        bbox: [-180, -85.0511, 180, 85.0511],
        center: start,
        source: geo.attribution,
      },
    },
  };
}

const TERRAINS = {
  lake: 'deepwater',
  bay: 'water',
  pond: 'water',
  road: 'road',
  highway: 'highway',
  residential: 'residential',
  farmland: 'farmland',
  forest: 'forest',
  park: 'park',
  beach: 'beach',
  grass: 'grass',
  urban: 'urban',
  marsh: 'marsh',
};

const cellKey = (q, r) => `${q}:${r}`;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function project(lat, lon) {
  const col = clamp(Math.round(((lon - WEST) / (EAST - WEST)) * (COLS - 1)), 0, COLS - 1);
  const row = clamp(Math.round(((NORTH - lat) / (NORTH - SOUTH)) * (ROWS - 1)), 0, ROWS - 1);
  return { col, row };
}

function unproject(col, row) {
  const lon = WEST + (col / (COLS - 1)) * (EAST - WEST);
  const lat = NORTH - (row / (ROWS - 1)) * (NORTH - SOUTH);
  return { lat, lon };
}

function axial(col, row) {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

function worldPoint(col, row) {
  const { q, r } = axial(col, row);
  const centerX = ((COLS - 1) + 0.5) * SQRT3 / 2;
  const centerZ = ((ROWS - 1) * 1.5) / 2;
  return {
    x: Math.round(((q + r / 2) * SQRT3 - centerX) * 10) / 10,
    y: Math.round((r * 1.5 - centerZ) * 10) / 10,
  };
}

function near(lat, lon, targetLat, targetLon, latRadius, lonRadius = latRadius) {
  return Math.abs(lat - targetLat) <= latRadius && Math.abs(lon - targetLon) <= lonRadius;
}

function lakeShore(lon) {
  const t = (lon - WEST) / (EAST - WEST);
  return 43.2465 + t * 0.0115 + Math.sin(t * 38) * 0.0035;
}

function inIrondequoitBay(lat, lon) {
  if (lat < 43.168 || lat > 43.253) return false;
  const t = (lat - 43.168) / 0.085;
  const center = -77.531 + Math.sin(t * 9.2) * 0.007;
  const width = 0.0065 + Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.010;
  return Math.abs(lon - center) < width;
}

function pond(lat, lon, centerLat, centerLon, rLat, rLon = rLat) {
  const dy = (lat - centerLat) / rLat;
  const dx = (lon - centerLon) / rLon;
  return dx * dx + dy * dy <= 1;
}

function noise(col, row, salt = 0) {
  const v = Math.sin(col * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

function baseTerrain(lat, lon, col, row) {
  const shore = lakeShore(lon);
  if (lat > shore) return lat > shore + 0.008 ? TERRAINS.lake : TERRAINS.beach;
  if (inIrondequoitBay(lat, lon)) return TERRAINS.bay;
  if (pond(lat, lon, 43.219, -77.442, 0.0047, 0.0075)
    || pond(lat, lon, 43.219, -77.425, 0.0036, 0.006)
    || pond(lat, lon, 43.2358, -77.2963, 0.0032, 0.006)) return TERRAINS.pond;

  if (near(lat, lon, 43.2533, -77.456, 0.014, 0.018)
    || near(lat, lon, 43.2469, -77.4736, 0.009, 0.012)
    || near(lat, lon, 43.2358, -77.2963, 0.012, 0.016)
    || near(lat, lon, 43.231, -77.426, 0.018, 0.022)) return TERRAINS.park;

  if (near(lat, lon, 43.212, -77.43, 0.018, 0.022)
    || near(lat, lon, 43.2209, -77.283, 0.018, 0.022)
    || near(lat, lon, 43.24, -77.47, 0.009, 0.012)) return TERRAINS.residential;

  if (near(lat, lon, 43.213, -77.533, 0.028, 0.026)) return TERRAINS.urban;
  if (lon > -77.37 || lat < 43.195) return TERRAINS.farmland;
  if (noise(col, row, 3) > 0.78) return TERRAINS.forest;
  return TERRAINS.grass;
}

function cellMap() {
  const tiles = new Map();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { lat, lon } = unproject(col, row);
      const { q, r } = axial(col, row);
      tiles.set(cellKey(q, r), {
        q, r, terrain: baseTerrain(lat, lon, col, row), col, row, lat, lon,
        waypoint: '', category: '', icon: '', description: '', image: '', important: 0,
      });
    }
  }
  return tiles;
}

function rasterRoad(tiles, road) {
  const coords = road.coords || [];
  const is104 = road.name === 'State Route 104' || road.name === 'Route 104';
  const terrain = is104 ? TERRAINS.highway : TERRAINS.road;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const steps = Math.max(2, Math.ceil(Math.hypot(lon2 - lon1, lat2 - lat1) / 0.0011));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lon = lon1 + (lon2 - lon1) * t;
      const lat = lat1 + (lat2 - lat1) * t;
      const { col, row } = project(lat, lon);
      const { q, r } = axial(col, row);
      const tile = tiles.get(cellKey(q, r));
      if (!tile) continue;
      if (tile.terrain === TERRAINS.lake || tile.terrain === TERRAINS.bay) {
        // Route 104 is the causeway/bridge across Irondequoit Bay. Other roads
        // stop at the shoreline instead of being painted over the water.
        if (is104) tile.terrain = TERRAINS.highway;
        continue;
      }
      if (tile.terrain === TERRAINS.beach) tile.terrain = TERRAINS.grass;
      tile.terrain = terrain;
    }
  }
}

function placeMarker(tiles, spot) {
  const { col, row } = project(spot.lat, spot.lon);
  const { q, r } = axial(col, row);
  const tile = tiles.get(cellKey(q, r));
  if (!tile) return;
  tile.waypoint = spot.name;
  tile.category = spot.category || 'location';
  tile.icon = spot.icon || 'pin';
  tile.description = spot.description || '';
  tile.image = spot.image || '';
  tile.important = 1;
}

const PLACES = [
  {
    name: 'Webster Village', lat: 43.2123, lon: -77.4300, category: 'location', icon: 'building',
    description: 'The village center of Webster, Monroe County, around Main Street and West Main Street. The town is east of Irondequoit Bay and south of Lake Ontario.',
    image: '/assets/webster/webster-village-hall.webp',
  },
  {
    name: 'Ontario Town Center', lat: 43.2209, lon: -77.2830, category: 'location', icon: 'building',
    description: 'Town of Ontario, Wayne County. Ontario Center is the historic hamlet; Ridge Road and Route 104 connect it west toward Webster and Rochester.',
    image: '/assets/places/ontario-town-center.jpg',
  },
  {
    name: 'North Ponds Park', lat: 43.2189, lon: -77.4420, category: 'park', icon: 'tree',
    description: 'Charles E. Sexton Memorial Park at 750 Holt Road: two fishing ponds, a one-mile paved loop, fitness stations, disc golf, and a lodge.',
    image: '/assets/webster/north-ponds-festival-west.webp',
  },
  {
    name: 'Webster Park', lat: 43.2533, lon: -77.4560, category: 'park', icon: 'tree',
    description: 'A large Monroe County park on the Lake Ontario shoreline, with wooded trails, picnic areas, and access to the lake.',
    image: '/assets/places/webster-park.jpg',
  },
  {
    name: 'Whiting Road Nature Preserve', lat: 43.2469, lon: -77.4736, category: 'park', icon: 'tree',
    description: 'A town nature preserve west of Webster village with wooded trails and wetlands.',
    image: '/assets/places/whiting-road-nature-preserve.jpg',
  },
  {
    name: 'Casey Park', lat: 43.2358, lon: -77.2963, category: 'park', icon: 'tree',
    description: 'Ontario town park with ball fields, trails, and open space on the north side of the town.',
    image: '/assets/places/casey-park.jpg',
  },
  {
    name: 'Irondequoit Bay Bridge', lat: 43.2117, lon: -77.5342, category: 'road', icon: 'road',
    description: 'The Route 104 crossing over Irondequoit Bay. Route 104 continues east through Webster toward Ontario and west toward Rochester.',
    image: '/assets/places/irondequoit-bay-bridge.jpg',
  },
  {
    name: 'Bear Creek Harbor', lat: 43.2770, lon: -77.2766, category: 'water', icon: 'waves',
    description: 'A Lake Ontario harbor at the mouth of Bear Creek in the Town of Ontario, Wayne County.',
    image: '/assets/places/bear-creek-harbor.jpg',
  },
  {
    name: 'Schutt’s Apple Mill', lat: 43.1819, lon: -77.4525, category: 'shop', icon: 'shop',
    description: 'A long-running Webster orchard and farm market south of the village, on the Plank Road side of town.',
    image: '/assets/places/schutts-apple-mill.jpg',
  },
  {
    name: 'Bill Gray’s · Webster', lat: 43.2091, lon: -77.4623, category: 'shop', icon: 'shop',
    description: 'A local burger restaurant on the Webster side of Irondequoit Bay, recorded from OpenStreetMap.',
    image: '/assets/places/bill-grays-webster.jpg',
  },
  {
    name: 'Tops · Ontario', lat: 43.2265, lon: -77.2793, category: 'shop', icon: 'shop',
    description: 'Supermarket serving the Ontario community on Route 104 in Wayne County.',
    image: '/assets/places/tops-ontario.jpg',
  },
  {
    name: 'Spry Middle School', lat: 43.2079, lon: -77.4318, category: 'school', icon: 'book',
    description: 'Webster Central School District middle school near the village center.',
    image: '/assets/places/spry-middle-school.jpg',
  },
  {
    name: 'Webster Thomas High School', lat: 43.2197, lon: -77.4714, category: 'school', icon: 'book',
    description: 'Webster Central School District high school on the west side of town.',
    image: '/assets/places/webster-thomas-high-school.jpg',
  },
];

const LABELS = [
  { text: 'LAKE ONTARIO', lat: 43.272, lon: -77.39, size: 17, color: '#c8d9dc' },
  { text: 'IRONDEQUOIT BAY', lat: 43.235, lon: -77.54, size: 13, color: '#a9c9d1' },
  { text: 'WEBSTER', lat: 43.216, lon: -77.43, size: 16, color: '#f0e7d1' },
  { text: 'ONTARIO', lat: 43.226, lon: -77.29, size: 16, color: '#f0e7d1' },
  { text: 'ROUTE 104', lat: 43.208, lon: -77.42, size: 12, color: '#e3d3a7' },
  { text: 'RIDGE ROAD · NY 404', lat: 43.222, lon: -77.37, size: 11, color: '#d8d1ba' },
  { text: 'BAY ROAD · NY 250', lat: 43.229, lon: -77.47, size: 11, color: '#d8d1ba' },
  { text: 'ONTARIO CENTER RD · NY 350', lat: 43.235, lon: -77.30, size: 11, color: '#d8d1ba' },
  { text: 'WEBSTER PARK', lat: 43.253, lon: -77.456, size: 12, color: '#c8d6b8' },
  { text: 'NORTH PONDS', lat: 43.219, lon: -77.442, size: 12, color: '#c8d6b8' },
  { text: 'CASEY PARK', lat: 43.236, lon: -77.296, size: 11, color: '#c8d6b8' },
  { text: 'ROCHESTER →', lat: 43.18, lon: -77.55, size: 12, color: '#d8d1ba' },
];

export function regionalSeed() {
  const tiles = cellMap();

  for (const road of geo.roads) rasterRoad(tiles, road);

  // Named creeks are waterways, not roads; give them a little visual presence
  // without pretending the whole corridor is water.
  for (const waterway of geo.waterways) {
    if (!waterway.name || waterway.name === 'Commission Ditch') continue;
    for (const [lon, lat] of waterway.coords) {
      const { col, row } = project(lat, lon);
      const { q, r } = axial(col, row);
      const tile = tiles.get(cellKey(q, r));
      if (tile && (tile.terrain === TERRAINS.grass || tile.terrain === TERRAINS.farmland)) {
        tile.terrain = TERRAINS.marsh;
      }
    }
  }

  for (const spot of PLACES) placeMarker(tiles, spot);

  const labels = LABELS.map((label) => {
    const { col, row } = project(label.lat, label.lon);
    const p = worldPoint(col, row);
    return { text: label.text, x: p.x, y: p.y, size: label.size, color: label.color, lat: label.lat, lon: label.lon };
  });

  return {
    cols: COLS,
    rows: ROWS,
    tiles: [...tiles.values()].sort((a, b) => a.r - b.r || a.q - b.q),
    labels,
    config: {
      mapType: 'regional',
      geo: { bbox: geo.bbox, center: REGION.center, source: geo.attribution },
    },
  };
}
