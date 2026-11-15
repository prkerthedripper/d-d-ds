// The World section: a real-time 3D hex map built with Three.js.
//
// The map is a pure rendering of campaign data — every painted tile, waypoint
// and label lives on the server. A new map is an empty grid, and only hexes the
// DM has touched are stored, so nothing here is sample content.
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/GLTFLoader.js';
import { state, api, esc, on, render, isDM, toast, fail } from './core.js';
import { icon } from './icons.js';
import { pickImage } from './images.js';
import { WEBSTER_PHOTOS, NORTH_PONDS_HERO, NORTH_PONDS_PARK_PHOTO, photoForFile } from './webster.js';
import { EarthExplorer, EARTH_CAMPAIGN } from './earth.js';
import { WorldAtlas } from './atlas.js';

// ---------------------------------------------------------------- palettes

const TERRAINS = {
  grass: { name: 'Grassland', color: '#7fa35f', visual: 'grass' },
  forest: { name: 'Forest', color: '#4f7149', visual: 'forest' },
  water: { name: 'Water', color: '#3d7b93', visual: 'water' },
  beach: { name: 'Beach', color: '#c5ad82', visual: 'beach' },
  urban: { name: 'Urban', color: '#7b817f', visual: 'urban' },
  dirt: { name: 'Dirt', color: '#8b765b', visual: 'dirt' },
  mountain: { name: 'Mountain', color: '#7c7d75', visual: 'mountain' },
  road: { name: 'Road', color: '#50545a', visual: 'road' },
  trail: { name: 'Park path', color: '#777a72', visual: 'trail' },
  residential: { name: 'Residential', color: '#7d7362', visual: 'urban' },
  park: { name: 'Park / forest', color: '#3f7a55', visual: 'forest' },
  industrial: { name: 'Industrial', color: '#5a5f6b', visual: 'urban' },
  open: { name: 'Open ground', color: '#8a7f63', visual: 'dirt' },
  denseForest: { name: 'Dense forest', color: '#365b3d', visual: 'forest' },
  lightWoodland: { name: 'Light woodland', color: '#678f58', visual: 'forest' },
  farmland: { name: 'Farmland', color: '#a89b63', visual: 'farmland' },
  river: { name: 'River', color: '#3c7f98', visual: 'water' },
  lake: { name: 'Lake', color: '#2f718c', visual: 'water' },
  shallow: { name: 'Shallow water', color: '#5fa8ad', visual: 'water' },
  deepwater: { name: 'Deep water', color: '#255d78', visual: 'water' },
  highway: { name: 'Highway', color: '#5c6268', visual: 'road' },
  marsh: { name: 'Marshland', color: '#718179', visual: 'marsh' },
  gravel: { name: 'Gravel', color: '#8a877b', visual: 'dirt' },
  hills: { name: 'Hills', color: '#7f8d64', visual: 'hills' },
  custom: { name: 'Custom terrain', color: '#8c7ca8', visual: 'grass' },
  important: { name: 'Important', color: '#b99245', visual: 'grass' },
  danger: { name: 'Dangerous', color: '#8f3b46', visual: 'dirt' },
  supernatural: { name: 'Supernatural', color: '#6b4bb0', visual: 'forest' },
};

const TERRAIN_IDS = Object.keys(TERRAINS);
const PAINT_TERRAINS = ['grass', 'forest', 'denseForest', 'lightWoodland', 'farmland', 'water', 'river', 'lake', 'shallow', 'deepwater', 'beach', 'urban', 'residential', 'industrial', 'highway', 'road', 'trail', 'dirt', 'gravel', 'marsh', 'hills', 'mountain', 'important', 'danger', 'supernatural', 'custom'];
const TERRAIN_VISUAL = Object.fromEntries(Object.entries(TERRAINS).map(([id, t]) => [id, t.visual]));

const CATEGORIES = [
  { id: 'location', name: 'Location', icon: 'pin' },
  { id: 'school', name: 'School', icon: 'book' },
  { id: 'hospital', name: 'Hospital', icon: 'heart' },
  { id: 'home', name: 'Residence', icon: 'home' },
  { id: 'police', name: 'Police', icon: 'shield' },
  { id: 'lab', name: 'Laboratory', icon: 'flask' },
  { id: 'shop', name: 'Shop / gas', icon: 'shop' },
  { id: 'park', name: 'Park / forest', icon: 'tree' },
  { id: 'crystal', name: 'Crystal site', icon: 'gem' },
  { id: 'danger', name: 'Danger', icon: 'skull' },
  { id: 'water', name: 'Water', icon: 'waves' },
  { id: 'road', name: 'Road', icon: 'road' },
  { id: 'other', name: 'Other', icon: 'target' },
];

const ICON_CHOICES = [
  'pin', 'home', 'book', 'heart', 'shield', 'flask', 'shop', 'tree', 'gem',
  'skull', 'waves', 'road', 'building', 'users', 'sparkles', 'target', 'zap',
  'eye', 'star', 'map',
];

const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
const iconFor = (tile) => tile.icon || categoryOf(tile.category).icon;

const SEASONS = {
  summer: { name: 'Summer', note: 'Green lawns, full canopy' },
  autumn: { name: 'Autumn', note: 'Orange and red foliage' },
  winter: { name: 'Winter', note: 'Snow cover, bare branches' },
  spring: { name: 'Spring', note: 'Mud, new growth' },
};
const WEATHERS = {
  clear: { name: 'Clear', note: 'Open sky and sun' },
  overcast: { name: 'Overcast', note: 'Flat gray light' },
  rain: { name: 'Rain', note: 'Wet ground and showers' },
  fog: { name: 'Fog', note: 'Low visibility' },
  snow: { name: 'Snow', note: 'Steady snowfall' },
};
const SEASON_IDS = Object.keys(SEASONS);
const WEATHER_IDS = Object.keys(WEATHERS);
const seasonOf = (map = activeMap()) => (SEASONS[map?.config?.season] ? map.config.season : 'summer');
const weatherOf = (map = activeMap()) => (WEATHERS[map?.config?.weather] ? map.config.weather : 'clear');


/** Editor state. Kept outside the render cycle so a re-render never wipes it. */
const ui = {
  view: 'world', // DM starts on the clean map; Edit unlocks the tools
  layer: 'atlas', // world atlas first; the hex world is the close-zoom layer
  tool: 'select',
  terrain: 'urban',
  color: TERRAINS.urban.color,
  selected: null, // { q, r }
  panel: 'tile',
  labelId: null,
  draftImage: undefined,
  moving: null, // waypoint being moved: { q, r }
  undo: [],
  redo: [],
  mapOpen: false,
  saving: false,
  hexFocus: null,
};

let earthExplorer = null;
let worldAtlas = null;
const earthSearch = { query: '', results: [], loading: false, error: '', attribution: '' };
const atlasSearch = { query: '', results: [], loading: false, error: '', attribution: '' };
const atlasUi = { coords: '', zoom: '' };

// ---------------------------------------------------------------- data

const maps = () => state.maps || [];

function activeMap() {
  const list = maps();
  if (!list.length) return null;
  const found = list.find((m) => m.id === state.mapId);
  if (found) return found;
  state.mapId = list[0].id;
  return list[0];
}

const keyOf = (q, r) => `${q}:${r}`;

function tileAt(q, r, map = activeMap()) {
  return map?.tiles.find((t) => Number(t.q) === Number(q) && Number(t.r) === Number(r)) || null;
}

function blankTile(q, r) {
  return {
    q, r, color: '', terrain: '', label: '', icon: '', waypoint: '', category: '',
    description: '', image: '', entryId: '', important: false, visible: true,
    players: [], npcs: [], dmNotes: '',
  };
}

const selectedTile = () => (ui.selected ? (tileAt(ui.selected.q, ui.selected.r) || blankTile(ui.selected.q, ui.selected.r)) : null);

function upsertLocalTile(mapId, tile) {
  const map = maps().find((m) => m.id === mapId);
  if (!map) return;
  const clean = { ...blankTile(tile.q, tile.r), ...tile, q: tile.q, r: tile.r };
  const i = map.tiles.findIndex((t) => t.q === tile.q && t.r === tile.r);
  if (i >= 0) map.tiles[i] = clean;
  else map.tiles.push(clean);
  map.updatedAt = Date.now();
}

function removeLocalTile(mapId, q, r) {
  const map = maps().find((m) => m.id === mapId);
  if (!map) return;
  map.tiles = map.tiles.filter((t) => !(t.q === q && t.r === r));
}

const hasContent = (t) => !!(t && (
  t.color || t.terrain || t.waypoint || t.label || t.icon || t.important
  || t.description || t.image || t.entryId
));

const isEditing = () => isDM() && ui.view === 'edit';

// ---------------------------------------------------------------- markup

