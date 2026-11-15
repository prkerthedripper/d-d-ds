# Earth and regional geography credits

## Globe imagery

- `blue-marble.jpg` — NASA Blue Marble: Land Surface, Ocean Color and Sea Ice.
  NASA Earth Observatory / Goddard Space Flight Center. Public domain in the
  United States (NASA imagery). Source: https://visibleearth.nasa.gov/collection/1484/blue-marble
  The copy used by the app is the 4096×2048 Three.js globe example texture,
  derived from the NASA Blue Marble dataset.
- `topology.png`, `water-mask.png` — derived NASA Blue Marble topology/water
  masks distributed with the Three.js globe example. Public domain.
- `clouds.png` (if present) — NASA Blue Marble cloud layer. Public domain.

The app stores these files locally; it does not hotlink the textures at runtime.

## Regional OpenStreetMap data

`server/region-data.json` contains simplified geometry for selected roads and
waterways around Webster, Ontario, and Irondequoit Bay, captured from
OpenStreetMap on 2026-11-10.

© OpenStreetMap contributors, licensed under the OpenStreetMap Foundation
Contributor Terms / ODbL 1.0. https://www.openstreetmap.org/copyright

The geometry is used only to seed an editable campaign map. It is not a live
tile service and the campaign layer can be repainted, moved, or replaced by the
DM. Real-world place coordinates in `server/region.js` come from OpenStreetMap's
Nominatim search results and the same OSM data.

## Search

Real-world search uses the public Nominatim service when configured. Results
must retain OpenStreetMap attribution and are cached by the server. The public
instance has a one-request-per-second limit and is not used for autocomplete.
