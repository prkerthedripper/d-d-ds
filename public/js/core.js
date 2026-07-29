// Shared state, API client, socket wiring and the tiny render loop.
import { playFx } from './fx.js';

export const state = {
  booted: false,
  user: null,
  campaigns: [],
  invites: [],
  campaign: null,
  members: [],
  characters: [],
  combat: { active: false, round: 1, turnIndex: 0, name: 'Encounter', combatants: [] },
  notes: [],
  rolls: [],
  messages: [],
  campaignInvites: [],
  presets: [],
  online: [],
  srd: {
    spells: [], conditions: [], classes: [], races: [], skills: {}, monsters: [],
    spellEffects: {}, actions: [], conditionLook: {},
  },
  attackFrom: null, // combatant id picking a target
  entries: [],
  codexTab: 'quest',
  turnAlert: null, // combatant whose turn just started, shown as a popup
  lastTurnKey: null, // guards against re-alerting on every render
  page: 'home',
  modal: null,
  filter: '',
  selectedCharId: null,
  authMode: 'login',
  theme: localStorage.getItem('dndds-theme') || 'light',
  clock: Date.now(), // ticks once a second while a fight is on screen
  turnTab: 'actions',
  pendingAction: null,
  turnAlertShown: false,
  importPreview: null,
  simple: localStorage.getItem('dndds-simple') !== '0', // plain-language mode, on by default
  rollRequests: [], // pending "the DM wants a roll" prompts for this user
  economy: null, // action/bonus tracker for the current turn
};

// ---------------------------------------------------------------- api

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * On the free hosting tier the server sleeps and the database takes a moment to
 * wake, so a gateway error or dropped connection is retried rather than shown as
 * a failed button press.
 */
export async function api(method, path, body, attempt = 0) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network blip — no response at all.
    if (attempt < 3) { await pause(600 * 2 ** attempt); return api(method, path, body, attempt + 1); }
    throw new Error('Cannot reach the server — check your connection.');
  }

  if ([502, 503, 504].includes(res.status) && attempt < 3) {
    if (attempt === 0) toast('Waking the server up…');
    await pause(1500 * 2 ** attempt);
    return api(method, path, body, attempt + 1);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || (res.status >= 500
      ? 'The server had a hiccup — try that again.'
      : `Request failed (${res.status})`));
  }
  return data;
}

// ---------------------------------------------------------------- helpers

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const mod = (score) => Math.floor((Number(score || 10) - 10) / 2);
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const nameOf = (userId) => state.members.find((m) => m.id === userId)?.username || 'Someone';

export function ago(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const isDM = () => state.campaign?.role === 'dm';
export const myChars = () => state.characters.filter((c) => c.ownerId === state.user?.id);

/**
 * Round avatar. Falls back to initials when there is no portrait.
 * @param {string} name
 * @param {string} extra  extra classes, e.g. 'lg' or 'on'
 * @param {string} image  data URI
 */
export function avatar(name, extra = '', image = '') {
  if (image) {
    return `<div class="avatar ${extra}" style="background-image:url('${esc(image)}')"
      role="img" aria-label="${esc(name)}"></div>`;
  }
  return `<div class="avatar ${extra}">${esc(initials(name))}</div>`;
}

/** Portrait for a combatant, looked up from its character when it has one. */
export function portraitOf(combatant) {
  if (combatant.image) return combatant.image;
  const sheet = combatant.charId && state.characters.find((c) => c.id === combatant.charId);
  return sheet?.portrait || '';
}

export function hpBar(hp, maxHp) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
  const cls = pct > 50 ? '' : pct > 25 ? 'hurt' : 'bad';
  return `<div class="bar"><i class="${cls}" style="width:${pct}%"></i></div>`;
}

// ---------------------------------------------------------------- toast

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 3200);
}

export const fail = (err) => toast(err.message || String(err), 'err');

// ---------------------------------------------------------------- actions

const actions = new Map();
export const on = (name, fn) => actions.set(name, fn);

export function bindEvents(root, render) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;

    // A <form> carries data-act for its submit handler. Clicking anything inside
    // it — a text box, a label — bubbles up to here, and firing the action would
    // save the form the moment you touched a field. Forms only run on submit.
    if (el.tagName === 'FORM') return;

    const fn = actions.get(el.dataset.act);
    if (!fn) return;
    e.preventDefault();
    // Handlers get the event so overlays can tell a backdrop click from a click
    // on their own contents. Never stop propagation inside the app — this
    // listener is delegated, so anything swallowed here stops working entirely.
    Promise.resolve(fn(el, el.dataset, e)).catch(fail);
  });

  root.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-act]');
    if (!form) return;
    e.preventDefault();
    const fn = actions.get(form.dataset.act);
    if (fn) Promise.resolve(fn(form, form.dataset)).catch(fail);
  });

  root.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = actions.get(el.dataset.change);
    if (fn) Promise.resolve(fn(el, el.dataset)).catch(fail);
  });

  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-live]');
    if (!el) return;
    const fn = actions.get(el.dataset.live);
    if (fn) Promise.resolve(fn(el, el.dataset)).catch(fail);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.modal) { state.modal = null; render(); }
  });
}

// ---------------------------------------------------------------- render

let renderFn = () => {};
export const setRenderer = (fn) => { renderFn = fn; };

/** A stable identity for a field, so its value survives a re-render. */
function fieldKey(el) {
  if (el.dataset.keep) return `k:${el.dataset.keep}`;
  const act = el.closest('form')?.dataset?.act;
  if (act && el.name) return `f:${act}:${el.name}`;
  return null;
}

/**
 * Re-render the whole app.
 *
 * Rendering replaces the DOM wholesale, so anything half-typed would be thrown
 * away — and a render can fire at any moment because someone else rolled dice or
 * took damage. Every field is snapshotted by its data-keep name and put back
 * afterwards, along with focus, caret and scroll position.
 */