function mapOptions() {
  return maps().map((m) => `<option value="${m.id}" ${m.id === activeMap()?.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

export function worldView() {
  const map = activeMap();
  const editing = isEditing();
  const dm = isDM();
  const onEarth = !!map && ui.layer === 'earth';
  const onAtlas = ui.layer === 'atlas';

  return `
  <div class="world-page ${editing ? 'is-editing' : ''} ${onEarth ? 'is-earth' : ''} ${onAtlas ? 'is-atlas' : ''}">
    <header class="world-top">
      <div class="world-title">
        <div class="eyebrow">${onEarth ? 'Earth Explorer · NASA Blue Marble' : onAtlas ? 'World Atlas · OpenStreetMap' : 'The world · Webster & Ontario'}</div>
        <h1>${onEarth ? 'Find your way in' : onAtlas ? 'Everywhere, at every scale' : map ? esc(map.name) : 'World map'}</h1>
      </div>
      <div class="world-actions">
        ${onEarth ? `
          <span class="world-env earth-coord">${icon('globe', { size: 13 })} ${EARTH_CAMPAIGN.name}</span>
          <button class="btn sm" data-act="earth-focus-campaign">${icon('target', { size: 13 })} Webster</button>
        ` : onAtlas ? `
          <span class="world-env">${icon('globe', { size: 13 })} NASA Blue Marble globe</span>
          <button class="btn sm" data-act="atlas-globe">${icon('globe', { size: 13 })} Globe</button>
        ` : map ? `
          <span class="world-env" title="${esc(SEASONS[seasonOf(map)].note)} · ${esc(WEATHERS[weatherOf(map)].note)}">
          ${icon('sun', { size: 13 })} ${esc(SEASONS[seasonOf(map)].name)} · ${esc(WEATHERS[weatherOf(map)].name)}</span>
          <button class="btn sm" data-act="world-atlas">${icon('map', { size: 13 })} Atlas</button>
          <button class="btn sm" data-act="world-earth">${icon('globe', { size: 13 })} Earth</button>
          ${maps().length > 1 ? `<label class="world-map-pick">${icon('layers', { size: 14 })}<select data-change="world-switch-map" aria-label="Switch map">${mapOptions()}</select></label>` : ''}
          ${dm ? `<div class="world-mode" role="group" aria-label="Map mode">
            <button class="${ui.view === 'world' ? 'on' : ''}" data-act="world-mode" data-mode="world">
              ${icon('compass', { size: 14 })} Explore</button>
            <button class="${ui.view === 'edit' ? 'on' : ''}" data-act="world-mode" data-mode="edit">
              ${icon('brush', { size: 14 })} Edit map</button>
          </div>
          <button class="btn sm" data-act="world-map-settings" title="Map settings">${icon('settings', { size: 14 })}</button>` : ''}
        ` : ''}
      </div>
    </header>

    <div class="world-body">
      <div class="world-stage ${onEarth ? 'is-earth-stage' : ''} ${onAtlas ? 'is-atlas-stage' : ''}" id="world-stage">
        ${onAtlas ? atlasMarkup() : map ? '<div class="world-assets" id="world-assets">Sculpting the world…</div>' : emptyWorld()}
        ${onEarth ? earthMarkup() : ''}
      </div>
      <aside class="world-side" id="world-side">${onEarth || onAtlas ? '' : sidePanel()}</aside>
    </div>

    ${editing && !onEarth && !onAtlas ? toolbar() : ''}
    ${map && !onEarth && !onAtlas ? `<div class="world-legend" aria-hidden="true">
      ${dm ? `<span class="wl-hint">${ui.tool === 'paint' ? 'Drag to paint hexes' : ui.tool === 'erase' ? 'Click a hex to clear it' : ui.tool === 'waypoint' ? 'Click a hex to place a location' : ui.tool === 'text' ? 'Click the map to drop a label' : ui.tool === 'move' ? 'Click a pin, then its destination' : 'Drag to pan · right-drag to rotate · hold right + WASD to fly'}</span>` : `<span class="wl-hint">Drag to pan · right-drag to rotate · hold right + WASD to fly</span>`}
      <span class="wl-coords" id="world-coords"></span>
    </div>` : ''}
  </div>`;
}

function atlasMarkup() {
  return `
  <div class="atlas-layer" id="atlas-layer">
    <div class="atlas-host" id="atlas-host"></div>
    <div class="atlas-hud">
      <div class="atlas-kicker">WORLD ATLAS</div>
      <h2>Everywhere,<br><em>at every scale.</em></h2>
      <p>Pan the real world. Zoom in until the streets become a living hex frontier. Zoom back out and keep travelling.</p>
      <form class="atlas-search" data-act="atlas-search">
        <label class="sr-only" for="atlas-query">Search the world</label>
        <input id="atlas-query" name="q" value="${esc(atlasSearch.query)}" placeholder="Search a city, park, address…" autocomplete="off" />
        <button type="submit" aria-label="Search the world">${icon('search', { size: 16 })}</button>
      </form>
      ${atlasSearch.loading ? '<div class="atlas-note">Reading the atlas…</div>' : ''}
      ${atlasSearch.error ? `<div class="atlas-note error">${esc(atlasSearch.error)}</div>` : ''}
      ${atlasSearch.results.length ? `<div class="atlas-results">
        ${atlasSearch.results.slice(0, 8).map((r) => `
          <button class="atlas-result" data-act="atlas-go" data-lat="${r.lat}" data-lon="${r.lon}" data-map-id="${esc(r.mapId || '')}" data-kind="${r.kind || 'place'}">
            <span class="atlas-result-ic">${icon(r.kind === 'campaign' ? 'pin' : 'globe', { size: 14 })}</span>
            <span><b>${esc(r.name)}</b><i>${esc(r.label || (r.kind === 'campaign' ? 'Campaign location' : 'Place on Earth'))}</i></span>
            ${icon('arrowRight', { size: 13 })}
          </button>`).join('')}
      </div>` : ''}
      <div class="atlas-readout"><span id="atlas-coords">${esc(atlasUi.coords || '43.2180° N · 77.4000° W')}</span><span id="atlas-zoom">${esc(atlasUi.zoom || 'ATLAS')}</span></div>
      <div class="atlas-cta">
        <button class="btn primary lg" data-act="atlas-enter">${icon('hex', { size: 15 })} Enter the hex world</button>
        <button class="btn sm" data-act="atlas-reset">${icon('target', { size: 13 })} Region</button>
        <button class="btn sm" data-act="atlas-globe">${icon('globe', { size: 13 })} Globe</button>
      </div>
      <div class="atlas-foot"><span>Drag to pan · scroll to zoom · zoom to street level to become hexes</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a></div>
    </div>
    <div class="atlas-scale">${icon('compass', { size: 13 })} <span id="atlas-scale-text">World map</span></div>
  </div>`;
}

function earthMarkup() {
  return `
  <div class="earth-layer" id="earth-layer">
    <div class="earth-host" id="earth-host"></div>
    <div class="earth-hud">
      <div class="earth-kicker">EARTH EXPLORER</div>
      <h2>Start anywhere.<br><em>Land in Webster.</em></h2>
      <p>Search the real world, fly across the globe, then cross the threshold into the editable hex campaign.</p>
      <form class="earth-search" data-act="earth-search">
        <label class="sr-only" for="earth-query">Search the Earth</label>
        <input id="earth-query" name="q" value="${esc(earthSearch.query)}" placeholder="Search a city, park, address…" autocomplete="off" />
        <button type="submit" aria-label="Search the Earth">${icon('search', { size: 16 })}</button>
      </form>
      ${earthSearch.loading ? '<div class="earth-note">Searching the atlas…</div>' : ''}
      ${earthSearch.error ? `<div class="earth-note error">${esc(earthSearch.error)}</div>` : ''}
      ${earthSearch.results.length ? `<div class="earth-results">
        ${earthSearch.results.slice(0, 8).map((r) => `
          <button class="earth-result" data-act="earth-go" data-lat="${r.lat}" data-lon="${r.lon}" data-kind="${r.kind || 'place'}" data-map-id="${esc(r.mapId || '')}" data-q="${r.q ?? ''}" data-r="${r.r ?? ''}">
            <span class="earth-result-ic">${icon(r.kind === 'campaign' ? 'pin' : 'globe', { size: 14 })}</span>
            <span><b>${esc(r.name)}</b><i>${esc(r.label || (r.kind === 'campaign' ? 'Campaign location' : 'Earth'))}</i></span>
            ${icon('arrowRight', { size: 13 })}
          </button>`).join('')}
      </div>` : ''}
      <div class="earth-cta">
        <button class="btn primary lg" data-act="earth-enter">${icon('hex', { size: 15 })} Enter Webster &amp; Ontario</button>
        <button class="btn sm" data-act="earth-zoom">${icon('globe', { size: 13 })} Zoom to campaign</button>
      </div>
      <div class="earth-foot"><span>Drag to rotate · scroll to descend · click a result to fly</span>${earthSearch.attribution ? `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${esc(earthSearch.attribution)}</a>` : '<span>Imagery: NASA Blue Marble</span>'}</div>
    </div>
  </div>`;
}

function emptyWorld() {
  if (!isDM()) {
    return `<div class="world-empty">
      <div class="we-ico">${icon('compass', { size: 28 })}</div>
      <h2>The world is still dark</h2>
      <p>The DM has not opened a map for this campaign yet.
        Once they reveal locations, they will appear here.</p>
    </div>`;
  }
  return `<div class="world-empty world-empty-webster" style="--photo:url('${NORTH_PONDS_HERO}')">
    <div class="we-ico">${icon('hex', { size: 28 })}</div>
    <div class="we-photo-tag">REAL WEBSTER, NY · NORTH PONDS PARK</div>
    <h2>Build your world</h2>
    <p>Start with the real ponds, loop trail and surrounding streets of North Ponds Park,
      or make a blank hex grid and paint it yourself.</p>
    <button class="we-preset" type="button" data-act="world-create-preset" data-preset="north-ponds">
      ${icon('map', { size: 17 })}
      <span><b>North Ponds Park</b><i>750 Holt Road · Webster, NY</i></span>
      ${icon('arrowRight', { size: 15 })}
    </button>
    <form class="world-create" data-act="world-create-map">
      <label class="field"><span>Blank map name</span>
        <input name="name" placeholder="Campaign Map" maxlength="60" value="Campaign Map" /></label>
      <div class="row">
        <label class="field"><span>Columns</span>
          <input name="cols" type="number" min="6" max="48" value="12" /></label>
        <label class="field"><span>Rows</span>
          <input name="rows" type="number" min="6" max="48" value="10" /></label>
        <button class="btn" type="button" data-act="world-create-preset" data-preset="webster-ontario">
          ${icon('globe', { size: 13 })} Webster &amp; Ontario · Lake Ontario
        </button>
      </div>
      <button class="btn primary lg" type="submit">${icon('plus', { size: 15 })} Create a blank world</button>
    </form>
  </div>`;
}

function toolbar() {
  const tool = (id, ic, label) => `
    <button class="wtool ${ui.tool === id ? 'on' : ''}" data-act="world-tool" data-tool="${id}" title="${label}">
      ${icon(ic, { size: 17 })}<span>${label}</span>
    </button>`;

  return `
  <div class="world-toolbar">
    <div class="wt-group">
      ${tool('select', 'target', 'Select')}
      ${tool('paint', 'brush', 'Paint')}
      ${tool('erase', 'eraser', 'Erase')}
      ${tool('waypoint', 'pin', 'Waypoint')}
      ${tool('text', 'text', 'Text')}
      ${tool('move', 'hand', 'Move')}
    </div>
    ${ui.tool === 'paint' ? `
      <div class="wt-terrains">
        ${PAINT_TERRAINS.map((id) => `
          <button class="wt-swatch ${ui.terrain === id ? 'on' : ''}" data-act="world-terrain"
            data-terrain="${id}" title="${TERRAINS[id].name}"
            style="--sw:${TERRAINS[id].color}"><i></i><span>${TERRAINS[id].name}</span></button>`).join('')}
        <label class="wt-custom" title="Any colour you like">
          <input type="color" value="${esc(ui.color)}" data-change="world-color" aria-label="Custom tile colour" />
          <span>Custom</span>
        </label>
      </div>` : ''}
    <div class="wt-group wt-right">
      <button class="wtool" data-act="world-undo" ${ui.undo.length ? '' : 'disabled'} title="Undo">
        ${icon('undo', { size: 17 })}<span>Undo</span></button>
      <button class="wtool" data-act="world-redo" ${ui.redo.length ? '' : 'disabled'} title="Redo">
        ${icon('redo', { size: 17 })}<span>Redo</span></button>
      <button class="wtool" data-act="world-zoom" data-dir="in" title="Zoom in">${icon('plus', { size: 17 })}</button>
      <button class="wtool" data-act="world-zoom" data-dir="out" title="Zoom out">${icon('minus', { size: 17 })}</button>
      <button class="wtool" data-act="world-zoom" data-dir="fit" title="Recentre">${icon('crosshair', { size: 17 })}</button>
    </div>
  </div>`;
}

function sidePanel() {
  if (!isDM() && !activeMap()) return '';

  if (ui.panel === 'map') return mapSettings();
  if (ui.panel === 'newmap') return newMapForm();
  if (ui.labelId) return labelEditor();

  if (!ui.selected) return worldIndex();

  const tile = selectedTile();
  if (!tile) return worldIndex();

  if (!isDM() || ui.view === 'world') return locationInfo(tile);
  return tileEditor(tile);
}

function worldIndex() {
  const map = activeMap();
  const locations = (map?.tiles || []).filter((t) => t.waypoint || t.label || t.important);
  const dm = isDM();

  return `
  <div class="wi">
    <div class="wi-head">
      <div class="eyebrow">${dm ? 'Map index' : 'Locations'}</div>
      <h2>${locations.length} location${locations.length === 1 ? '' : 's'}</h2>
      <p class="tiny">${dm
        ? 'Click a hex to open it. Use Edit map to paint terrain, name places and place waypoints.'
        : 'Click a marked location to read what your party knows.'}</p>
    </div>

    ${locations.length ? `<div class="wi-list">
      ${locations
        .slice()
        .sort((a, b) => String(a.waypoint || a.label).localeCompare(String(b.waypoint || b.label)))
        .map((t) => `
        <button class="wi-row" data-act="world-go-hex" data-q="${t.q}" data-r="${t.r}">
          <span class="wi-ic" style="--tint:${esc(t.color || TERRAINS[t.terrain]?.color || '#6b7080')}">
            ${icon(iconFor(t), { size: 14 })}</span>
          <span class="grow"><b>${esc(t.waypoint || t.label || 'Unnamed hex')}</b>
            <i>${esc(categoryOf(t.category).name)}</i></span>
          ${t.image ? `<span class="wi-thumb" style="background-image:url('${esc(t.image)}')"></span>` : ''}
          ${t.visible ? '' : '<span class="tag red">hidden</span>'}
        </button>`).join('')}
    </div>` : `<p class="muted" style="margin-top:16px">${dm
      ? 'Nothing marked yet. Pick the waypoint tool and click a hex.'
      : 'No locations have been revealed yet.'}</p>`}

    <div class="wi-terrain">
      <div class="eyebrow" style="margin-bottom:8px">Terrain key</div>
      <div class="wi-key">
        ${TERRAIN_IDS.map((id) => `<span><i style="background:${TERRAINS[id].color}"></i>${TERRAINS[id].name}</span>`).join('')}
      </div>
    </div>

    ${dm ? `<div class="wi-actions">
      <button class="btn sm" data-act="world-map-settings">${icon('settings', { size: 13 })} Map settings</button>
      <button class="btn sm" data-act="world-new-map">${icon('plus', { size: 13 })} New map</button>
    </div>` : ''}
  </div>`;
}

function locationInfo(tile) {
  const map = activeMap();
  const players = (tile.players || [])
    .map((id) => state.characters.find((c) => c.id === id)).filter(Boolean);
  const linked = tile.entryId ? state.entries.find((e) => e.id === tile.entryId) : null;
  const photo = photoForFile(tile.image);
  const dm = isDM();

  return `
  <div class="location-info">
    ${tile.image
      ? `<div class="li-img" style="background-image:url('${esc(tile.image)}')"></div>`
      : `<div class="li-img li-empty" style="--tint:${esc(tile.color || TERRAINS[tile.terrain]?.color || '#6b7080')}">
          ${icon(iconFor(tile), { size: 34 })}</div>`}
    ${photo ? `<div class="li-credit">Photo: ${esc(photo.credit)} · ${esc(photo.license)} · <a href="${esc(photo.sourceUrl)}" target="_blank" rel="noopener">source</a></div>` : ''}
    <div class="li-body">
      <div class="li-kicker">${icon(iconFor(tile), { size: 12 })} ${esc(categoryOf(tile.category).name)}</div>
      <h2>${esc(tile.waypoint || tile.label || `Hex ${tile.q}, ${tile.r}`)}</h2>
      ${tile.description ? `<p class="li-desc">${esc(tile.description)}</p>` : '<p class="muted">Nothing written about this place yet.</p>'}

      ${players.length ? `<div class="li-block">
        <div class="eyebrow">Party here</div>
        <div class="li-chips">${players.map((c) => `<span class="li-chip">${icon('shield', { size: 12 })} ${esc(c.name)}</span>`).join('')}</div>
      </div>` : ''}

      ${(tile.npcs || []).length ? `<div class="li-block">
        <div class="eyebrow">NPCs here</div>
        <div class="li-chips">${tile.npcs.map((n) => `<span class="li-chip">${icon('users', { size: 12 })} ${esc(n)}</span>`).join('')}</div>
      </div>` : ''}

      ${linked ? `<button class="btn primary" style="margin-top:14px" data-act="world-open-entry" data-id="${linked.id}">
        ${icon('book', { size: 14 })} Open the ${esc(linked.kind)} entry</button>` : ''}

      ${dm ? `<div class="li-dm">
        <span class="tag red">DM</span>
        <button class="btn sm" data-act="world-edit-hex" data-q="${tile.q}" data-r="${tile.r}">
          ${icon('edit', { size: 12 })} Edit this location</button>
        ${tile.visible ? '' : '<span class="tiny">Hidden from players</span>'}
      </div>` : ''}

      <div class="li-foot tiny mono">Hex ${tile.q}, ${tile.r}${map ? ` · ${esc(map.name)}` : ''}</div>
    </div>
  </div>`;
}

function tileEditor(tile) {
  const map = activeMap();
  const image = ui.draftImage !== undefined ? ui.draftImage : tile.image;
  const photo = photoForFile(image);
  const npcEntries = state.entries.filter((e) => e.kind === 'npc');
  const linkedEntries = state.entries;

  return `
  <form class="world-form" data-act="world-save-tile" data-q="${tile.q}" data-r="${tile.r}" data-form-key="${tile.q}:${tile.r}">
    <div class="wf-head">
      <div>
        <div class="eyebrow">Hex ${tile.q}, ${tile.r}</div>
        <h2>${esc(tile.waypoint || tile.label || 'Edit tile')}</h2>
      </div>
      <button type="button" class="wf-close" data-act="world-deselect" title="Close">${icon('x', { size: 15 })}</button>
    </div>

    <div class="wf-group">
      <div class="eyebrow">Tile</div>
      <label class="wf-field"><span>Colour</span>
        <div class="wf-color">
          <input type="color" name="color" value="${esc(tile.color || TERRAINS[tile.terrain]?.color || '#6b7080')}" />
          <span>${esc(tile.color || TERRAINS[tile.terrain]?.color || '#6b7080')}</span>
          <button type="button" class="btn sm" data-act="world-clear-color">Terrain colour</button>
        </div>
      </label>
      <label class="wf-field"><span>Elevation <em class="wf-range-value">${(Number(tile.elevation) || 0).toFixed(2)}</em></span>
        <input class="wf-range" name="elevation" type="range" min="-0.35" max="1.1" step="0.02" value="${Number(tile.elevation) || 0}" />
        <small>Lifts or lowers this hex. Forest and water keep their own base height.</small></label>
      <label class="wf-field"><span>Terrain</span>
        <select name="terrain">
          <option value="">None</option>
          ${TERRAIN_IDS.map((id) => `<option value="${id}" ${tile.terrain === id ? 'selected' : ''}>${TERRAINS[id].name}</option>`).join('')}
        </select>
      </label>
      <label class="wf-check"><input type="checkbox" name="important" ${tile.important ? 'checked' : ''} />
        <span><b>Important location</b><i>Raises the tile and adds a marker.</i></span></label>
      <label class="wf-field"><span>Name on the tile</span>
        <input name="label" maxlength="70" value="${esc(tile.label)}" placeholder="e.g. Crystal site" /></label>
      <label class="wf-field"><span>Icon</span>
        <select name="icon">
          <option value="">From category</option>
          ${ICON_CHOICES.map((id) => `<option value="${id}" ${tile.icon === id ? 'selected' : ''}>${id}</option>`).join('')}
        </select>
      </label>
    </div>

    <div class="wf-group">
      <div class="eyebrow">Waypoint</div>
      <label class="wf-field"><span>Waypoint name</span>
        <input name="waypoint" maxlength="90" value="${esc(tile.waypoint)}" placeholder="e.g. Northside High" /></label>
      <label class="wf-field"><span>Category</span>
        <select name="category">
          ${CATEGORIES.map((c) => `<option value="${c.id}" ${tile.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </label>
      <label class="wf-field"><span>Description players can read</span>
        <textarea name="description" rows="4" maxlength="3000"
          placeholder="What is this place? What have the players seen?">${esc(tile.description)}</textarea></label>

      <div class="wf-field"><span>Image</span>
        <div class="wf-image">
          ${image ? `<div class="wf-thumb" style="background-image:url('${esc(image)}')"></div>`
            : `<div class="wf-thumb wf-thumb-empty">${icon(iconFor(tile), { size: 20 })}</div>`}
          <div class="grow">
            <input name="image" value="${esc(image)}" placeholder="https://…, upload, or choose a Webster photo below" />
            <div class="row" style="margin-top:6px">
              <button type="button" class="btn sm" data-act="world-pick-image">${icon('plus', { size: 12 })} Attach photo</button>
              ${image ? `<button type="button" class="btn sm" data-act="world-clear-image">Remove</button>` : ''}
            </div>
          </div>
        </div>
        ${photo ? `<div class="wf-credit">Photo: ${esc(photo.credit)} · ${esc(photo.license)} · <a href="${esc(photo.sourceUrl)}" target="_blank" rel="noopener">source</a></div>` : ''}
        ${websterPhotoPicker()}
      </div>

      <label class="wf-field"><span>Codex entry</span>
        <select name="entryId">
          <option value="">Not linked</option>
          ${linkedEntries.map((e) => `<option value="${e.id}" ${tile.entryId === e.id ? 'selected' : ''}>${esc(e.title)} — ${esc(e.kind)}</option>`).join('')}
        </select>
      </label>

      <label class="wf-field"><span>NPCs here — one per line</span>
        <textarea name="npcs" rows="3" placeholder="Principal Ada Rook&#10;Deputy Hale">${esc((tile.npcs || []).join('\n'))}</textarea></label>
      ${npcEntries.length ? `<div class="wf-quick">
        ${npcEntries.slice(0, 8).map((n) => `<button type="button" class="btn sm" data-act="world-add-npc" data-name="${esc(n.title)}">+ ${esc(n.title)}</button>`).join('')}
      </div>` : ''}

      <div class="wf-field"><span>Party characters here</span>
        <div class="wf-players">
          ${state.characters.map((c) => `
            <label class="wf-check sm"><input type="checkbox" name="players" value="${c.id}"
              ${(tile.players || []).includes(c.id) ? 'checked' : ''} />
              <span><b>${esc(c.name)}</b><i>${esc(c.class || 'Hero')} ${c.level}</i></span></label>`).join('')
            || '<p class="tiny">No characters in this campaign yet.</p>'}
        </div>
      </div>
    </div>

    <div class="wf-group">
      <label class="wf-check"><input type="checkbox" name="visible" ${tile.visible ? 'checked' : ''} />
        <span><b>Revealed to players</b><i>When off, players see empty ground here.</i></span></label>
      <label class="wf-field"><span>Private DM notes</span>
        <textarea name="dmNotes" rows="3" placeholder="Never sent to players">${esc(tile.dmNotes || '')}</textarea></label>
    </div>

    <div class="wf-foot">
      <div class="tiny" id="world-save-state">Changes save automatically</div>
      <div class="row">
        <button type="button" class="btn danger" data-act="world-erase-hex" data-q="${tile.q}" data-r="${tile.r}">
          ${icon('eraser', { size: 13 })} Clear</button>
        <button type="submit" class="btn primary">${icon('check', { size: 13 })} Save location</button>
      </div>
    </div>
  </form>`;
}

function websterPhotoPicker() {
  return `<details class="wf-photo-library">
    <summary>${icon('eye', { size: 13 })} Webster photo library <span>${WEBSTER_PHOTOS.length} real local photographs</span></summary>
    <p class="tiny">Verified Webster scenes with their actual locations. Choose one for this place; all files are local and credited.</p>
    <div class="wf-photo-grid">
      ${WEBSTER_PHOTOS.map((photo) => `
        <button type="button" class="wf-photo-card" data-act="world-use-photo" data-image="${esc(photo.file)}"
          title="${esc(photo.title)} — ${esc(photo.place)} — ${esc(photo.credit)}, ${esc(photo.license)}">
          <span style="background-image:url('${esc(photo.file)}')"></span>
          <b>${esc(photo.title)}</b>
          <i>${esc(photo.place)}</i>
        </button>`).join('')}
    </div>
    <div class="wf-photo-foot"><a href="/assets/webster/CREDITS.md" target="_blank" rel="noopener">Sources, authors &amp; licences</a></div>
  </details>`;
}

function labelEditor() {
  const map = activeMap();
  const label = map?.labels.find((l) => l.id === ui.labelId);
  if (!label) return worldIndex();

  return `
  <form class="world-form" data-act="world-save-label" data-id="${label.id}" data-form-key="label:${label.id}">
    <div class="wf-head">
      <div><div class="eyebrow">Map label</div><h2>${esc(label.text)}</h2></div>
      <button type="button" class="wf-close" data-act="world-deselect" title="Close">${icon('x', { size: 15 })}</button>
    </div>
    <label class="wf-field"><span>Text</span>
      <input name="text" maxlength="80" value="${esc(label.text)}" /></label>
    <label class="wf-field"><span>Size</span>
      <input name="size" type="range" min="10" max="48" value="${label.size}" /></label>
    <label class="wf-field"><span>Colour</span>
      <input name="color" type="color" value="${esc(label.color || '#e8e6f2')}" /></label>
    <label class="wf-check"><input type="checkbox" name="visible" ${label.visible ? 'checked' : ''} />
      <span><b>Revealed to players</b></span></label>
    <p class="tiny">Drag the label on the map to move it.</p>
    <div class="wf-foot">
      <button type="button" class="btn danger" data-act="world-delete-label" data-id="${label.id}">
        ${icon('trash', { size: 13 })} Delete</button>
      <button type="submit" class="btn primary">${icon('check', { size: 13 })} Save label</button>
    </div>
  </form>`;
}

function mapSettings() {
  const map = activeMap();
  if (!map) return newMapForm();
  return `
  <form class="world-form" data-act="world-save-map" data-id="${map.id}" data-form-key="map:${map.id}">
    <div class="wf-head">
      <div><div class="eyebrow">Map settings</div><h2>${esc(map.name)}</h2></div>
      <button type="button" class="wf-close" data-act="world-deselect" title="Close">${icon('x', { size: 15 })}</button>
    </div>
    <label class="wf-field"><span>Name</span>
      <input name="name" maxlength="60" value="${esc(map.name)}" /></label>
    <div class="row">
      <label class="wf-field"><span>Columns</span>
        <input name="cols" type="number" min="6" max="48" value="${map.cols}" /></label>
      <label class="wf-field"><span>Rows</span>
        <input name="rows" type="number" min="6" max="48" value="${map.rows}" /></label>
    </div>
    <p class="tiny">Growing the grid keeps every existing hex. Shrinking hides nearby hexes but does not delete their data.</p>
    <label class="wf-field"><span>Vegetation density</span>
      <input name="density" type="range" min="0.4" max="1.8" step="0.1" value="${Number(map.config?.density) || 1}" />
      <span class="tiny">Controls trees, shrubs and ground cover across the whole map. Paint Forest or Grassland hexes to grow environments.</span>
    </label>
    <div class="wf-group">
      <div class="eyebrow">Season &amp; atmosphere</div>
      <div class="row">
        <label class="wf-field"><span>Season</span>
          <select name="season">
            ${SEASON_IDS.map((id) => `<option value="${id}" ${seasonOf(map) === id ? 'selected' : ''}>${esc(SEASONS[id].name)}</option>`).join('')}
          </select></label>
        <label class="wf-field"><span>Weather</span>
          <select name="weather">
            ${WEATHER_IDS.map((id) => `<option value="${id}" ${weatherOf(map) === id ? 'selected' : ''}>${esc(WEATHERS[id].name)}</option>`).join('')}
          </select></label>
      </div>
      <p class="tiny">${esc(SEASONS[seasonOf(map)].note)} · ${esc(WEATHERS[weatherOf(map)].note)}. The 3D map rebuilds when you save.</p>
    </div>
    <figure class="map-reference">
      <img src="${NORTH_PONDS_HERO}" alt="Aerial reference of North Ponds Park and the surrounding Webster neighborhood" loading="lazy" />
      <figcaption><b>Real-world reference</b> · North Ponds Park and the Route 104/Holt Road area. USDA NAIP aerial via USGS The National Map, public domain. <a href="/assets/webster/CREDITS.md" target="_blank" rel="noopener">Photo credits</a></figcaption>
    </figure>
    <div class="wf-foot">
      <button type="submit" class="btn primary">Save</button>
      <button type="button" class="btn danger" data-act="world-delete-map" data-id="${map.id}">
        ${icon('trash', { size: 13 })} Delete map</button>
    </div>
    <div class="wf-group" style="margin-top:18px">
      <div class="eyebrow">All maps</div>
      ${maps().map((m) => `<button type="button" class="wi-row" data-act="world-open-map" data-id="${m.id}">
        ${icon('layers', { size: 13 })}<span class="grow"><b>${esc(m.name)}</b><i>${m.cols} × ${m.rows}</i></span>
        ${m.id === map.id ? '<span class="tag">open</span>' : ''}</button>`).join('')}
    </div>
  </form>`;
}

function newMapForm() {
  return `
  <form class="world-form" data-act="world-create-map" data-form-key="newmap">
    <div class="wf-head">
      <div><div class="eyebrow">New map</div><h2>Another corner of the world</h2></div>
      <button type="button" class="wf-close" data-act="world-deselect" title="Close">${icon('x', { size: 15 })}</button>
    </div>
    <label class="wf-field"><span>Name</span>
      <input name="name" maxlength="60" placeholder="e.g. Downtown" /></label>
    <div class="row">
      <label class="wf-field"><span>Columns</span>      <input name="cols" type="number" min="6" max="48" value="12" /></label>
      <label class="wf-field"><span>Rows</span><input name="rows" type="number" min="6" max="48" value="10" /></label>
    </div>
    <button class="btn primary" type="submit">${icon('plus', { size: 13 })} Create map</button>
    <button class="btn" type="button" data-act="world-create-preset" data-preset="webster-ontario">
      ${icon('globe', { size: 13 })} Use the Webster &amp; Ontario region
    </button>
    <button class="btn" type="button" data-act="world-create-preset" data-preset="north-ponds">
      ${icon('map', { size: 13 })} Use the North Ponds Park layout
    </button>
  </form>`;
}

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
let farGroup = null;
let farLandMesh = null;
let farWaterMesh = null;
let cellObjectCache = new Map();
let cellObjectCacheKey = '';
let foliageGroup = null;
let foliageTimer = 0;
let overlayItems = [];
let hovered = null;
let keyLight = null;
let hemiLight = null;
let ambientLight = null;
let skyMaterial = null;
let ocean = null;
let landUnderlay = null;
let farLandMaterial = null;
let farWaterMaterial = null;
let foamMaterial = null;
let shallowMaterial = null;
let snowMaterial = null;
let precipitation = null;
let currentSeason = 'summer';
let currentWeather = 'clear';
let lastFrameTime = 0;
let rebuildTimer = 0;
let frontierResizeTimer = 0;
let frontierBuildInFlight = false;
let frontierBuildToken = 0;
let assetState = 'idle';
let buildingKit = null;

const WATER_Y = -0.16;
const SQRT3 = Math.sqrt(3);
const MAX_TREES = 500;
const MAX_GROUND = 850;
const FOLIAGE_RADIUS = 10;

// The infinite world uses a fixed global lattice. The same projection is used
// by server/region.js to place the authored Webster/Ontario seed on it.
const GLOBAL_HEX_METERS = 160;
const MERCATOR_R = 6378137;
// The frontier follows the current zoom. At the normal flight altitude it is
// deliberately small enough to rebuild in a few milliseconds; zooming out
// expands it before the camera can see the edge.
const INFINITE_MIN_RADIUS = 38;
const INFINITE_MAX_RADIUS = 84;
const DETAIL_RADIUS = 8;
const infinite = { mapId: null, focusKey: '', q: 0, r: 0, baseX: 0, baseZ: 0, radius: 0 };
const terrainSampler = { canvas: null, ctx: null, maskPixels: null, ready: false, loading: false };
const proceduralTileCache = new Map();

const camera = { target: new THREE.Vector3(0, 0.35, 0), dist: 22, want: 22, azimuth: -Math.PI / 4, polar: 0.94 };
const pointer = { down: false, moved: false, x: 0, y: 0, button: 0, mode: '', id: null, stroke: null, draggingLabel: null, rightDown: false };
const flyKeys = new Set();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const GROUND_KEYS = {
  grass: 'grass', forest: 'forest', beach: 'sand', urban: 'concrete',
  road: 'asphalt', trail: 'concrete', dirt: 'dirt', mountain: 'rock',
  farmland: 'grass', marsh: 'dirt', hills: 'grass',
};
const GROUND_TINTS = {
  grass: '#a8d47f', forest: '#86b16c', beach: '#e4d2a8', urban: '#c2c5bf',
  road: '#aeb4b8', trail: '#a6a49a', dirt: '#bda886', mountain: '#b2b1a8',
  farmland: '#c9ba7c', marsh: '#8f9c89', hills: '#91a776',
};
const SEASON_TINTS = {
  summer: '#c0d69c', autumn: '#d5ad72', winter: '#dfe9e8', spring: '#aabf92',
};
const MODEL_DEFS = [
  { id: 'leafy1', file: '/assets/world/models/leafy-tree-01.glb', height: 3.15, wind: true, shadow: true },
  { id: 'leafy2', file: '/assets/world/models/leafy-tree-02.glb', height: 2.8, wind: true, shadow: true },
  { id: 'conifer', file: '/assets/world/models/conifer-01.glb', height: 3.35, wind: true, shadow: true },
  { id: 'grass', file: '/assets/world/models/grass-clump-01.glb', height: 0.52, wind: true, shadow: false },
  { id: 'fern', file: '/assets/world/models/fern-01.glb', height: 0.58, wind: true, shadow: false },
  { id: 'bush', file: '/assets/world/models/shrub-01.glb', height: 0.72, wind: true, shadow: true },
  { id: 'log', file: '/assets/world/models/fallen-branches-01.glb', height: 0.14, wind: false, shadow: false },
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

function isInfinite(map = activeMap()) {
  return !!map?.config?.infinite;
}

function frontierRadius() {
  const zoom = Math.max(Number(camera.dist) || 21, Number(camera.want) || 21);
  return Math.max(INFINITE_MIN_RADIUS, Math.min(INFINITE_MAX_RADIUS, Math.ceil(zoom * 1.35 + 12)));
}

function frontierRecenterDistance() {
  return Math.max(12, Math.floor(frontierRadius() * 0.38));
}

function scheduleFrontierResize() {
  if (!isInfinite() || !three) return;
  if (frontierRadius() <= (infinite.radius || 0) + 3) return;
  clearTimeout(frontierResizeTimer);
  frontierResizeTimer = setTimeout(() => {
    frontierResizeTimer = 0;
    if (!isInfinite() || !three || state.page !== 'world' || ui.layer !== 'campaign') return;
    lastSig = '';
    buildTiles();
  }, 220);
}

function globalHexCenter(q, r) {
  return { x: (q + r / 2) * SQRT3, z: r * 1.5 };
}

function latLonToGlobalHex(lat, lon) {
  const x = (MERCATOR_R * lon * Math.PI / 180) / GLOBAL_HEX_METERS;
  const my = MERCATOR_R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const z = -my / GLOBAL_HEX_METERS;
  const qf = x / SQRT3 - z / 3;
  const rf = (2 / 3) * z;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const xr = Math.round(qf - q);
  const zr = Math.round(rf - r);
  if (Math.abs(xr) > Math.abs(zr)) q += xr;
  else r += zr;
  return { q, r };
}

function globalAxialAt(x, z) {
  const qf = x / SQRT3 - z / 3;
  const rf = (2 / 3) * z;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const xr = Math.round(qf - q);
  const zr = Math.round(rf - r);
  if (Math.abs(xr) > Math.abs(zr)) q += xr;
  else r += zr;
  return { q, r };
}

function globalHexToLatLon(q, r) {
  const x = (q + r / 2) * SQRT3;
  const z = r * 1.5;
  const mx = x * GLOBAL_HEX_METERS;
  const my = -z * GLOBAL_HEX_METERS;
  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(my / MERCATOR_R)),
    lon: (mx / MERCATOR_R) * 180 / Math.PI,
  };
}

function infiniteOrigin(map) {
  const focus = ui.hexFocus || map?.config?.start || map?.config?.geo?.center || EARTH_CAMPAIGN;
  const key = `${Number(focus.lat).toFixed(6)},${Number(focus.lon).toFixed(6)}`;
  if (infinite.mapId !== map.id || infinite.focusKey !== key) {
    const point = latLonToGlobalHex(Number(focus.lat), Number(focus.lon));
    const center = globalHexCenter(point.q, point.r);
    infinite.mapId = map.id;
    infinite.focusKey = key;
    infinite.q = point.q;
    infinite.r = point.r;
    infinite.baseX = center.x;
    infinite.baseZ = center.z;
  }
  return infinite;
}

function loadTerrainSampler() {
  if (terrainSampler.loading || terrainSampler.ready) return;
  terrainSampler.loading = true;
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    terrainSampler.canvas = canvas;
    terrainSampler.ctx = ctx;
    terrainSampler.maskPixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    terrainSampler.ready = true;
    proceduralTileCache.clear();
    if (isInfinite()) {
      lastSig = '';
      scheduleRebuild();
    }
  };
  image.onerror = () => { terrainSampler.loading = false; };
  image.src = '/assets/earth/water-mask.png';
}

function sampleWater(lat, lon) {
  if (!terrainSampler.ready || !terrainSampler.maskPixels) return false;
  const x = Math.max(0, Math.min(1023, Math.round(((lon + 180) / 360) * 1023)));
  const y = Math.max(0, Math.min(511, Math.round(((90 - lat) / 180) * 511)));
  return terrainSampler.maskPixels[(y * 1024 + x) * 4] > 128;
}

function proceduralTile(q, r) {
  const cacheKey = `${q}:${r}`;
  const cached = proceduralTileCache.get(cacheKey);
  if (cached) return cached;
  const geo = globalHexToLatLon(q, r);
  const water = sampleWater(geo.lat, geo.lon);
  const absLat = Math.abs(geo.lat);
  const n = hash2(q, r, 3);
  const n2 = hash2(q, r, 7);
  let terrain;
  // The water mask is authoritative: never paint ocean from a colour guess.
  if (water) terrain = 'deepwater';
  else if (absLat > 68) terrain = n > 0.62 ? 'mountain' : 'forest';
  else if (absLat > 55) terrain = n > 0.7 ? 'mountain' : n > 0.28 ? 'denseForest' : 'forest';
  else if (absLat < 18) terrain = n > 0.55 ? 'forest' : 'grass';
  else if (n > 0.88) terrain = 'mountain';
  else if (n > 0.72) terrain = 'forest';
  else if (n > 0.58) terrain = 'lightWoodland';
  else if (n < 0.12 || n2 < 0.08) terrain = 'farmland';
  else if (n < 0.2) terrain = 'hills';
  else terrain = 'grass';
  const tile = { q, r, terrain, color: '', label: '', icon: '', waypoint: '', category: '', description: '', image: '', entryId: '', important: false, visible: true, players: [], npcs: [], dmNotes: '' };
  // A frontier window overlaps the previous one heavily. Keeping generated
  // tiles avoids repeating water-mask and terrain work on every recenter.
  if (terrainSampler.ready) {
    if (proceduralTileCache.size > 120000) proceduralTileCache.clear();
    proceduralTileCache.set(cacheKey, tile);
  }
  return tile;
}

function scheduleInfiniteRecenter() {
  if (!isInfinite() || !three) return;
  const map = activeMap();
  if (!map || state.page !== 'world' || ui.layer !== 'campaign') return;

  // Keep the origin fixed so saved labels and authored tiles stay in their
  // world positions. Only the window of generated global cells follows the
  // camera; travelling past the buffer builds the next window around it.
  const wx = infinite.baseX + camera.target.x;
  const wz = infinite.baseZ + camera.target.z;
  const chunk = globalHexCenter(infinite.q, infinite.r);
  if (Math.hypot(wx - chunk.x, wz - chunk.z) < frontierRecenterDistance()) return;

  const cell = globalAxialAt(wx, wz);
  if (cell.q === infinite.q && cell.r === infinite.r) return;
  if (frontierBuildInFlight) return;
  infinite.q = cell.q;
  infinite.r = cell.r;
  lastSig = '';
  streamFrontier();
}

function streamFrontier() {
  if (frontierBuildInFlight || !isInfinite() || !three) return;
  const map = activeMap();
  if (!map || state.page !== 'world' || ui.layer !== 'campaign') return;
  const radius = frontierRadius();
  const center = mapCenter(map);
  const origin = infiniteOrigin(map);
  const cacheRoot = `${map.id}:${origin.baseX.toFixed(3)}:${origin.baseZ.toFixed(3)}`;
  if (cacheRoot !== cellObjectCacheKey) {
    cellObjectCache = new Map();
    cellObjectCacheKey = cacheRoot;
  }
  const nextCells = [];
  const nextIndex = new Map();
  frontierBuildInFlight = true;
  const token = ++frontierBuildToken;
  let dr = -radius;
  let dq = -radius;
  let index = 0;

  const finish = () => {
    if (token !== frontierBuildToken || !isInfinite() || activeMap()?.id !== map.id) {
      frontierBuildInFlight = false;
      return;
    }
    clearEnvironment();
    cells = nextCells;
    cellIndex = nextIndex;
    tileBody = null;
    buildTerrain(map);
    buildFarTerrain();
    buildBuildings(map);
    buildVegetation(map);
    updateRings();
    syncOverlay();
    frontierBuildInFlight = false;
  };

  const step = () => {
    if (token !== frontierBuildToken || !isInfinite() || activeMap()?.id !== map.id) {
      frontierBuildInFlight = false;
      return;
    }
    const frameStarted = performance.now();
    while (dr <= radius) {
      while (dq <= radius) {
        if (Math.abs(dq + dr) <= radius) {
          const q = origin.q + dq;
          const r = origin.r + dr;
          const tile = tileAt(q, r, map) || proceduralTile(q, r);
          const distance = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
          const detail = distance <= DETAIL_RADIUS;
          const cellKey = keyOf(q, r);
          let cell = cellObjectCache.get(cellKey);
          if (!cell) {
            cell = { q, r, col: dq, row: dr, tile, detail, x: 0, z: 0, elevation: 0 };
            cellObjectCache.set(cellKey, cell);
          }
          cell.tile = tile;
          cell.detail = detail;
          cell.col = dq;
          cell.row = dr;
          cell.x = (q + r / 2) * SQRT3 - center.x;
          cell.z = r * 1.5 - center.z;
          cell.elevation = detail ? elevation(tile) : (visualOf(tile) === 'water' ? WATER_Y : 0.34);
          nextCells.push(cell);
          nextIndex.set(cellKey, index);
          index++;
        }
        dq++;
        if (performance.now() - frameStarted > 10) {
          requestAnimationFrame(step);
          return;
        }
      }
      dq = -radius;
      dr++;
    }
    finish();
  };
  requestAnimationFrame(step);
}

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
    beach: 0.13, grass: 0.34, forest: 0.4, urban: 0.33,
    dirt: 0.31, road: 0.335, trail: 0.335, mountain: 0.7,
    farmland: 0.32, marsh: 0.29, hills: 0.48,
  }[visual] ?? 0.34;
  const jitter = visual === 'mountain' ? hash2(tile.q, tile.r, 2) * 0.34 : (hash2(tile.q, tile.r, 2) - 0.5) * 0.028;
  const extra = (tile.important ? 0.2 : 0) + (tile.waypoint ? 0.045 : 0);
  const author = Number(tile.elevation) || 0;
  return Math.max(WATER_Y + 0.04, base + jitter + extra + author);
}

