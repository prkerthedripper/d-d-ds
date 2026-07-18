// One consistent vector icon set — 24x24 grid, 1.75 stroke, round caps.
// Drawn inline so there are no CDN requests and it works offline.

const PATHS = {
  // navigation
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-3v-7H9v7H6a2 2 0 0 1-2-2v-9"/>',
  shield: '<path d="M12 21s7-3.5 7-9V5.5L12 3 5 5.5V12c0 5.5 7 9 7 9Z"/>',
  backpack: '<path d="M6 21a2 2 0 0 1-2-2v-8a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v8a2 2 0 0 1-2 2Z"/><path d="M9 6V5a3 3 0 0 1 6 0v1"/><path d="M9 13h6"/>',
  dice: '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7Z"/><path d="M12 2.5 4 7l8 4.5L20 7Z"/><path d="M12 11.5v10"/>',
  swords: '<path d="M18.5 2.5 21 3l-.5 2.5L11 15l-2-2Z"/><path d="M5.5 2.5 3 3l.5 2.5L13 15l2-2Z"/><path d="m7 17 3 3"/><path d="m17 17-3 3"/><path d="M9.5 20.5 7.5 22.5"/><path d="m14.5 20.5 2 2"/>',
  sparkles: '<path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z"/><path d="M18 16.5 18.8 18.4 20.7 19.2 18.8 20 18 21.9 17.2 20 15.3 19.2 17.2 18.4Z"/>',
  notes: '<path d="M6 3h8l5 5v13H6Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
  chat: '<path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 4 12v-.5A7.5 7.5 0 0 1 11.5 4h1A7.5 7.5 0 0 1 20 11.5Z"/>',
  // Sliders rather than a gear — a spoked gear reads as a sun next to the theme toggle.
  settings: '<path d="M5 21V14"/><path d="M5 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M19 21v-5"/><path d="M19 12V3"/><path d="M2.5 14h5"/><path d="M9.5 12h5"/><path d="M16.5 16h5"/>',

  // brand + theme
  dragon: '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7Z"/><path d="m8.5 9 3.5 6 3.5-6Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/><path d="m6.3 17.7-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',

  // actions
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3"/><path d="m15 6 3 3"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  send: '<path d="M21 3 3 10.5l7 3 3 7Z"/><path d="M21 3 10 14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  arrowRight: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',

  // game
  star: '<path d="m12 3.5 2.7 5.6 6 .9-4.35 4.3 1.03 6.1L12 17.5 6.62 20.4l1.03-6.1L3.3 10l6-.9Z"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6c0 5-7 9.4-7 9.4Z"/>',
  skull: '<path d="M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3Z"/><circle cx="9.2" cy="11.5" r="1.6"/><circle cx="14.8" cy="11.5" r="1.6"/><path d="M12 15v2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.9"/><path d="M18 14.4a6 6 0 0 1 3 5.6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  sword: '<path d="M20 3h-4l-9 9 4 4 9-9Z"/><path d="m6.5 14.5-3 3 3 3 3-3"/><path d="m4 20 2 2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2Z"/><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2Z"/>',
  bed: '<path d="M3 18V7"/><path d="M3 12h18v6"/><path d="M3 18h18"/><circle cx="7.5" cy="9.5" r="1.8"/><path d="M11 12V9.5a1 1 0 0 1 1-1h6a3 3 0 0 1 3 3V12"/>',
  hourglass: '<path d="M7 3h10"/><path d="M7 21h10"/><path d="M7 3v3.5L12 12l5-5.5V3"/><path d="M7 21v-3.5L12 12l5 5.5V21"/>',

  // item categories
  potion: '<path d="M10 3h4"/><path d="M10.5 3v5L6.6 15.4A3 3 0 0 0 9.3 20h5.4a3 3 0 0 0 2.7-4.6L13.5 8V3"/><path d="M8 14h8"/>',
  armor: '<path d="M12 21s7-3.5 7-9V5.5L12 3 5 5.5V12c0 5.5 7 9 7 9Z"/><path d="M12 3v18"/>',
  arrow: '<path d="M4 20 20 4"/><path d="M15 4h5v5"/><path d="M4 20h4v-4"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
  gem: '<path d="m12 3 8 6-8 12L4 9Z"/><path d="M4 9h16"/><path d="m12 3-4 6 4 12 4-12Z"/>',
  scroll: '<path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M9 9h6"/><path d="M9 13h6"/><path d="M9 17h3"/>',
  shop: '<path d="M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M3 9 5 4h14l2 5"/><path d="M9 21v-6h6v6"/>',

  // conditions
  fire: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-5.5-3-9 0 0-3 1.5-3 5 0-2-1.5-3-1.5-3S6 10 6 15a6 6 0 0 0 6 6Z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M10.6 6.3A8.7 8.7 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.4"/><path d="M6.2 8.6A15 15 0 0 0 3 12s4 6 9 6a8.5 8.5 0 0 0 3.4-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  brain: '<path d="M9.5 4a2.5 2.5 0 0 0-2.4 3.2A2.5 2.5 0 0 0 5 12a2.5 2.5 0 0 0 1.6 4.7A2.5 2.5 0 0 0 12 19V5.5A1.5 1.5 0 0 0 10.5 4Z"/><path d="M14.5 4a2.5 2.5 0 0 1 2.4 3.2A2.5 2.5 0 0 1 19 12a2.5 2.5 0 0 1-1.6 4.7A2.5 2.5 0 0 1 12 19"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
};

/** Category -> icon + tint, used for the placeholder art on inventory items. */
export const ITEM_LOOK = {
  Weapon: { icon: 'sword', tint: '#c0392b' },
  Armor: { icon: 'armor', tint: '#5b6b8c' },
  Potion: { icon: 'potion', tint: '#2e9e5b' },
  Ammunition: { icon: 'arrow', tint: '#a06a2c' },
  'Quest Item': { icon: 'gem', tint: '#8a4fbf' },
  Gear: { icon: 'backpack', tint: '#6d47e0' },
  Other: { icon: 'scroll', tint: '#7a7686' },
};

export const itemLook = (category) => ITEM_LOOK[category] || ITEM_LOOK.Other;

/** A square tinted tile with the category icon — the item "picture". */
export function itemTile(category, size = 38) {
  const look = itemLook(category);
  return `<span class="item-tile" style="--tint:${look.tint};width:${size}px;height:${size}px">
    ${icon(look.icon, { size: Math.round(size * 0.55) })}</span>`;
}

/**
 * @param {string} name  key from PATHS
 * @param {{size?:number, cls?:string, fill?:boolean}} opts
 */
export function icon(name, { size = 18, cls = '', fill = false } = {}) {
  const body = PATHS[name];
  if (!body) return '';
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" `
    + `fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.75" `
    + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS);