export function render() {
  const active = document.activeElement;
  const keep = active?.dataset?.keep;
  const caret = keep && 'selectionStart' in active ? active.selectionStart : null;
  const scroller = document.querySelector('.content');
  const scrollTop = scroller?.scrollTop ?? 0;

  // Snapshot what the user has typed but not yet submitted. Fields carry an
  // explicit data-keep, or fall back to "which form + which field".
  const typed = new Map();
  for (const el of document.querySelectorAll('input, textarea, select')) {
    const key = fieldKey(el);
    if (!key) continue;
    typed.set(key, el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value);
  }

  document.documentElement.dataset.theme = state.theme;
  renderFn();

  for (const el of document.querySelectorAll('input, textarea, select')) {
    const key = fieldKey(el);
    if (!key || !typed.has(key)) continue;
    const value = typed.get(key);
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = value;
    else if (el.value !== value) el.value = value;
  }

  if (keep) {
    const next = document.querySelector(`[data-keep="${keep}"]`);
    if (next) {
      next.focus();
      if (caret !== null && 'setSelectionRange' in next) {
        try { next.setSelectionRange(caret, caret); } catch { /* number inputs */ }
      }
    }
  }

  const nextScroller = document.querySelector('.content');
  if (nextScroller && scrollTop) nextScroller.scrollTop = scrollTop;
}

// ---------------------------------------------------------------- data

export async function loadMe() {
  const data = await api('GET', '/api/me');
  state.user = data.user;
  state.campaigns = data.campaigns || [];
  state.invites = data.invites || [];
}

export async function openCampaign(id) {
  const data = await api('GET', `/api/campaigns/${id}`);
  state.campaign = data.campaign;
  state.members = data.members;
  state.characters = data.characters;
  state.combat = data.combat;
  state.notes = data.notes;
  state.rolls = data.rolls;
  state.messages = data.messages;
  state.campaignInvites = data.invites || [];
  state.presets = data.presets || [];
  state.entries = data.entries || [];
  state.lastTurnKey = null; // a fresh load should not fire a stale turn alert
  state.turnAlert = null;
  state.selectedCharId = myChars()[0]?.id || state.characters[0]?.id || null;
  state.page = 'home';
  localStorage.setItem('dndds-campaign', id);
  joinSocket(id);
  render();
}

export async function refresh() {
  if (state.campaign) await openCampaign(state.campaign.id);
}

// ---------------------------------------------------------------- turn alert

/** A short rising chime, synthesised so there is no audio file to ship. */
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
    setTimeout(() => ctx.close(), 900);
  } catch { /* audio blocked until the user interacts — not worth surfacing */ }
}

/**
 * Fire the "your turn" popup when the active combatant becomes one this user
 * controls. Keyed on round+index so it triggers once per turn, not per render.
 */
export function checkMyTurn() {
  const { active, combatants, turnIndex, round } = state.combat;
  if (!active || !combatants.length) {
    state.lastTurnKey = null;
    state.turnAlert = null;
    return;
  }

  const current = combatants[turnIndex % combatants.length];
  const key = `${round}:${turnIndex}:${current?.id}`;
  if (key === state.lastTurnKey) return;
  state.lastTurnKey = key;

  const sheet = current?.charId && state.characters.find((c) => c.id === current.charId);
  const isMine = sheet && sheet.ownerId === state.user?.id;
  if (!isMine) return;

  state.turnAlert = current;
  state.turnAlertShown = false; // let the entrance animation play once
  state.turnTab = 'menu'; // always open on the simple menu
  chime();
  if (navigator.vibrate) navigator.vibrate([160, 80, 160]);
}

// ---------------------------------------------------------------- socket

let socket = null;

export function initSocket() {
  if (socket) return socket;
  socket = window.io();

  socket.on('patch', ({ scope, data }) => {
    switch (scope) {
      case 'campaign': state.campaign = { ...state.campaign, ...data }; break;
      case 'members': state.members = data; break;
      case 'characters': state.characters = data; break;
      case 'entries': state.entries = data; break;
      case 'combat':
        state.combat = data;
        checkMyTurn();
        break;
      case 'notes': state.notes = data; break;
      case 'invites': state.campaignInvites = data; break;
      case 'presets':
        // The library changed — pull the fresh list.
        api('GET', `/api/campaigns/${state.campaign.id}/presets`)
          .then(({ presets }) => { state.presets = presets; render(); })
          .catch(() => {});
        break;
      case 'roll':
        state.rolls = [data, ...state.rolls].slice(0, 40);
        if (data.userId !== state.user?.id) {
          toast(`${nameOf(data.userId)} rolled ${data.total}${data.label ? ` (${data.label})` : ''}`);
        }
        break;
      case 'message':
        state.messages = [...state.messages, data].slice(-80);
        break;
      default: break;
    }
    render();
  });

  // Combat animations are pushed to everyone watching the fight.
  socket.on('fx', (fx) => { playFx(fx); });

  // "The DM wants a roll" — queue it if it is addressed to this player.
  socket.on('rollreq', (reqObj) => {
    const mine = reqObj.to === 'all' || reqObj.to === state.user?.id;
    if (!mine) return;
    state.rollRequests = [reqObj, ...state.rollRequests.filter((r) => r.id !== reqObj.id)].slice(0, 6);
    chime();
    if (navigator.vibrate) navigator.vibrate(120);
    render();
  });

  socket.on('presence', (ids) => { state.online = ids; render(); });
  socket.on('connect', () => { if (state.campaign) socket.emit('join', state.campaign.id); });
  return socket;
}

export function joinSocket(campaignId) {
  initSocket().emit('join', campaignId);
}
