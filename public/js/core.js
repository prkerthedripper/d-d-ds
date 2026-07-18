// Shared state, API client, socket wiring and the tiny render loop.

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
  srd: { spells: [], conditions: [], classes: [], races: [], skills: {}, monsters: [] },
  attackFrom: null, // combatant id picking a target
  page: 'home',
  modal: null,
  filter: '',
  selectedCharId: null,
  authMode: 'login',
  theme: localStorage.getItem('dndds-theme') || 'light',
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

export function avatar(name, extra = '') {
  return `<div class="avatar ${extra}">${esc(initials(name))}</div>`;
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
    const fn = actions.get(el.dataset.act);
    if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(el, el.dataset)).catch(fail);
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

/** Re-render the whole app, keeping focus and caret in the field being typed in. */
export function render() {
  const active = document.activeElement;
  const keep = active?.dataset?.keep;
  const caret = keep && 'selectionStart' in active ? active.selectionStart : null;
  const scroller = document.querySelector('.content');
  const scrollTop = scroller?.scrollTop ?? 0;

  document.documentElement.dataset.theme = state.theme;
  renderFn();

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
  state.selectedCharId = myChars()[0]?.id || state.characters[0]?.id || null;
  state.page = 'home';
  localStorage.setItem('dndds-campaign', id);
  joinSocket(id);
  render();
}

export async function refresh() {
  if (state.campaign) await openCampaign(state.campaign.id);
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
      case 'combat': state.combat = data; break;
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

  socket.on('presence', (ids) => { state.online = ids; render(); });
  socket.on('connect', () => { if (state.campaign) socket.emit('join', state.campaign.id); });
  return socket;
}

export function joinSocket(campaignId) {
  initSocket().emit('join', campaignId);
}