function hexPoint(q, r, y = 0) {
  return new THREE.Vector3((q + r / 2) * SQRT3, y, r * 1.5);
}

function mapCenter(map) {
  if (isInfinite(map)) {
    const origin = infiniteOrigin(map);
    return new THREE.Vector3(origin.baseX, 0, origin.baseZ);
  }
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
  const season = seasonOf();
  base.lerp(colorOf(SEASON_TINTS[season] || SEASON_TINTS.summer), season === 'winter' ? 0.3 : 0.12);
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

function applyEnvironment(map) {
  currentSeason = seasonOf(map);
  currentWeather = weatherOf(map);
  if (landUnderlay) landUnderlay.visible = isInfinite(map);
  if (!three) return;

  const seasonSky = {
    summer: { horizon: '#b8d7cd', zenith: '#3a779b', sun: '#fff0d7', waterDeep: '#14536f', waterShallow: '#67c9c2' },
    autumn: { horizon: '#e1cfb8', zenith: '#65859a', sun: '#ffddb0', waterDeep: '#284f5e', waterShallow: '#7fa9a8' },
    winter: { horizon: '#dce7ea', zenith: '#708c9e', sun: '#e8f3ff', waterDeep: '#284e5e', waterShallow: '#9cb9bd' },
    spring: { horizon: '#cdd9c9', zenith: '#5a8b9c', sun: '#ffedc7', waterDeep: '#1d5968', waterShallow: '#78b5ac' },
  }[currentSeason] || {};
  const overcast = { clear: 0, overcast: 0.8, rain: 0.9, fog: 0.72, snow: 0.62 }[currentWeather] ?? 0;
  const fogDensity = { clear: 0.0042, overcast: 0.0075, rain: 0.012, fog: 0.029, snow: 0.014 }[currentWeather] ?? 0.0042;
  const light = {
    clear: { sun: 3.6, hemi: 1.9, ambient: 0.42, exposure: 1.32 },
    overcast: { sun: 1.8, hemi: 1.55, ambient: 0.5, exposure: 1.14 },
    rain: { sun: 1.25, hemi: 1.3, ambient: 0.56, exposure: 1.02 },
    fog: { sun: 1.6, hemi: 1.5, ambient: 0.5, exposure: 1.08 },
    snow: { sun: 1.9, hemi: 1.85, ambient: 0.55, exposure: 1.18 },
  }[currentWeather] || {};

  if (skyMaterial) {
    skyMaterial.uniforms.uHorizon.value.set(seasonSky.horizon);
    skyMaterial.uniforms.uZenith.value.set(seasonSky.zenith);
    skyMaterial.uniforms.uOvercast.value = overcast;
  }
  if (keyLight) {
    keyLight.color.set(seasonSky.sun);
    keyLight.intensity = light.sun;
  }
  if (hemiLight) {
    hemiLight.color.set(currentSeason === 'winter' ? '#dbe8ef' : '#d8eef2');
    hemiLight.groundColor.set(currentSeason === 'winter' ? '#a7b2ae' : '#86966c');
    hemiLight.intensity = light.hemi;
  }
  if (ambientLight) ambientLight.intensity = light.ambient;
  if (three.scene.fog) {
    three.scene.fog.color.set(currentWeather === 'fog' ? '#c5d0d0' : seasonSky.horizon);
    three.scene.fog.density = fogDensity;
  }
  three.renderer.toneMappingExposure = light.exposure;

  if (ocean?.material?.uniforms) {
    ocean.material.uniforms.uDeep.value.set(seasonSky.waterDeep);
    ocean.material.uniforms.uShallow.value.set(currentWeather === 'rain' ? '#759b9d' : seasonSky.waterShallow);
    ocean.material.uniforms.uSky.value.set(currentWeather === 'overcast' || currentWeather === 'rain' ? '#aebdc2' : seasonSky.horizon);
  }
  if (farWaterMaterial) farWaterMaterial.color.set(seasonSky.waterDeep);
  if (precipitation) {
    precipitation.visible = currentWeather === 'rain' || currentWeather === 'snow';
    precipitation.material.color.set(currentWeather === 'snow' ? 0xf0f6f7 : 0xb8cdda);
    precipitation.material.size = currentWeather === 'snow' ? 0.11 : 0.045;
    precipitation.material.opacity = currentWeather === 'snow' ? 0.86 : 0.46;
  }
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
  renderer.toneMappingExposure = 1.32;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x9ebec7, 1);
  renderer.domElement.className = 'world-canvas';
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D hexagon campaign world');

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb4cbd0, 0.0042);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  cam.position.set(0, 22, 18);

  const hemi = new THREE.HemisphereLight(0xd8eef2, 0x86966c, 1.9);
  scene.add(hemi);
  hemiLight = hemi;
  const ambient = new THREE.AmbientLight(0xfff7e8, 0.42);
  scene.add(ambient);
  ambientLight = ambient;

  const sun = new THREE.DirectionalLight(0xfff0d7, 3.6);
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

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(-0.45, 0.55, 0.4).normalize() },
      uHorizon: { value: new THREE.Color('#adc7c2') },
      uZenith: { value: new THREE.Color('#3d7898') },
      uOvercast: { value: 0 },
    },
    vertexShader: 'varying vec3 vSky; void main(){ vSky = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec3 vSky;
      uniform vec3 uSun;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform float uOvercast;
      void main() {
        vec3 d = normalize(vSky);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.48, 0.96, h));
        col = mix(col, vec3(0.47, 0.53, 0.55), uOvercast * 0.78);
        float sun = pow(max(dot(d, normalize(uSun)), 0.0), 240.0) * (1.0 - uOvercast);
        col += vec3(1.0, 0.68, 0.35) * sun * 0.8;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  skyMaterial = skyMat;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(280, 32, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  // A solid earth-toned underlay closes the tiny parallax seams between distant
  // hex caps. It is not water: actual water is drawn only for masked water cells.
  const underlayGeo = new THREE.PlaneGeometry(520, 520);
  underlayGeo.rotateX(-Math.PI / 2);
  landUnderlay = new THREE.Mesh(underlayGeo, new THREE.MeshBasicMaterial({ color: 0x354127 }));
  landUnderlay.position.y = WATER_Y - 0.04;
  landUnderlay.receiveShadow = true;
  landUnderlay.visible = false;
  scene.add(landUnderlay);

  foliageGroup = new THREE.Group();
  scene.add(foliageGroup);

  const waterGeo = new THREE.PlaneGeometry(520, 520, 128, 128);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.45, 0.55, 0.4).normalize() },
      uDeep: { value: new THREE.Color('#14536f') },
      uShallow: { value: new THREE.Color('#67c9c2') },
      uSky: { value: new THREE.Color('#d8efed') },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vWaveNormal;
      void main() {
        vec3 p = position;
        float t = uTime;
        float w = sin(p.x * 0.32 + t * 0.7) * 0.12;
        w += sin(p.z * 0.24 - t * 0.55) * 0.085;
        w += sin((p.x + p.z) * 0.68 + t * 1.1) * 0.034;
        p.y += w;
        float nx = -cos(p.x * 0.32 + t * 0.7) * 0.12 * 0.32;
        nx -= cos((p.x + p.z) * 0.68 + t * 1.1) * 0.034 * 0.68;
        float nz = -cos(p.z * 0.24 - t * 0.55) * 0.085 * 0.24;
        nz -= cos((p.x + p.z) * 0.68 + t * 1.1) * 0.034 * 0.68;
        vWaveNormal = normalize(vec3(nx, 1.0, nz));
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      varying vec3 vWorld;
      varying vec3 vWaveNormal;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vWaveNormal);
        float ripple = sin(vWorld.x * 2.7 + uTime * 1.4) * cos(vWorld.z * 2.2 - uTime * 1.1);
        float swell = sin(vWorld.x * 0.55 + uTime * 0.5) * cos(vWorld.z * 0.42 - uTime * 0.38);
        float crossWave = sin((vWorld.x + vWorld.z) * 1.45 - uTime * 0.9);
        n = normalize(n + vec3(ripple * 0.026 + swell * 0.012, 0.0, ripple * 0.02 + crossWave * 0.012));
        float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);
        float shallowMix = clamp(0.5 + swell * 0.12 + fresnel * 0.4, 0.42, 0.96);
        vec3 col = mix(uDeep, uShallow, shallowMix);
        col = mix(col, uSky, fresnel * 0.7);
        col += uShallow * smoothstep(0.55, 0.95, swell * 0.5 + 0.5) * 0.055;
        vec3 halfSun = normalize(normalize(uSunDir) + viewDir);
        float glint = pow(max(dot(n, halfSun), 0.0), 95.0) * 0.9;
        float sparkle = pow(max(dot(n, halfSun), 0.0), 420.0) * 0.9;
        gl_FragColor = vec4(col + vec3(glint + sparkle) + vec3(ripple * 0.012), 1.0);
      }`,
  });
  // Keep the material for per-water-tile meshes, but do not add a full-world
  // ocean plane. The plane made every uncovered cell look like open water.
  ocean = new THREE.Mesh(waterGeo, waterMat);
  ocean.position.y = WATER_Y;
  ocean.receiveShadow = true;

  const precipCount = 800;
  const precipPositions = new Float32Array(precipCount * 3);
  for (let n = 0; n < precipCount; n++) {
    precipPositions[n * 3] = (Math.random() - 0.5) * 42;
    precipPositions[n * 3 + 1] = Math.random() * 22 + 1;
    precipPositions[n * 3 + 2] = (Math.random() - 0.5) * 42;
  }
  const precipGeo = new THREE.BufferGeometry();
  precipGeo.setAttribute('position', new THREE.BufferAttribute(precipPositions, 3));
  precipitation = new THREE.Points(precipGeo, new THREE.PointsMaterial({
    color: 0xc7dbe4, size: 0.055, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  precipitation.frustumCulled = false;
  precipitation.visible = false;
  scene.add(precipitation);

  snowMaterial = new THREE.MeshStandardMaterial({
    color: 0xe9f1ef, roughness: 0.94, metalness: 0, transparent: true, opacity: 0.96,
  });

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

  foamMaterial = new THREE.MeshBasicMaterial({
    color: 0xe6f7f2, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide,
  });
  shallowMaterial = new THREE.MeshBasicMaterial({
    color: 0x73c9c3, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
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
  window.addEventListener('keydown', onFlyKeyDown);
  window.addEventListener('keyup', onFlyKeyUp);
  window.addEventListener('blur', () => { flyKeys.clear(); pointer.rightDown = false; });

  three = { renderer, scene, camera: cam };
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

// The distant frontier is flat by design. Building it as instanced hex caps
// keeps the streamed window cheap instead of rebuilding a dense merged mesh
// every time the camera crosses a frontier boundary.
function farCapGeometry() {
  const position = [0, 0, 0];
  const normal = [0, 1, 0];
  const uv = [0.5, 0.5];
  const index = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + (i * Math.PI) / 3;
    const x = Math.cos(angle) * 1.035;
    const z = Math.sin(angle) * 1.035;
    position.push(x, 0, z);
    normal.push(0, 1, 0);
    uv.push(x * 0.3 + 0.5, z * 0.3 + 0.5);
  }
  for (let i = 0; i < 6; i++) {
    index.push(0, 1 + ((i + 1) % 6), 1 + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

function farLandMaterialFor() {
  if (farLandMaterial) return farLandMaterial;
  const texture = groundTextures.grass;
  farLandMaterial = new THREE.MeshStandardMaterial({
    map: texture?.diffuse || null,
    normalMap: texture?.normal || null,
    roughnessMap: texture?.rough || null,
    roughness: 0.96,
    metalness: 0,
  });
  farLandMaterial.normalScale.set(0.35, 0.35);
  return farLandMaterial;
}

function farWaterMaterialFor() {
  if (farWaterMaterial) return farWaterMaterial;
  const waterColor = {
    summer: '#28677a', autumn: '#375a63', winter: '#334f5c', spring: '#315f68',
  }[currentSeason] || '#28677a';
  farWaterMaterial = new THREE.MeshStandardMaterial({
    color: waterColor,
    roughness: 0.38,
    metalness: 0.06,
  });
  return farWaterMaterial;
}

function ensureFarTerrainMeshes() {
  if (farLandMesh && farWaterMesh) return;
  const capacity = 3 * INFINITE_MAX_RADIUS * (INFINITE_MAX_RADIUS + 1) + 1;
  farGroup = new THREE.Group();
  three.scene.add(farGroup);
  const buildMesh = (material) => {
    const mesh = new THREE.InstancedMesh(farCapGeometry(), material, capacity);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    farGroup.add(mesh);
    return mesh;
  };
  farLandMesh = buildMesh(farLandMaterialFor());
  farWaterMesh = buildMesh(farWaterMaterialFor());
}

function buildFarTerrain() {
  if (!isInfinite()) {
    if (farGroup) farGroup.visible = false;
    return;
  }
  ensureFarTerrainMeshes();
  farGroup.visible = true;
  const far = cells.filter((cell) => !cell.detail);
  const land = far.filter((cell) => visualOf(cell.tile) !== 'water');
  const water = far.filter((cell) => visualOf(cell.tile) === 'water');
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();
  const tintCache = new Map();

  farLandMesh.count = land.length;
  if (land.length) {
    land.forEach((cell, index) => {
      position.set(cell.x, cell.elevation + 0.006, cell.z);
      matrix.compose(position, quaternion, scale);
      farLandMesh.setMatrixAt(index, matrix);
      const tintKey = `${visualOf(cell.tile)}|${cell.tile.color || ''}|${cell.tile.important ? 1 : 0}`;
      let tint = tintCache.get(tintKey);
      if (!tint) {
        tint = tileTint(cell.tile);
        tintCache.set(tintKey, tint);
      }
      color.copy(tint).multiplyScalar(0.88 + hash2(cell.q, cell.r, 9) * 0.18);
      farLandMesh.setColorAt(index, color);
    });
    farLandMesh.instanceMatrix.needsUpdate = true;
    if (farLandMesh.instanceColor) farLandMesh.instanceColor.needsUpdate = true;
  }

  farWaterMesh.count = water.length;
  if (water.length) {
    water.forEach((cell, index) => {
      position.set(cell.x, WATER_Y + 0.008, cell.z);
      matrix.compose(position, quaternion, scale);
      farWaterMesh.setMatrixAt(index, matrix);
    });
    farWaterMesh.instanceMatrix.needsUpdate = true;
  }
}

function buildTerrain(map) {
  const buckets = new Map();
  const sideBucket = newBucket();
  const sandBucket = newBucket();
  const roadBucket = newBucket();
  const foam = newBucket();
  const shallowBucket = newBucket();
  const waterBucket = newBucket();
  const snowBucket = seasonOf(map) === 'winter' ? newBucket() : null;
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
    // Distant cells are rendered in two instanced batches by buildFarTerrain.
    if (!cell.detail) {
      cell.water = visual === 'water';
      continue;
    }
    const top = cell.elevation;
    const tint = tileTint(cell.tile);
    const shade = 0.88 + hash2(cell.q, cell.r, 9) * 0.18;
    const worldX = cell.x;
    const worldZ = cell.z;

    if (visual === 'water') {
      cell.water = true;
      const corners = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        corners.push({
          x: worldX + Math.cos(a) * 1.035,
          z: worldZ + Math.sin(a) * 1.035,
        });
      }
      const waterColor = new THREE.Color('#ffffff');
      const waterCenter = addVertex(waterBucket, worldX, WATER_Y + 0.006, worldZ, 0, 1, 0, 0, 0, waterColor);
      const waterCorners = corners.map((c) => addVertex(
        waterBucket, c.x, WATER_Y + 0.006, c.z, 0, 1, 0, 0, 0, waterColor,
      ));
      for (let i = 0; i < 6; i++) {
        waterBucket.index.push(waterCenter, waterCorners[(i + 1) % 6], waterCorners[i]);
      }
      continue;
    }
    cell.water = false;
    const detail = cell.detail !== false;

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
      // Slight overlap hides the hairline grid gaps that would otherwise reveal
      // the ocean plane between neighboring land caps.
      const x = worldX + Math.cos(a) * 1.035;
      const z = worldZ + Math.sin(a) * 1.035;
      corners.push({ x, z });
    }

    const uv = (x, z) => [
      (x * cos - z * sin) * 0.29 + offsetU,
      (x * sin + z * cos) * 0.29 + offsetV,
    ];
    const centerIndex = addVertex(bucket, worldX, top, worldZ, 0, 1, 0, ...uv(worldX, worldZ), color);
    const topIndices = corners.map((c) => addVertex(bucket, c.x, top, c.z, 0, 1, 0, ...uv(c.x, c.z), color));
    for (let i = 0; i < 6; i++) {
      // Counter-clockwise from above so the textured cap faces the camera.
      bucket.index.push(centerIndex, topIndices[(i + 1) % 6], topIndices[i]);
    }

    if (snowBucket && detail && visual !== 'road' && visual !== 'trail') {
      const snowColor = new THREE.Color('#f2f7f5');
      const snowCenter = addVertex(snowBucket, worldX, top + 0.018, worldZ, 0, 1, 0, 0, 0, snowColor);
      const snowIndices = corners.map((c) => addVertex(snowBucket, c.x, top + 0.018, c.z, 0, 1, 0, 0, 0, snowColor));
      for (let i = 0; i < 6; i++) snowBucket.index.push(snowCenter, snowIndices[(i + 1) % 6], snowIndices[i]);
    }

    // Distant cells keep their hex surface but skip costly coast, cliff and
    // road detail. This lets one world contain every chunk without the draw
    // cost that used to force regeneration while panning.
    // Close every step to its neighbour's actual height, including across the
    // distant world. This is a continuous terrain surface, not floating caps.
    const baseY = WATER_Y - 0.04;
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      const dir = edgeDirs[i];
      const neighbor = cellAt(cell.q + dir.q, cell.r + dir.r);
      const nVisual = neighbor ? visualOf(neighbor.tile) : 'water';
      const nTop = neighbor ? neighbor.elevation : baseY;
      if (neighbor && nVisual !== 'water' && nTop >= top - 0.045) continue;
      const bottom = !neighbor ? baseY : Math.max(WATER_Y + 0.012, nTop + 0.012);
      const sideTint = SIDE_TINT.clone().multiplyScalar(0.82 + hash2(cell.q, cell.r, 29 + i) * 0.16);
      const a = corners[i];
      const b = corners[next];
      addQuad(
        sideBucket,
        new THREE.Vector3(a.x, top - 0.018, a.z),
        new THREE.Vector3(b.x, top - 0.018, b.z),
        new THREE.Vector3(b.x, bottom, b.z),
        new THREE.Vector3(a.x, bottom, a.z),
        sideTint,
        [[0, 1], [1, 1], [1, 0], [0, 0]],
      );
    }

    if (!detail) continue;

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

        const shallowA = new THREE.Vector3(
          worldX + (a.x - worldX) * 1.2, WATER_Y + 0.012,
          worldZ + (a.z - worldZ) * 1.2,
        );
        const shallowB = new THREE.Vector3(
          worldX + (b.x - worldX) * 1.2, WATER_Y + 0.012,
          worldZ + (b.z - worldZ) * 1.2,
        );
        const shallowC = new THREE.Vector3(
          worldX + (a.x - worldX) * 1.95, WATER_Y + 0.004,
          worldZ + (a.z - worldZ) * 1.95,
        );
        const shallowD = new THREE.Vector3(
          worldX + (b.x - worldX) * 1.95, WATER_Y + 0.004,
          worldZ + (b.z - worldZ) * 1.95,
        );
        addQuad(shallowBucket, shallowA, shallowB, shallowD, shallowC, new THREE.Color('#78cbc4'), [[0, 0], [1, 0], [1, 1], [0, 1]]);
        continue;
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
  if (snowBucket?.position.length) {
    const snowMesh = bucketToMesh(snowBucket, snowMaterial, { castShadow: false });
    if (snowMesh) tileGroup.add(snowMesh);
  }

  if (roadBucket.position.length) {
    const roadMesh = bucketToMesh(roadBucket, new THREE.MeshBasicMaterial({ color: 0xddc88b, transparent: true, opacity: 0.72 }), { castShadow: false });
    if (roadMesh) tileGroup.add(roadMesh);
  }

  if (waterBucket.position.length && ocean?.material) {
    const waterMesh = bucketToMesh(waterBucket, ocean.material, { castShadow: false });
    if (waterMesh) {
      waterMesh.receiveShadow = true;
      tileGroup.add(waterMesh);
    }
  }

  if (foam.position.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(foam.position, 3));
    geometry.setIndex(foam.index);
    const mesh = new THREE.Mesh(geometry, foamMaterial);
    mesh.userData.ownedGeometry = true;
    tileGroup.add(mesh);
  }

  if (shallowBucket.position.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(shallowBucket.position, 3));
    geometry.setIndex(shallowBucket.index);
    const mesh = new THREE.Mesh(geometry, shallowMaterial);
    mesh.userData.ownedGeometry = true;
    tileGroup.add(mesh);
  }
}

function clearFoliage() {
  if (!foliageGroup) return;
  for (const child of [...foliageGroup.children]) {
    foliageGroup.remove(child);
    child.dispose?.();
  }
}

function buildVegetation(map) {
  clearFoliage();
  if (!map || !foliageGroup) return;
  const density = Math.max(0.4, Math.min(1.8, Number(map?.config?.density) || 1));
  const season = seasonOf(map);
  const placements = new Map();
  const focusX = camera.target.x;
  const focusZ = camera.target.z;
  const foliageRadius2 = FOLIAGE_RADIUS * FOLIAGE_RADIUS;

  const queue = (type, x, y, z, rot, scale, tint = null) => {
    if (!modelTemplates.has(type)) return;
    const list = placements.get(type) || [];
    const max = type === 'boulder' ? MAX_GROUND : type === 'grass' || type === 'fern' ? MAX_GROUND : MAX_TREES;
    if (list.length >= max) return;
    list.push({ x, y, z, rot, scale, tint });
    placements.set(type, list);
  };

  for (const cell of cells) {
    const dx = cell.x - focusX;
    const dz = cell.z - focusZ;
    if (dx * dx + dz * dz > foliageRadius2) continue;
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
      const tint = season === 'autumn'
        ? new THREE.Color().setHSL(0.055 + rnd() * 0.11, 0.48 + rnd() * 0.28, 0.7 + rnd() * 0.15)
        : season === 'winter'
          ? new THREE.Color().setHSL(0.56 + rnd() * 0.05, 0.08 + rnd() * 0.1, 0.78 + rnd() * 0.13)
          : season === 'spring'
            ? new THREE.Color().setHSL(0.23 + rnd() * 0.06, 0.26 + rnd() * 0.22, 0.82 + rnd() * 0.12)
            : new THREE.Color().setHSL(0.24 + rnd() * 0.035, 0.18 + rnd() * 0.15, 0.83 + rnd() * 0.14);
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
    const addLog = () => {
      const point = at(0.54);
      queue('log', point.x, cell.elevation + 0.01, point.z, rnd() * Math.PI * 2, 0.55 + rnd() * 0.35);
    };

    if (visual === 'forest') {
      const trees = Math.max(1, Math.round((1.6 + rnd() * 1.9) * density));
      for (let i = 0; i < trees; i++) addTree();
      addCover('fern', Math.round((1.2 + rnd() * 1.5) * density));
      addCover('grass', Math.round((1.4 + rnd() * 1.8) * density));
      addCover('bush', Math.round((0.45 + rnd() * 0.85) * density));
      if (rnd() < 0.44) addRocks(1);
      if (rnd() < 0.22) addLog();
    } else if (visual === 'grass') {
      if (rnd() < 0.18 * density) addTree();
      addCover('grass', Math.round((1.5 + rnd() * 2.2) * density));
      if (rnd() < 0.3) addCover('fern', 1);
      if (rnd() < 0.26) addCover('bush', 1);
      if (rnd() < 0.28) addRocks(1);
    } else if (visual === 'mountain') {
      if (rnd() < 0.62 * density) addTree('conifer', 0.9);
      addRocks(1 + Math.round(rnd() * 2 * density));
      if (rnd() < 0.35) addCover('grass', 1);
      if (rnd() < 0.1) addLog();
    } else if (visual === 'beach') {
      if (rnd() < 0.18) addRocks(1);
      if (rnd() < 0.23) addCover('grass', 1);
    } else if (visual === 'dirt') {
      if (rnd() < 0.12 * density) addTree('conifer', 0.7);
      addRocks(rnd() < 0.5 ? 1 : 0);
      if (rnd() < 0.4) addCover('grass', 1);
      if (rnd() < 0.22) addCover('bush', 1);
    } else if (visual === 'urban') {
      if (rnd() < 0.035 * density) addTree('conifer', 0.65);
      if (rnd() < 0.12) addCover('grass', 1);
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
      foliageGroup.add(mesh);
    }
  }
}

function scheduleFoliageRefresh() {
  if (!isInfinite() || foliageTimer) return;
  foliageTimer = setTimeout(() => {
    foliageTimer = 0;
    if (state.page !== 'world' || ui.layer !== 'campaign' || !three) return;
    buildVegetation(activeMap());
  }, 180);
}

function updateFlyMovement(dt) {
  if (!three || !pointer.rightDown || !flyKeys.size) return;
  const boost = flyKeys.has('ShiftLeft') || flyKeys.has('ShiftRight') ? 2.2 : 1;
  const speed = Math.max(8, camera.dist * 0.55) * dt * boost;
  const forward = new THREE.Vector3(-Math.sin(camera.azimuth), 0, -Math.cos(camera.azimuth));
  const right = new THREE.Vector3(Math.cos(camera.azimuth), 0, -Math.sin(camera.azimuth));
  if (flyKeys.has('KeyW')) camera.target.addScaledVector(forward, speed);
  if (flyKeys.has('KeyS')) camera.target.addScaledVector(forward, -speed);
  if (flyKeys.has('KeyD')) camera.target.addScaledVector(right, speed);
  if (flyKeys.has('KeyA')) camera.target.addScaledVector(right, -speed);
  if (flyKeys.has('KeyQ')) camera.target.y += speed;
  if (flyKeys.has('KeyE')) camera.target.y -= speed;
  if (!isInfinite()) {
    camera.target.x = Math.max(-40, Math.min(40, camera.target.x));
    camera.target.z = Math.max(-40, Math.min(40, camera.target.z));
  }
  camera.target.y = Math.max(0.35, Math.min(200, camera.target.y));
  updateCamera();
  if (isInfinite()) scheduleInfiniteRecenter();
  scheduleFoliageRefresh();
}

function onFlyKeyDown(e) {
  if (!pointer.rightDown) return;
  const target = e.target;
  if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(e.code)) return;
  flyKeys.add(e.code);
  if (!e.code.startsWith('Shift')) e.preventDefault();
}

function onFlyKeyUp(e) {
  flyKeys.delete(e.code);
}

function getBuildingKit() {
  if (buildingKit) return buildingKit;

  const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const roofGeometry = new THREE.BufferGeometry();
  roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
  ], 3));
  roofGeometry.setIndex([
    0, 2, 1, 3, 4, 5,
    0, 3, 5, 0, 5, 2,
    1, 2, 5, 1, 5, 4,
  ]);
  roofGeometry.computeVertexNormals();

  buildingKit = {
    bodyGeometry,
    roofGeometry,
    slabGeometry: new THREE.BoxGeometry(1, 1, 1),
    windowGeometry: new THREE.BoxGeometry(1, 1, 1),
    bodyMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 }),
    roofMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, flatShading: true }),
    slabMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 }),
    windowMaterial: new THREE.MeshBasicMaterial({ color: 0xd8c48f }),
  };
  return buildingKit;
}

function buildBuildings(map) {
  const kit = getBuildingKit();
  const bodies = [];
  const roofs = [];
  const slabs = [];
  const windows = [];
  const winter = seasonOf(map) === 'winter';
  const siding = ['#d9d2c0', '#c7b8a2', '#bcc7bf', '#d8c7ad', '#b6a58f', '#cbd3c6'];
  const shingles = ['#4b4945', '#5b4c43', '#444b4e', '#63514a'];
  const wallColor = (seed) => new THREE.Color(siding[Math.floor(seed * siding.length) % siding.length]);
  const roofColor = (seed) => new THREE.Color(winter ? '#d6dfe0' : shingles[Math.floor(seed * shingles.length) % shingles.length]);

  const pushInstances = (items, geometry, material, { castShadow = true, receiveShadow = true } = {}) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.userData.sharedGeometry = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach((item, index) => {
      position.set(item.x, item.y, item.z);
      quaternion.setFromAxisAngle(up, item.yaw);
      scale.set(item.sx, item.sy, item.sz);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, item.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    tileGroup.add(mesh);
  };

  for (const cell of cells) {
    if (cell.detail === false) continue;
    const visual = visualOf(cell.tile);
    if (visual !== 'urban') continue;
    const residential = cell.tile.terrain === 'residential';
    const count = residential ? 3 : 1;

    for (let i = 0; i < count; i++) {
      const rnd = (salt) => hash2(cell.q, cell.r, salt + i * 17);
      const angle = (i / count) * Math.PI * 2 + (rnd(31) - 0.5) * 0.55 + 0.25;
      const radius = 0.32 + rnd(37) * 0.12;
      const x = cell.x + Math.cos(angle) * radius;
      const z = cell.z + Math.sin(angle) * radius;
      const yaw = angle + Math.PI / 2 + (rnd(41) - 0.5) * 0.16;
      const base = cell.elevation + 0.012;

      if (residential) {
        const width = 0.27 + rnd(43) * 0.12;
        const depth = 0.23 + rnd(47) * 0.09;
        const height = 0.15 + rnd(53) * 0.075;
        const color = wallColor(rnd(59));
        bodies.push({ x, y: base + height / 2, z, yaw, sx: width, sy: height, sz: depth, color });
        const roofWidth = width * 1.18;
        const roofDepth = depth * 1.24;
        roofs.push({
          x, y: base + height, z, yaw,
          sx: roofWidth, sy: 0.08 + rnd(61) * 0.055, sz: roofDepth,
          color: roofColor(rnd(67)),
        });
        for (let w = 0; w < 2; w++) {
          const localX = (w - 0.5) * width * 0.42;
          const localZ = depth / 2 + 0.012;
          windows.push({
            x: x + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
            y: base + height * 0.6,
            z: z - Math.sin(yaw) * localX + Math.cos(yaw) * localZ,
            yaw, sx: 0.058, sy: 0.055, sz: 0.012,
            color: new THREE.Color(w % 2 ? '#d6c58d' : '#a9c0c3'),
          });
        }
      } else {
        const width = 0.48 + rnd(71) * 0.14;
        const depth = 0.32 + rnd(73) * 0.1;
        const height = 0.23 + rnd(79) * 0.07;
        bodies.push({ x, y: base + height / 2, z, yaw, sx: width, sy: height, sz: depth, color: wallColor(rnd(83)) });
        slabs.push({
          x, y: base + height + 0.018, z, yaw,
          sx: width * 1.06, sy: 0.035, sz: depth * 1.08,
          color: new THREE.Color(winter ? '#d5dedf' : '#555b5d'),
        });
        for (let w = 0; w < 3; w++) {
          const localX = (w - 1) * width * 0.24;
          const localZ = depth / 2 + 0.012;
          windows.push({
            x: x + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
            y: base + height * 0.62,
            z: z - Math.sin(yaw) * localX + Math.cos(yaw) * localZ,
            yaw, sx: 0.08, sy: 0.065, sz: 0.012,
            color: new THREE.Color('#d7c58e'),
          });
        }
      }
    }
  }

  pushInstances(bodies, kit.bodyGeometry, kit.bodyMaterial);
  pushInstances(roofs, kit.roofGeometry, kit.roofMaterial);
  pushInstances(slabs, kit.slabGeometry, kit.slabMaterial);
  pushInstances(windows, kit.windowGeometry, kit.windowMaterial, { castShadow: false, receiveShadow: false });
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
  frontierBuildInFlight = false;
  frontierBuildToken++;
  const radius = isInfinite(map) ? frontierRadius() : 0;
  infinite.radius = radius;
  applyEnvironment(map);
  clearEnvironment();
  cells = [];
  cellIndex = new Map();
  const center = mapCenter(map);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let pick = null;
  let i = 0;

  if (isInfinite(map)) {
    loadTerrainSampler();
    const origin = infiniteOrigin(map);
    const cacheRoot = `${map.id}:${origin.baseX.toFixed(3)}:${origin.baseZ.toFixed(3)}`;
    if (cacheRoot !== cellObjectCacheKey) {
      cellObjectCache = new Map();
      cellObjectCacheKey = cacheRoot;
    }
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dq = -radius; dq <= radius; dq++) {
        if (Math.abs(dq + dr) > radius) continue;
        const q = origin.q + dq;
        const r = origin.r + dr;
        const tile = tileAt(q, r, map) || proceduralTile(q, r);
        const distance = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
        const detail = distance <= DETAIL_RADIUS;
        const cellKey = keyOf(q, r);
        let cell = cellObjectCache.get(cellKey);
        if (!cell) {
          cell = { q, r, col: dq, row: dr, tile, detail, x: 0, z: 0, elevation: 0 };
          cellObjectCache.set(cellKey, cell);
        }
        cell.tile = tile;
        cell.detail = detail;
        cell.col = dq;
        cell.row = dr;
        cell.x = (q + r / 2) * SQRT3 - center.x;
        cell.z = r * 1.5 - center.z;
        cell.elevation = detail ? elevation(tile) : (visualOf(tile) === 'water' ? WATER_Y : 0.34);
        cells.push(cell);
        cellIndex.set(cellKey, i);
        i++;
      }
    }
    tileBody = null;
  } else {
    const entries = [];
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const { q, r } = axialFor(col, row);
        entries.push({ q, r, col, row, tile: tileAt(q, r, map), point: hexPoint(q, r), detail: true });
      }
    }
    const count = entries.length;
    if (!count) return;
    const pickGeo = new THREE.CylinderGeometry(1.012, 1.012, 0.03, 6, 1);
    pickGeo.rotateY(Math.PI / 6);
    pick = new THREE.InstancedMesh(
      pickGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      count,
    );
    pick.userData.ownedGeometry = true;
    pick.frustumCulled = false;
    for (const entry of entries) {
      const { q, r, col, row, tile, point, detail } = entry;
      const cellKey = keyOf(q, r);
      const cell = {
        q, r, col, row, tile, detail,
        x: point.x - center.x,
        z: point.z - center.z,
        elevation: elevation(tile),
      };
      cells.push(cell);
      cellIndex.set(cellKey, i);
      position.set(cell.x, cell.elevation + 0.015, cell.z);
      matrix.compose(position, quaternion, scale.set(1, 1, 1));
      pick.setMatrixAt(i, matrix);
      i++;
    }
    pick.instanceMatrix.needsUpdate = true;
    pick.computeBoundingSphere();
    tileGroup.add(pick);
    tileBody = pick;
  }
  buildTerrain(map);
  buildFarTerrain();
  buildBuildings(map);
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

// ---------------------------------------------------------------- overlay

function syncOverlay() {
  if (!overlay) return;
  const map = activeMap();
  if (!map) { overlay.innerHTML = ''; overlayItems = []; return; }

  const center = mapCenter(map);
  const labelHtml = map.labels.map((l) => `
    <div class="map-label-wrap" data-label="${l.id}">
      <div class="map-label" style="font-size:${l.size}px;color:${esc(l.color)}">${esc(l.text)}</div>
    </div>`).join('');

  const pins = map.tiles
    .filter((t) => t.waypoint || t.important || t.label || t.icon)
    .map((t) => {
      const name = t.waypoint || t.label || '';
      if (!name && !t.important) return '';
      const selected = ui.selected && ui.selected.q === t.q && ui.selected.r === t.r;
      return `
      <div class="wp-pin ${selected ? 'on' : ''}" data-pin="${t.q}:${t.r}">
        <div class="wp-inner">
          <span class="wp-ico" style="--tint:${esc(t.color || TERRAINS[t.terrain]?.color || '#6b7080')}">
            ${icon(iconFor(t), { size: 14 })}</span>
          ${name ? `<span class="wp-name">${esc(name)}</span>` : ''}
        </div>
      </div>`;
    }).join('');

  overlay.innerHTML = labelHtml + pins;
  overlayItems = [];

  for (const el of overlay.querySelectorAll('[data-pin]')) {
    const [q, r] = el.dataset.pin.split(':').map(Number);
    const tile = tileAt(q, r);
    const cell = cells[cellIndex.get(keyOf(q, r))];
    const point = hexPoint(q, r);
    overlayItems.push({
      el,
      pos: new THREE.Vector3(point.x - center.x, (cell?.elevation || 0.4) + 0.32, point.z - center.z),
      pin: { q, r, tile },
    });
  }

  for (const el of overlay.querySelectorAll('[data-label]')) {
    const label = map.labels.find((l) => l.id === el.dataset.label);
    if (!label) continue;
    overlayItems.push({
      el,
      pos: new THREE.Vector3(Number(label.x), 0.12, Number(label.y)),
      label,
    });
  }
}

function positionOverlay() {
  if (!three || !overlay || !overlayItems.length) return;
  const rect = overlay.getBoundingClientRect();
  const w = rect.width || 1;
  const h = rect.height || 1;
  const v = new THREE.Vector3();

  for (const item of overlayItems) {
    v.copy(item.pos).project(three.camera);
    const behind = v.z > 1;
    if (behind) {
      item.el.style.display = 'none';
      continue;
    }
    item.el.style.display = '';
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    item.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
}

function onOverlayClick(e) {
  const pinEl = e.target.closest('[data-pin]');
  const labelEl = e.target.closest('[data-label]');

  if (pointer.draggingLabel) return;

  if (pinEl) {
    e.stopPropagation();
    const [q, r] = pinEl.dataset.pin.split(':').map(Number);
    if (isEditing() && ui.tool === 'move') {
      if (!ui.moving) {
        ui.moving = { q, r };
        toast('Pin picked up — click the destination hex');
      } else {
        moveWaypoint(ui.moving, { q, r });
      }
      return;
    }
    ui.selected = { q, r };
    ui.labelId = null;
    ui.panel = isEditing() ? 'tile' : 'waypoint';
    render();
    return;
  }

  if (labelEl) {
    e.stopPropagation();
    if (!isDM()) return;
    ui.labelId = labelEl.dataset.label;
    ui.selected = null;
    render();
  }
}

function onOverlayDown(e) {
  const labelEl = e.target.closest('[data-label]');
  if (!labelEl || !isEditing()) return;
  e.stopPropagation();
  const item = overlayItems.find((it) => it.el === labelEl);
  if (!item) return;
  pointer.draggingLabel = { item, moved: false };
  labelEl.setPointerCapture?.(e.pointerId);
}

function onOverlayMove(e) {
  if (!pointer.draggingLabel || !three) return;
  e.stopPropagation();
  const rect = overlay.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, three.camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
  pointer.draggingLabel.moved = true;
  pointer.draggingLabel.item.pos.set(hit.x, 0.12, hit.z);
  pointer.draggingLabel.x = hit.x;
  pointer.draggingLabel.z = hit.z;
}

async function onOverlayUp() {
  const drag = pointer.draggingLabel;
  pointer.draggingLabel = null;
  if (!drag || !drag.moved) return;
  const label = drag.item.label;
  if (!label) return;
  const x = Math.round((drag.x ?? label.x) * 10) / 10;
  const y = Math.round((drag.z ?? label.y) * 10) / 10;
  label.x = x;
  label.y = y;
  try {
    await api('PATCH', `/api/maps/${activeMap().id}/labels/${label.id}`, { x, y });
    toast('Label moved');
  } catch (err) { fail(err); }
}

// ---------------------------------------------------------------- camera + loop

function fitCamera() {
  const map = activeMap();
  if (!map) return;
  if (isInfinite(map)) {
    infiniteOrigin(map);
    camera.want = 21;
    camera.dist = 21;
    camera.target.set(0, 0.35, 0);
    camera.azimuth = -Math.PI / 4;
    camera.polar = 0.94;
    needsFit = false;
    if (keyLight) {
      keyLight.shadow.camera.left = -28;
      keyLight.shadow.camera.right = 28;
      keyLight.shadow.camera.top = 28;
      keyLight.shadow.camera.bottom = -28;
      keyLight.shadow.camera.updateProjectionMatrix();
    }
    return;
  }
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

  const nowMs = performance.now();
  const dt = lastFrameTime ? Math.min(0.05, (nowMs - lastFrameTime) / 1000) : 0.016;
  lastFrameTime = nowMs;
  const time = nowMs / 1000;
  if (ocean?.material?.uniforms?.uTime) ocean.material.uniforms.uTime.value = time;
  if (foamMaterial) foamMaterial.opacity = 0.31 + Math.sin(time * 1.15) * 0.035;
  if (precipitation?.visible) {
    const positions = precipitation.geometry.attributes.position.array;
    const speed = currentWeather === 'snow' ? 2.2 : 16;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] -= speed * dt * (0.72 + ((i / 3) % 7) * 0.055);
      if (positions[i + 1] < -1) {
        positions[i] = (Math.random() - 0.5) * 42;
        positions[i + 1] = 18 + Math.random() * 9;
        positions[i + 2] = (Math.random() - 0.5) * 42;
      }
    }
    precipitation.geometry.attributes.position.needsUpdate = true;
  }
  for (const material of windMaterials) {
    if (material.userData.windTime) material.userData.windTime.value = time;
  }

  updateFlyMovement(dt);
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
  stageEl = document.getElementById('world-stage');
  if (!stageEl) { stopLoop(); return; }

  if (ui.layer === 'atlas') {
    const atlasHost = document.getElementById('atlas-host');
    if (atlasHost) {
      if (!worldAtlas) {
        worldAtlas = new WorldAtlas(atlasHost, {
          onEnter: ({ lat, lon }) => enterWorldAt(lat, lon),
          onError: (message) => toast(message, 'err'),
          onView: (view) => {
            const coords = document.getElementById('atlas-coords');
            const zoom = document.getElementById('atlas-zoom');
            const scale = document.getElementById('atlas-scale-text');
            const lat = Math.abs(view.lat).toFixed(4);
            const lon = Math.abs(view.lon).toFixed(4);
            atlasUi.coords = `${lat}° ${view.lat >= 0 ? 'N' : 'S'} · ${lon}° ${view.lon >= 0 ? 'E' : 'W'}`;
            atlasUi.zoom = `ZOOM ${view.zoom.toFixed(1)}`;
            if (coords) coords.textContent = atlasUi.coords;
            if (zoom) zoom.textContent = atlasUi.zoom;
            if (scale) scale.textContent = view.zoom >= 15.4 ? 'Hex frontier ready' : view.zoom > 12 ? 'Local streets' : view.zoom > 8 ? 'Regional map' : 'World map';
          },
        });
      } else {
        worldAtlas.setHost(atlasHost);
      }
      worldAtlas.setMarkers(atlasMarkers());
      worldAtlas.show();
    }
    stopLoop();
    if (canvas) canvas.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    return;
  }

  ensureThree();
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
  if (assetState === 'ready') setAssetStatus('');
  else if (assetState === 'loading') setAssetStatus('Growing forests…');

  resize();
  if (needsFit) fitCamera();
  applyMaps();
  updateRings();

  const earthHost = document.getElementById('earth-host');
  if (earthHost) {
    if (!earthExplorer) {
      earthExplorer = new EarthExplorer(earthHost, {
        onEnter: () => enterCampaign(),
        onError: (message) => toast(message, 'err'),
      });
    } else {
      earthExplorer.setHost(earthHost);
    }
    if (ui.layer === 'earth') earthExplorer.show();
  }
  if (ui.layer === 'earth') stopLoop();
  else startLoop();
}

function atlasMarkers() {
  const result = [{ lat: EARTH_CAMPAIGN.lat, lon: EARTH_CAMPAIGN.lon, name: EARTH_CAMPAIGN.name, kind: 'campaign' }];
  const map = activeMap();
  if (!map) return result;
  const center = map.config?.start || map.config?.geo?.center;
  if (center) {
    result[0] = { lat: Number(center.lat), lon: Number(center.lon), name: map.name || EARTH_CAMPAIGN.name, kind: 'campaign' };
  }
  for (const tile of map.tiles || []) {
    if (!tile.waypoint || !tile.important) continue;
    const point = tileLatLon(tile, map);
    if (point) result.push({ lat: point.lat, lon: point.lon, name: tile.waypoint });
  }
  return result;
}

function tileLatLon(tile, map) {
  if (!map || !tile) return null;
  if (map.config?.infinite) return globalHexToLatLon(Number(tile.q), Number(tile.r));
  const bbox = map.config?.geo?.bbox;
  if (!bbox || bbox.length !== 4) return map.config?.start || map.config?.geo?.center || null;
  const [west, south, east, north] = bbox.map(Number);
  const cols = Math.max(1, map.cols);
  const rows = Math.max(1, map.rows);
  const col = Number(tile.q) + Math.floor(Number(tile.r) / 2);
  return {
    lat: north - (Number(tile.r) / Math.max(1, rows - 1)) * (north - south),
    lon: west + (col / Math.max(1, cols - 1)) * (east - west),
  };
}

async function enterWorldAt(lat, lon) {
  if (!state.campaign) return;
  let map = maps().find((m) => m.config?.infinite);
  try {
    if (!map) {
      if (!isDM()) {
        toast('The DM has not opened the infinite world yet.', 'err');
        return;
      }
      const { id } = await api('POST', `/api/campaigns/${state.campaign.id}/maps`, { preset: 'world' });
      await reloadMaps();
      map = maps().find((m) => m.id === id);
    }
    if (!map) throw new Error('The infinite world could not be created.');
    state.mapId = map.id;
    ui.hexFocus = { lat: Number(lat), lon: Number(lon) };
    ui.selected = null;
    ui.labelId = null;
    ui.panel = 'tile';
    ui.view = 'world';
    needsFit = true;
    lastSig = '';
    const finish = () => {
      ui.layer = 'campaign';
      render();
      toast('You are standing in the infinite world', 'ok');
    };
    if (worldAtlas) worldAtlas.fadeOut(finish);
    else finish();
  } catch (err) { fail(err); }
}

function goAtlas() {
  const map = activeMap();
  let focus = ui.hexFocus || map?.config?.start || map?.config?.geo?.center || EARTH_CAMPAIGN;
  if (isInfinite(map)) {
    const wx = infinite.baseX + camera.target.x;
    const wz = infinite.baseZ + camera.target.z;
    const cell = globalAxialAt(wx, wz);
    focus = globalHexToLatLon(cell.q, cell.r);
  }
  ui.hexFocus = { lat: focus.lat, lon: focus.lon };
  ui.layer = 'atlas';
  ui.view = 'world';
  ui.selected = null;
  ui.labelId = null;
  render();
  requestAnimationFrame(() => {
    if (!worldAtlas) return;
    worldAtlas.setView(Number(focus.lat), Number(focus.lon), 12.8);
    worldAtlas.show();
  });
}

function enterCampaign(mapId) {
  if (mapId) state.mapId = mapId;
  const map = activeMap();
  if (!map) {
    ui.layer = 'campaign';
    ui.panel = isDM() ? 'newmap' : 'tile';
    render();
    return;
  }

  // Let the hex camera start far out, then ease in while the satellite layer
  // fades. Nothing is yanked into place at the threshold.
  const span = Math.max(map.cols * 1.55, map.rows * 1.85);
  camera.want = Math.max(10, Math.min(100, span * 0.98 + 4));
  camera.dist = Math.max(44, camera.want * 2.4);
  camera.target.set(0, 0.35, 0);
  camera.azimuth = -Math.PI / 4;
  camera.polar = 0.94;
  needsFit = false;
  startLoop();

  const finish = () => {
    ui.layer = 'campaign';
    ui.view = 'world';
    ui.panel = 'tile';
    lastSig = '';
    render();
    toast('You have entered Webster & Ontario', 'ok');
  };
  if (earthExplorer?.ready) earthExplorer.fadeOut(finish);
  else finish();
}

function goEarth() {
  ui.layer = 'earth';
  ui.view = 'world';
  ui.selected = null;
  ui.labelId = null;
  earthSearch.error = '';
  render();
  requestAnimationFrame(() => earthExplorer?.show());
}

function applyMaps() {
  if (!state.page || state.page !== 'world' || !three) return;
  const map = activeMap();
  if (!map) return;
  const sig = [
    map.id, map.cols, map.rows, Number(map.config?.density) || 1,
    seasonOf(map), weatherOf(map),
    map.tiles.map((t) => [t.q, t.r, t.color, t.terrain, t.elevation, t.important, t.waypoint, t.icon, t.label, t.visible].join('~')).join('|'),
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

// ---------------------------------------------------------------- canvas input

function pointerNdc(e) {
  const rect = canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function hitTile(e) {
  if (!three) return null;
  if (isInfinite()) {
    // The far frontier is not an invisible instanced pick mesh anymore. A
    // ground-plane ray gives us the global cell in O(1), including after streaming.
    const point = hitGround(e);
    const map = activeMap();
    if (!point || !map) return null;
    const center = mapCenter(map);
    const cell = globalAxialAt(point.x + center.x, point.z + center.z);
    const index = cellIndex.get(keyOf(cell.q, cell.r));
    return index === undefined ? null : cells[index];
  }
  raycaster.setFromCamera(pointerNdc(e), three.camera);
  const hits = raycaster.intersectObject(tileBody, false);
  if (!hits.length) return null;
  const id = hits[0].instanceId;
  if (id === undefined) return null;
  return cells[id] || null;
}

function hitGround(e) {
  if (!three) return null;
  raycaster.setFromCamera(pointerNdc(e), three.camera);
  const out = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, out) ? out : null;
}

function onCanvasDown(e) {
  if (!three) return;
  pointer.down = true;
  pointer.moved = false;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.button = e.button;
  try { canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic or already released */ }
  pointer.id = e.pointerId;

  pointer.rightDown = e.button === 2;

  if (e.button === 2 || e.altKey) {
    pointer.mode = 'rotate';
  } else if (isEditing() && ui.tool === 'paint') {
    pointer.mode = 'paint';
    pointer.stroke = new Map();
    paintAt(e);
  } else {
    pointer.mode = 'pan';
  }
}

function onCanvasMove(e) {
  if (!three) return;

  if (pointer.down) {
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) pointer.moved = true;

    if (pointer.mode === 'rotate' && pointer.moved) {
      camera.azimuth -= dx * 0.006;
      camera.polar = Math.max(0.28, Math.min(1.38, camera.polar - dy * 0.004));
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      updateCamera();
      return;
    }

    if (pointer.mode === 'pan' && pointer.moved) {
      const scale = camera.dist * 0.0016;
      const right = new THREE.Vector3().setFromMatrixColumn(three.camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(three.camera.matrix, 1);
      camera.target.addScaledVector(right, -dx * scale);
      camera.target.addScaledVector(up, dy * scale);
      if (!isInfinite()) {
        camera.target.x = Math.max(-40, Math.min(40, camera.target.x));
        camera.target.z = Math.max(-40, Math.min(40, camera.target.z));
      }
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      updateCamera();
      if (isInfinite()) {
        scheduleInfiniteRecenter();
        scheduleFoliageRefresh();
      }
      return;
    }

    if (pointer.mode === 'paint' && isEditing()) {
      paintAt(e);
      return;
    }
  }

  // Hover feedback.
  const cell = hitTile(e);
  hovered = cell || null;
  if (hoverRing) {
    hoverRing.visible = !!cell;
    if (cell && cellIndex.has(keyOf(cell.q, cell.r))) {
      const map = activeMap();
      const p = hexPoint(cell.q, cell.r);
      const center = mapCenter(map);
      hoverRing.position.set(p.x - center.x, cell.elevation + 0.05, p.z - center.z);
    }
  }
  const coords = document.getElementById('world-coords');
  if (coords) coords.textContent = cell ? `HEX ${cell.q}, ${cell.r}` : '';
  canvas.style.cursor = isEditing() && ui.tool === 'paint' ? 'crosshair'
    : isEditing() && ui.tool === 'erase' ? 'cell'
      : 'grab';
}

function onCanvasUp() {
  if (!pointer.down) return;
  const wasPaint = pointer.mode === 'paint';
  const stroke = pointer.stroke;
  const moved = pointer.moved;

  pointer.down = false;
  pointer.rightDown = false;
  pointer.mode = '';
  pointer.stroke = null;
  flyKeys.clear();

  if (wasPaint) {
    commitStroke(stroke);
    return;
  }

  if (!moved && pointer.button !== 2) {
    const last = { clientX: pointer.x, clientY: pointer.y };
    // A synthetic event's client coordinates are fine for raycasting.
    handleCanvasClick(last);
  }
}

function onWheel(e) {
  e.preventDefault();
  const factor = Math.exp(e.deltaY * 0.0011);
  camera.want = Math.max(8, Math.min(isInfinite() ? 55 : 70, camera.want * factor));
  if (factor > 1) scheduleFrontierResize();
}

function handleCanvasClick(e) {
  const tile = hitTile(e);
  if (tile) flushFormSave();

  if (isEditing() && ui.tool === 'text') {
    const p = hitGround(e);
    if (p) addLabel(p.x, p.z);
    return;
  }

  if (!tile) return;

  if (isEditing() && ui.tool === 'erase') {
    eraseHex(tile.q, tile.r);
    return;
  }

  if (isEditing() && ui.tool === 'paint') {
    paintAt(e); // single click when no drag occurred
    return;
  }

  if (isEditing() && ui.tool === 'move' && ui.moving) {
    moveWaypoint(ui.moving, { q: tile.q, r: tile.r });
    return;
  }

  ui.selected = { q: tile.q, r: tile.r };
  ui.labelId = null;
  ui.panel = isEditing() && ui.tool === 'waypoint' ? 'tile' : 'tile';
  if (isEditing() && ui.tool === 'waypoint') {
    const existing = tileAt(tile.q, tile.r);
    if (!existing?.waypoint) toast('Add a name and save to place the waypoint');
  }
  render();
}

// ---------------------------------------------------------------- editing

function tilePayloadFor(tile) {
  return {
    q: tile.q, r: tile.r,
    color: tile.color || '', terrain: tile.terrain || '',
    label: tile.label || '', icon: tile.icon || '',
    waypoint: tile.waypoint || '', category: tile.category || '',
    description: tile.description || '', image: tile.image || '',
    entryId: tile.entryId || '', important: !!tile.important,
    visible: tile.visible !== false,
    dmNotes: tile.dmNotes || '',
    players: tile.players || [], npcs: tile.npcs || [],
  };
}

async function putTile(mapId, tile) {
  const { tile: saved } = await api('PUT', `/api/maps/${mapId}/tiles`, tilePayloadFor(tile));
  upsertLocalTile(mapId, saved);
  return saved;
}

function paintAt(e) {
  const map = activeMap();
  if (!map) return;
  const cell = hitTile(e);
  if (!cell || !pointer.stroke) return;
  const key = keyOf(cell.q, cell.r);
  if (pointer.stroke.has(key)) return;

  const before = tileAt(cell.q, cell.r);
  pointer.stroke.set(key, before ? JSON.parse(JSON.stringify(before)) : null);

  const next = { ...(before || blankTile(cell.q, cell.r)), q: cell.q, r: cell.r, color: ui.color, terrain: ui.terrain };
  if (!before) next.visible = true;
  upsertLocalTile(map.id, next);
  refreshCell(cell.q, cell.r, { overlay: false });
}

async function commitStroke(stroke) {
  if (!stroke || !stroke.size) return;
  const map = activeMap();
  if (!map) return;
  const after = [];
  try {
    for (const [key] of stroke) {
      const [q, r] = key.split(':').map(Number);
      const tile = tileAt(q, r);
      if (!tile) continue;
      const saved = await putTile(map.id, tile);
      after.push({ q, r, before: stroke.get(key), after: saved });
    }
    pushUndo({ tiles: after });
    applyMaps();
    status('Saved');
  } catch (err) {
    fail(err);
    await reloadMaps();
  }
}

async function eraseHex(q, r) {
  const map = activeMap();
  if (!map) return;
  const before = tileAt(q, r);
  if (!before) return;
  try {
    await api('DELETE', `/api/maps/${map.id}/tiles?q=${q}&r=${r}`);
    removeLocalTile(map.id, q, r);
    refreshCell(q, r);
    pushUndo({ tiles: [{ q, r, before, after: null }] });
    ui.selected = { q, r };
    ui.panel = 'tile';
    status('Cleared');
    render();
  } catch (err) { fail(err); }
}

async function moveWaypoint(from, to) {
  const map = activeMap();
  if (!map) return;
  if (from.q === to.q && from.r === to.r) { ui.moving = null; return; }
  const source = tileAt(from.q, from.r);
  if (!source) { ui.moving = null; return; }
  const destBefore = tileAt(to.q, to.r);
  const dest = destBefore || blankTile(to.q, to.r);

  const waypointFields = ['waypoint', 'category', 'description', 'image', 'entryId', 'icon', 'players', 'npcs', 'dmNotes'];
  const carried = { ...dest };
  for (const key of waypointFields) carried[key] = source[key];

  try {
    const afterDest = await putTile(map.id, carried);
    const cleared = { ...source };
    for (const key of waypointFields) cleared[key] = key === 'players' || key === 'npcs' ? [] : '';
    const afterSource = await putTile(map.id, cleared);
    pushUndo({
      tiles: [
        { q: from.q, r: from.r, before: source, after: afterSource },
        { q: to.q, r: to.r, before: destBefore, after: afterDest },
      ],
    });
    ui.moving = null;
    ui.selected = { q: to.q, r: to.r };
    applyMaps();
    render();
    toast('Waypoint moved');
  } catch (err) {
    ui.moving = null;
    fail(err);
  }
}

async function addLabel(x, z) {
  const map = activeMap();
  if (!map) return;
  try {
    const { id } = await api('POST', `/api/maps/${map.id}/labels`, {
      text: 'NEW AREA', x: Math.round(x * 10) / 10, y: Math.round(z * 10) / 10, size: 22,
    });
    await reloadMaps();
    ui.labelId = id;
    ui.panel = 'tile';
    ui.selected = null;
    render();
  } catch (err) { fail(err); }
}

function status(text) {
  const el = document.getElementById('world-save-state');
  if (el) el.textContent = text;
  ui.saving = false;
}

// ---------------------------------------------------------------- undo

function pushUndo(action) {
  ui.undo.push(action);
  if (ui.undo.length > 40) ui.undo.shift();
  ui.redo = [];
}

async function applyUndo(action, direction) {
  const map = activeMap();
  if (!map) return;
  const tiles = action.tiles || [];
  try {
    for (const step of tiles) {
      const target = direction === 'undo' ? step.before : step.after;
      if (target) await putTile(map.id, { ...target, q: step.q, r: step.r });
      else await api('DELETE', `/api/maps/${map.id}/tiles?q=${step.q}&r=${step.r}`);
    }
    await reloadMaps();
    const sel = ui.selected;
    if (sel) ui.panel = 'tile';
    render();
  } catch (err) { fail(err); }
}

on('world-undo', async () => {
  const action = ui.undo.pop();
  if (!action) return;
  ui.redo.push(action);
  await applyUndo(action, 'undo');
});

on('world-redo', async () => {
  const action = ui.redo.pop();
  if (!action) return;
  ui.undo.push(action);
  await applyUndo(action, 'redo');
});

// ---------------------------------------------------------------- actions

on('world-mode', (el) => {
  flushFormSave();
  ui.layer = 'campaign';
  ui.view = el.dataset.mode;
  if (ui.view === 'world') ui.panel = 'tile';
  render();
});

on('world-earth', () => goEarth());
on('world-atlas', () => goAtlas());

on('atlas-enter', () => {
  const view = worldAtlas?.getView();
  if (view) enterWorldAt(view.lat, view.lon);
});

on('atlas-reset', () => {
  const center = EARTH_CAMPAIGN;
  worldAtlas?.setView(center.lat, center.lon, 9.2);
});

on('atlas-globe', () => goEarth());

on('atlas-search', async (form) => {
  const query = String(form.querySelector('[name=q]')?.value || '').trim();
  atlasSearch.query = query;
  atlasSearch.error = '';
  if (!query) { atlasSearch.results = []; render(); return; }
  const needle = query.toLowerCase();
  const local = [];
  for (const map of maps()) {
    for (const tile of map.tiles || []) {
      const name = tile.waypoint || tile.label;
      if (!name || !name.toLowerCase().includes(needle)) continue;
      const point = tileLatLon(tile, map);
      if (!point) continue;
      local.push({ kind: 'campaign', name, label: map.name, lat: point.lat, lon: point.lon, mapId: map.id });
    }
  }
  atlasSearch.results = local.slice(0, 4);
  atlasSearch.loading = true;
  render();
  try {
    const data = await api('GET', `/api/campaigns/${state.campaign.id}/geo/search?q=${encodeURIComponent(query)}`);
    atlasSearch.results = [...local.slice(0, 4), ...(data.results || []).map((r) => ({ ...r, kind: 'place' }))].slice(0, 10);
    atlasSearch.attribution = data.attribution || '';
  } catch (err) {
    atlasSearch.error = err.message;
  } finally {
    atlasSearch.loading = false;
    render();
  }
});

on('atlas-go', (el) => {
  const lat = Number(el.dataset.lat);
  const lon = Number(el.dataset.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  atlasSearch.results = [];
  render();
  requestAnimationFrame(() => worldAtlas?.flyTo(lat, lon, 14.25));
});

on('earth-enter', () => enterCampaign());
on('earth-zoom', () => earthExplorer?.focusCampaign(1.48));
on('earth-focus-campaign', () => earthExplorer?.focusCampaign(1.5));

on('earth-search', async (form) => {
  const query = String(form.querySelector('[name=q]')?.value || '').trim();
  earthSearch.query = query;
  earthSearch.error = '';
  if (!query) { earthSearch.results = []; render(); return; }

  const needle = query.toLowerCase();
  const local = [];
  for (const map of maps()) {
    for (const tile of map.tiles || []) {
      const name = tile.waypoint || tile.label;
      if (!name || !name.toLowerCase().includes(needle)) continue;
      const center = map.config?.geo?.center;
      local.push({
        kind: 'campaign', name, label: map.name,
        lat: center?.lat ?? EARTH_CAMPAIGN.lat,
        lon: center?.lon ?? EARTH_CAMPAIGN.lon,
        mapId: map.id, q: tile.q, r: tile.r,
      });
    }
    for (const label of map.labels || []) {
      if (!label.text?.toLowerCase().includes(needle)) continue;
      const center = map.config?.geo?.center;
      local.push({
        kind: 'campaign', name: label.text, label: map.name,
        lat: center?.lat ?? EARTH_CAMPAIGN.lat,
        lon: center?.lon ?? EARTH_CAMPAIGN.lon,
        mapId: map.id,
      });
    }
  }
  earthSearch.results = local.slice(0, 4);
  earthSearch.loading = true;
  render();
  try {
    const data = await api('GET', `/api/campaigns/${state.campaign.id}/geo/search?q=${encodeURIComponent(query)}`);
    const remote = (data.results || []).map((r) => ({ ...r, kind: 'place' }));
    earthSearch.results = [...local.slice(0, 4), ...remote].slice(0, 10);
    earthSearch.attribution = data.attribution || '';
  } catch (err) {
    earthSearch.error = err.message;
  } finally {
    earthSearch.loading = false;
    render();
  }
});

on('earth-go', (el) => {
  const data = el.dataset;
  const isCampaign = data.kind === 'campaign';
  if (isCampaign) {
    if (data.mapId) state.mapId = data.mapId;
    if (data.q !== '' && data.r !== '') ui.selected = { q: Number(data.q), r: Number(data.r) };
    earthSearch.results = [];
    earthSearch.query = '';
    enterCampaign(data.mapId || undefined);
    return;
  }
  const lat = Number(data.lat);
  const lon = Number(data.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  earthSearch.results = [];
  render();
  requestAnimationFrame(() => earthExplorer?.flyTo(lat, lon, 1.42));
});

on('world-tool', (el) => {
  ui.tool = el.dataset.tool;
  ui.moving = null;
  ui.panel = 'tile';
  render();
});

on('world-terrain', (el) => {
  const id = el.dataset.terrain;
  ui.terrain = id;
  ui.color = TERRAINS[id].color;
  render();
});

on('world-color', (el) => {
  ui.color = el.value;
  ui.terrain = '';
  render();
});

on('world-clear-color', (el, data, e) => {
  e.preventDefault();
  const form = el.closest('form');
  if (form) form.querySelector('[name=color]').value = TERRAINS[form.querySelector('[name=terrain]').value]?.color || '#6b7080';
  flushFormSave(form);
});

on('world-deselect', () => {
  flushFormSave();
  ui.selected = null;
  ui.labelId = null;
  ui.moving = null;
  ui.panel = 'tile';
  render();
});

on('world-go-hex', (el) => {
  flushFormSave();
  ui.selected = { q: Number(el.dataset.q), r: Number(el.dataset.r) };
  ui.labelId = null;
  ui.panel = isEditing() ? 'tile' : 'waypoint';
  render();
});

on('world-edit-hex', (el) => {
  ui.view = 'edit';
  ui.selected = { q: Number(el.dataset.q), r: Number(el.dataset.r) };
  ui.panel = 'tile';
  render();
});

on('world-map-settings', () => { ui.panel = 'map'; ui.selected = null; render(); });
on('world-new-map', () => { ui.panel = 'newmap'; ui.selected = null; render(); });

on('world-open-map', (el) => {
  state.mapId = el.dataset.id;
  ui.layer = 'campaign';
  ui.selected = null;
  ui.labelId = null;
  needsFit = true;
  lastSig = '';
  render();
});

on('world-switch-map', (el) => {
  state.mapId = el.value;
  ui.layer = 'campaign';
  ui.selected = null;
  ui.labelId = null;
  needsFit = true;
  lastSig = '';
  render();
});

on('world-zoom', (el) => {
  const dir = el.dataset.dir;
  if (dir === 'fit') {
    needsFit = true;
    fitCamera();
    if (isInfinite()) {
      const start = globalAxialAt(infinite.baseX, infinite.baseZ);
      infinite.q = start.q;
      infinite.r = start.r;
      lastSig = '';
      buildTiles();
    }
    updateCamera();
    return;
  }
  camera.want = Math.max(8, Math.min(isInfinite() ? 55 : 70, camera.want * (dir === 'in' ? 0.82 : 1.22)));
  if (dir === 'out') scheduleFrontierResize();
});

on('world-create-map', async (form) => {
  const name = form.querySelector('[name=name]')?.value || 'Campaign Map';
  const cols = Number(form.querySelector('[name=cols]')?.value) || 12;
  const rows = Number(form.querySelector('[name=rows]')?.value) || 10;
  try {
    const { id } = await api('POST', `/api/campaigns/${state.campaign.id}/maps`, { name, cols, rows });
    await reloadMaps();
    state.mapId = id;
    ui.layer = 'campaign';
    needsFit = true;
    lastSig = '';
    ui.panel = 'tile';
    toast('World created — paint your first hex', 'ok');
    render();
  } catch (err) { fail(err); }
});

on('world-create-preset', async (el) => {
  try {
    const { id } = await api('POST', `/api/campaigns/${state.campaign.id}/maps`, { preset: el.dataset.preset || 'north-ponds' });
    await reloadMaps();
    state.mapId = id;
    ui.layer = 'campaign';
    needsFit = true;
    lastSig = '';
    ui.panel = 'tile';
    toast(el.dataset.preset === 'webster-ontario' ? 'Webster & Ontario region created' : 'North Ponds Park map created', 'ok');
    render();
  } catch (err) { fail(err); }
});

on('world-save-map', async (form) => {
  const id = form.dataset.id;
  try {
    const map = activeMap();
    await api('PATCH', `/api/maps/${id}`, {
      name: form.querySelector('[name=name]').value,
      cols: Number(form.querySelector('[name=cols]').value),
      rows: Number(form.querySelector('[name=rows]').value),
      config: {
        ...(map?.config || {}),
        accent: form.querySelector('[name=accent]')?.value || map?.config?.accent || '#c7a76a',
        background: form.querySelector('[name=background]')?.value || map?.config?.background || '#0b1519',
        density: Number(form.querySelector('[name=density]')?.value) || 1,
        season: form.querySelector('[name=season]')?.value || map?.config?.season || 'summer',
        weather: form.querySelector('[name=weather]')?.value || map?.config?.weather || 'clear',
      },
    });
    await reloadMaps();
    lastSig = '';
    applyMaps();
    toast('Map updated', 'ok');
    render();
  } catch (err) { fail(err); }
});

on('world-delete-map', async (el) => {
  if (!confirm('Delete this map, its waypoints and its labels? This cannot be undone.')) return;
  try {
    await api('DELETE', `/api/maps/${el.dataset.id}`);
    await reloadMaps();
    ui.selected = null;
    ui.labelId = null;
    ui.panel = 'tile';
    lastSig = '';
    render();
    toast('Map deleted');
  } catch (err) { fail(err); }
});

on('world-save-tile', async (form) => {
  await saveTileForm(form, false);
});

on('world-save-label', async (form) => {
  const map = activeMap();
  if (!map) return;
  try {
    await api('PATCH', `/api/maps/${map.id}/labels/${form.dataset.id}`, {
      text: form.querySelector('[name=text]').value,
      size: Number(form.querySelector('[name=size]').value),
      color: form.querySelector('[name=color]').value,
      visible: form.querySelector('[name=visible]').checked,
    });
    await reloadMaps();
    status('Saved');
  } catch (err) { fail(err); }
});

on('world-delete-label', async (el) => {
  const map = activeMap();
  if (!map) return;
  try {
    await api('DELETE', `/api/maps/${map.id}/labels/${el.dataset.id}`);
    ui.labelId = null;
    await reloadMaps();
    render();
  } catch (err) { fail(err); }
});

on('world-erase-hex', (el) => eraseHex(Number(el.dataset.q), Number(el.dataset.r)));

let imageDraftPending = false;

on('world-pick-image', async () => {
  try {
    const image = await pickImage(900);
    if (!image) return;
    ui.draftImage = image;
    imageDraftPending = true;
    render();
  } catch (err) { fail(err); }
});

on('world-clear-image', () => {
  ui.draftImage = '';
  render();
});

on('world-use-photo', (el) => {
  ui.draftImage = el.dataset.image || '';
  imageDraftPending = true;
  render();
  const form = document.querySelector('.world-form[data-act="world-save-tile"]');
  if (form) scheduleFormSave(form);
});

on('world-add-npc', (el) => {
  const form = el.closest('form');
  const area = form?.querySelector('[name=npcs]');
  if (!area) return;
  const name = el.dataset.name;
  if (area.value.split('\n').map((s) => s.trim()).includes(name)) return;
  area.value = area.value.trim() ? `${area.value.trim()}\n${name}` : name;
  scheduleFormSave(form);
});

on('world-open-entry', (el) => {
  const entry = state.entries.find((e) => e.id === el.dataset.id);
  if (!entry) return;
  ui.selected = null;
  state.page = 'codex';
  state.codexTab = entry.kind;
  state.filter = entry.title;
  render();
});

// ---------------------------------------------------------------- save

let saveTimer = 0;
let saving = false;

function readTileForm(form) {
  const q = Number(form.dataset.q);
  const r = Number(form.dataset.r);
  const existing = tileAt(q, r) || blankTile(q, r);
  const data = new FormData(form);
  return {
    ...existing,
    q, r,
    color: String(data.get('color') || ''),
    terrain: String(data.get('terrain') || ''),
    elevation: Number(data.get('elevation')) || 0,
    label: String(data.get('label') || ''),
    icon: String(data.get('icon') || ''),
    waypoint: String(data.get('waypoint') || '').trim(),
    category: String(data.get('category') || ''),
    description: String(data.get('description') || ''),
    image: ui.draftImage !== undefined ? ui.draftImage : String(data.get('image') || ''),
    entryId: String(data.get('entryId') || ''),
    important: !!form.querySelector('[name=important]')?.checked,
    visible: !!form.querySelector('[name=visible]')?.checked,
    dmNotes: String(data.get('dmNotes') || ''),
    players: Array.from(form.querySelectorAll('[name=players]:checked')).map((el) => el.value),
    npcs: String(data.get('npcs') || '').split('\n').map((s) => s.trim()).filter(Boolean),
  };
}

async function saveTileForm(form, auto) {
  const map = activeMap();
  if (!map || !form) return;
  if (saving) return;
  saving = true;
  ui.saving = true;
  if (!auto) status('Saving…');
  try {
    const payload = readTileForm(form);
    const before = tileAt(payload.q, payload.r);
    const saved = await putTile(map.id, payload);
    ui.draftImage = undefined;
    imageDraftPending = false;
    applyMaps();
    status('Saved');
    if (!auto && before) {
      pushUndo({ tiles: [{ q: payload.q, r: payload.r, before, after: saved }] });
    }
    if (!auto) {
      const heading = form.querySelector('.wf-head h2');
      if (heading) heading.textContent = saved.waypoint || saved.label || 'Edit tile';
    }
  } catch (err) {
    status('Not saved');
    fail(err);
  } finally {
    saving = false;
    ui.saving = false;
  }
}

function scheduleFormSave(form) {
  if (!form) return;
  clearTimeout(saveTimer);
  status('Saving…');
  saveTimer = setTimeout(() => saveTileForm(form, true), 750);
}

function flushFormSave() {
  clearTimeout(saveTimer);
  const form = document.querySelector('.world-form[data-act="world-save-tile"]');
  if (form) saveTileForm(form, true);
}

// Autosave every field in the location editor.
document.addEventListener('input', (e) => {
  const form = e.target.closest?.('.world-form[data-act="world-save-tile"]');
  if (form) scheduleFormSave(form);
});
document.addEventListener('change', (e) => {
  const form = e.target.closest?.('.world-form[data-act="world-save-tile"]');
  if (form) scheduleFormSave(form);
});

// Labels save themselves too, debounced like the tile inspector.
let labelTimer = 0;
document.addEventListener('input', (e) => {
  const form = e.target.closest?.('.world-form[data-act="world-save-label"]');
  if (!form) return;
  clearTimeout(labelTimer);
  labelTimer = setTimeout(() => form.requestSubmit(), 700);
});

// ---------------------------------------------------------------- codex link

/** Jump from a codex entry to its hex, selecting it ready to read. */
export function focusEntryOnMap(entryId) {
  const found = maps().find((m) => m.tiles.some((t) => t.entryId === entryId));
  const tile = found?.tiles.find((t) => t.entryId === entryId);
  if (!found || !tile) {
    toast('That entry is not placed on a map yet');
    return;
  }
  state.mapId = found.id;
  state.page = 'world';
  ui.selected = { q: tile.q, r: tile.r };
  ui.panel = 'waypoint';
  ui.view = 'world';
  ui.labelId = null;
  needsFit = true;
  render();
}
