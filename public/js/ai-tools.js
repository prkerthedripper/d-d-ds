// ============================================================================
// AI TOOLS — the Oracle
//
// A DM-only improvisation desk. Everything here is a draft until the DM saves
// it, and saved entries default to DM-only so players never see prep by accident.
// ============================================================================

import { state, api, esc, isDM, toast, fail, on, render, ago } from './core.js';
import { icon } from './icons.js';
import { BACKGROUNDS } from './art.js';

const KIND_META = {
  npc: { label: 'NPC', single: 'person', icon: 'users', color: '#b39cff' },
  location: { label: 'Location', single: 'place', icon: 'pin', color: '#71c6ff' },
  shop: { label: 'Business', single: 'business', icon: 'shop', color: '#e1b96e' },
  item: { label: 'Item', single: 'item', icon: 'gem', color: '#75d4c4' },
  quest: { label: 'Side quest', single: 'quest', icon: 'target', color: '#f0a96b' },
  event: { label: 'Event', single: 'event', icon: 'hourglass', color: '#8fb1ff' },
  encounter: { label: 'Encounter', single: 'encounter', icon: 'swords', color: '#ef8b93' },
  lore: { label: 'World lore', single: 'secret', icon: 'book', color: '#c3a2ff' },
};

const QUICK_ACTIONS = [
  { kind: 'npc', icon: 'users', label: 'Random NPC', prompt: 'Generate a random NPC who could believably live in Webster, New York. Give me someone the party might meet today.' },
  { kind: 'npc', icon: 'shop', label: 'Local employee', prompt: 'Generate an employee at a local business in Webster or Ontario, New York. Pick a believable workplace, role and shift.' },
  { kind: 'npc', icon: 'eye', label: 'Stranger', prompt: 'Generate a stranger the party notices on the street. Make them feel like a real local with a small, useful story hook.' },
  { kind: 'npc', icon: 'users', label: 'Side character', prompt: 'Generate a memorable side character connected to the party’s current situation, with a short backstory and a secret.' },
  { kind: 'location', icon: 'pin', label: 'Location', prompt: 'Generate a small, usable location in the Webster or Ontario area. Ground it in the real setting and include one strange detail.' },
  { kind: 'item', icon: 'gem', label: 'Item', prompt: 'Generate a campaign item tied to the crystal and the supernatural. Make it useful for roleplay, not just a stat bonus.' },
  { kind: 'encounter', icon: 'swords', label: 'Random encounter', prompt: 'Generate a short random encounter for a contemporary supernatural campaign in Webster, New York. Give me a situation the DM can run immediately.' },
  { kind: 'quest', icon: 'target', label: 'Side quest', prompt: 'Generate a small side quest the party could stumble into tonight. Keep it local, personal and playable in one session.' },
];

const SUGGESTED = [
  'Make me a 19-year-old cashier at Bill Gray’s.',
  'I need a police officer who might question the party.',
  'Generate a teacher at Webster Thomas High School.',
  'Make a suspicious customer who keeps coming into the store.',
  'Generate a random person who knows something about the crystal.',
  'Make a character who seems normal but is secretly involved in something supernatural.',
];

const kindMeta = (kind) => KIND_META[kind] || KIND_META.npc;

function ensureState() {
  if (!state.ai) {
    state.ai = {
      loaded: false, loading: false, busy: false, error: '', setup: false,
      history: [], current: null, prompt: '', status: null, editing: false,
      saved: null, share: false, locationId: '',
    };
  }
  return state.ai;
}

export async function loadAITools(force = false) {
  const ai = ensureState();
  if (!isDM() || ai.loading || (ai.loaded && !force)) return;
  ai.loading = true;
  ai.error = '';
  render();
  try {
    const data = await api('GET', `/api/campaigns/${state.campaign.id}/ai/history`);
    ai.history = data.generations || [];
    ai.status = data.status || null;
    ai.loaded = true;
  } catch (err) {
    ai.error = err.message;
    ai.loaded = true;
  } finally {
    ai.loading = false;
    render();
  }
}

function setPrompt(value) {
  const ai = ensureState();
  ai.prompt = value;
  render();
  // render() deliberately restores fields the user was editing. A suggested
  // prompt is a deliberate replacement, so write it after that restoration.
  requestAnimationFrame(() => {
    const field = document.querySelector('[name="ai-prompt"]');
    if (!field) return;
    field.value = value;
    field.focus();
    field.setSelectionRange?.(value.length, value.length);
  });
}

async function requestGeneration({ prompt, kind = 'auto', action = 'generate' }) {
  const ai = ensureState();
  if (!isDM() || ai.busy) return;
  const clean = String(prompt || '').trim();
  if (!clean && action === 'generate') {
    toast('Tell the Oracle what you need first.', 'err');
    return;
  }

  ai.busy = true;
  ai.error = '';
  ai.setup = false;
  ai.saved = null;
  ai.editing = false;
  ai.prompt = clean;
  if (action === 'generate') ai.share = false;
  render();

  try {
    const data = await api('POST', `/api/campaigns/${state.campaign.id}/ai/generate`, {
      prompt: clean,
      kind,
      action,
      current: ai.current?.result || null,
    });
    ai.current = data.generation;
    ai.status = data.status || ai.status;
    ai.history = [data.generation, ...(ai.history || []).filter((g) => g.id !== data.generation.id)].slice(0, 24);
    ai.loaded = true;
    ai.busy = false;
    render();
    toast(action === 'generate' ? 'The Oracle has something.' : 'The Oracle revised the draft.', 'ok');
  } catch (err) {
    ai.busy = false;
    ai.error = err.message;
    ai.setup = /NVIDIA_API_KEY|not connected/i.test(err.message);
    render();
  }
}

async function saveCurrent() {
  const ai = ensureState();
  if (!ai.current || ai.busy) return;
  ai.busy = true;
  ai.error = '';
  render();
  try {
    const data = await api('POST', `/api/campaigns/${state.campaign.id}/ai/save`, {
      result: ai.current.result,
      share: ai.share,
      generationId: ai.current.id,
    });
    ai.saved = data.saved;
    ai.busy = false;
    render();
    toast(`Saved to ${data.saved.label}.`, 'ok');
  } catch (err) {
    ai.busy = false;
    ai.error = err.message;
    render();
    fail(err);
  }
}

function resultKind(record) {
  return record?.result?.kind || record?.kind || 'npc';
}

function resultSubtitle(result) {
  if (result.kind === 'npc') return result.npc?.occupation || result.subtitle;
  if (result.kind === 'item') return result.item?.category || result.subtitle;
  if (result.kind === 'location') return result.location?.type || result.subtitle;
  return result.subtitle;
}

function field(label, value) {
  if (!value) return '';
  return `<div class="oracle-field"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function section(title, body) {
  if (!body) return '';
  return `<section class="oracle-section"><h3>${esc(title)}</h3><p>${esc(body).replace(/\n/g, '<br />')}</p></section>`;
}

function tagsView(tags) {
  return tags?.length
    ? `<div class="oracle-tags">${tags.map((tag) => `<span>${esc(tag)}</span>`).join('')}</div>`
    : '';
}

function factsView(result) {
  if (!result.establishedFacts?.length && !result.newFacts?.length) return '';
  return `
    <section class="oracle-facts">
      ${result.establishedFacts?.length ? `
        <div><span class="oracle-fact-label">FROM CAMPAIGN</span>
          ${result.establishedFacts.map((f) => `<span class="oracle-fact established">${esc(f)}</span>`).join('')}
        </div>` : ''}
      ${result.newFacts?.length ? `
        <div><span class="oracle-fact-label">NEWLY INVENTED</span>
          ${result.newFacts.map((f) => `<span class="oracle-fact invented">${esc(f)}</span>`).join('')}
        </div>` : ''}
    </section>`;
}

function npcView(result) {
  const n = result.npc || {};
  return `
    <div class="oracle-fields npc-fields">
      ${field('Occupation', n.occupation)}
      ${field('Age', n.age)}
      ${field('Gender', n.gender)}
      ${field('Personality', n.personality)}
      ${field('Appearance', n.appearance)}
      ${field('Usual location', n.location)}
    </div>
    ${section('Backstory', n.backstory || result.body)}
    ${n.motivation || n.fear || n.quirk || n.secret ? `
      <div class="oracle-hooks">
        ${field('Motivation', n.motivation)}
        ${field('Fear', n.fear)}
        ${field('Quirk', n.quirk)}
        ${field('Secret', n.secret)}
      </div>` : ''}
    ${n.dialogue?.length ? `
      <section class="oracle-section oracle-dialogue">
        <h3>Things they might say</h3>
        ${n.dialogue.map((line) => `<blockquote>“${esc(line)}”</blockquote>`).join('')}
      </section>` : ''}
  `;
}

function genericView(result) {
  const meta = kindMeta(result.kind);
  const detail = result[result.kind] || {};
  const special = [];
  if (result.kind === 'item') {
    special.push(field('Category', detail.category), field('Value', detail.value), field('Weight', detail.weight));
    if (detail.properties?.length) special.push(field('Properties', detail.properties.join(' · ')));
  }
  if (result.kind === 'location') {
    special.push(field('Type', detail.type), field('Address', detail.address));
  }
  if (result.kind === 'quest') {
    special.push(field('Objective', detail.objective), field('Reward', detail.reward));
  }
  if (result.kind === 'event') {
    special.push(field('When', detail.when), field('Involved', detail.whoIsInvolved?.join(' · ')));
  }
  if (result.kind === 'encounter') {
    special.push(field('Stakes', detail.stakes), field('Twist', detail.twist), field('Creatures', detail.creatures?.join(' · ')));
  }
  if (result.kind === 'lore') {
    special.push(field('Rumour', detail.rumor), field('Hook', detail.hook));
  }
  if (result.kind === 'shop') {
    special.push(field('Owner', detail.owner), field('Type', detail.type), field('Wares', detail.wares?.join(' · ')));
  }

  const listed = result.fields?.length
    ? `<div class="oracle-fields">${result.fields.map((f) => field(f.label, f.value)).join('')}</div>`
    : '';
  const body = result.body && result.body !== result.summary
    ? section('Details', result.body)
    : '';

  return `
    ${result.summary ? `<p class="oracle-summary">${esc(result.summary)}</p>` : ''}
    ${special.length ? `<div class="oracle-fields">${special.filter(Boolean).join('')}</div>` : ''}
    ${body}
    ${detail.complications?.length ? section('Complications', detail.complications.join('\n')) : ''}
    ${detail.setup && result.kind === 'encounter' ? section('Setup', detail.setup) : ''}
    ${detail.description && result.kind !== 'item' && result.kind !== 'location' && result.kind !== 'shop' ? section('Description', detail.description) : ''}
    ${result.kind === 'item' && detail.storyHook ? section('Story hook', detail.storyHook) : ''}
    ${result.kind === 'location' && detail.secret ? section('Secret', detail.secret) : ''}
    ${listed}
  `;
}

function resultView(record) {
  const ai = ensureState();
  const result = record.result;
  const meta = kindMeta(result.kind);
  const locations = (state.entries || []).filter((e) => e.kind === 'location');
  const assignedId = ai.locationId
    || locations.find((e) => e.title === result.npc?.location)?.id
    || '';

  return `
  <div class="oracle-result" style="--oracle-kind:${meta.color}">
    <div class="oracle-result-kicker">
      <span class="oracle-kind">${icon(meta.icon, { size: 13 })} ${esc(meta.label)}</span>
      <span class="oracle-draft">DRAFT — NOT IN THE CODEX</span>
      ${result.duplicateOf ? `<span class="oracle-duplicate">${icon('eyeOff', { size: 12 })} ${esc(result.duplicateOf)} already exists</span>` : ''}
    </div>

    <header class="oracle-result-head">
      <div class="oracle-avatar">${icon(meta.icon, { size: 24 })}</div>
      <div>
        <h2>${esc(result.title)}</h2>
        <p>${esc(resultSubtitle(result) || meta.label)}</p>
      </div>
    </header>

    ${result.duplicateOf ? `<div class="oracle-warning">${icon('eyeOff', { size: 14 })}
      An existing ${esc(meta.single)} has this name. Regenerate, edit the name, or save only if you intend a separate entry.</div>` : ''}

    ${result.kind === 'npc' ? npcView(result) : genericView(result)}

    ${result.kind === 'npc' ? `
      <section class="oracle-location">
        <div class="oracle-section-head"><span>ASSIGN TO A KNOWN PLACE</span></div>
        ${locations.length ? `
          <select data-change="ai-location">
            <option value="">No location assigned</option>
            ${locations.map((loc) => `<option value="${loc.id}" ${loc.id === assignedId ? 'selected' : ''}>${esc(loc.title)}${loc.subtitle ? ` — ${esc(loc.subtitle)}` : ''}</option>`).join('')}
          </select>` : '<p class="oracle-muted">No locations in the codex yet. Save a location first, or leave this NPC unassigned.</p>'}
      </section>` : ''}

    ${tagsView(result.tags)}
    ${factsView(result)}

    ${ai.saved ? `
      <div class="oracle-saved">
        ${icon('check', { size: 15 })}
        <span>Saved to ${esc(ai.saved.label)}${ai.share ? ' and shared with the table' : ' as DM-only'}.</span>
        ${ai.saved.id ? `<button data-act="ai-open-saved">Open saved entry</button>` : `<button data-act="game-nav" data-page="codex">Open Codex</button>`}
      </div>` : ''}

    <div class="oracle-actions">
      <button class="oracle-btn primary" data-act="ai-save" ${ai.busy || ai.saved ? 'disabled' : ''}>
        ${icon('book', { size: 14 })} ${ai.saved ? 'Saved' : 'Save to Campaign'}
      </button>
      <button class="oracle-btn" data-act="ai-regenerate" ${ai.busy ? 'disabled' : ''}>
        ${icon('refresh', { size: 14 })} Regenerate
      </button>
      <button class="oracle-btn" data-act="ai-edit" ${ai.busy ? 'disabled' : ''}>
        ${icon('edit', { size: 14 })} Edit
      </button>
      ${result.kind === 'npc' ? `
        <button class="oracle-btn" data-act="ai-expand" ${ai.busy ? 'disabled' : ''}>
          ${icon('book', { size: 14 })} Expand backstory
        </button>
        <button class="oracle-btn" data-act="ai-dialogue" ${ai.busy ? 'disabled' : ''}>
          ${icon('chat', { size: 14 })} Generate dialogue
        </button>
        <button class="oracle-btn" data-act="ai-personality" ${ai.busy ? 'disabled' : ''}>
          ${icon('brain', { size: 14 })} Generate personality
        </button>` : ''}
      <button class="oracle-btn danger" data-act="ai-discard" ${ai.busy ? 'disabled' : ''}>
        ${icon('trash', { size: 14 })} Discard
      </button>
    </div>

    <div class="oracle-share-row">
      <label class="oracle-check">
        <input type="checkbox" data-change="ai-share" ${ai.share ? 'checked' : ''} ${ai.saved ? 'disabled' : ''} />
        <span>Share with players</span>
      </label>
      <span class="oracle-muted">${ai.share ? 'This will be visible in the party Codex.' : 'Saves as DM-only by default.'}</span>
    </div>
  </div>`;
}

function editField(label, path, value, opts = {}) {
  const val = value == null ? '' : value;
  if (opts.textarea) {
    return `<label class="oracle-edit-field wide"><span>${esc(label)}</span>
      <textarea data-edit="${esc(path)}" data-keep="ai-e-${esc(path.replace(/\\./g, '-'))}"
        rows="${opts.rows || 3}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}>${esc(Array.isArray(val) ? val.join('\n') : val)}</textarea>
      ${opts.hint ? `<em>${esc(opts.hint)}</em>` : ''}</label>`;
  }
  return `<label class="oracle-edit-field"><span>${esc(label)}</span>
    <input data-edit="${esc(path)}" data-keep="ai-e-${esc(path.replace(/\\./g, '-'))}"
      value="${esc(Array.isArray(val) ? val.join(', ') : val)}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''} /></label>`;
}

function editList(label, path, values, hint) {
  return editField(label, path, values || [], { textarea: true, rows: 3, hint });
}

function editView(record) {
  const result = record.result;
  const meta = kindMeta(result.kind);
  return `
  <div class="oracle-result oracle-editing" style="--oracle-kind:${meta.color}">
    <form data-act="ai-edit-save" class="oracle-edit-form">
      <div class="oracle-result-kicker">
        <span class="oracle-kind">${icon('edit', { size: 13 })} EDITING ${esc(meta.label.toUpperCase())}</span>
        <span class="oracle-draft">CHANGES STAY IN THIS DRAFT</span>
      </div>
      <header class="oracle-result-head">
        <div class="oracle-avatar">${icon('edit', { size: 24 })}</div>
        <div><h2>Edit this draft</h2><p>Every field is yours to change before it enters the campaign.</p></div>
      </header>

      <div class="oracle-edit-grid">
        ${editField('Name / title', 'title', result.title)}
        ${editField('Role / subtitle', 'subtitle', result.subtitle)}
        ${editField('One-line summary', 'summary', result.summary, { textarea: true, rows: 2 })}
        ${editField('Readable description', 'body', result.body, { textarea: true, rows: 4 })}
      </div>

      ${result.kind === 'npc' ? `<div class="oracle-edit-grid">
        ${editField('Occupation', 'npc.occupation', result.npc.occupation)}
        ${editField('Age', 'npc.age', result.npc.age)}
        ${editField('Gender', 'npc.gender', result.npc.gender)}
        ${editField('Usual location', 'npc.location', result.npc.location)}
        ${editField('Personality', 'npc.personality', result.npc.personality, { textarea: true })}
        ${editField('Appearance', 'npc.appearance', result.npc.appearance, { textarea: true })}
        ${editField('Backstory', 'npc.backstory', result.npc.backstory, { textarea: true, rows: 4 })}
        ${editField('Motivation', 'npc.motivation', result.npc.motivation, { textarea: true })}
        ${editField('Fear', 'npc.fear', result.npc.fear)}
        ${editField('Quirk', 'npc.quirk', result.npc.quirk)}
        ${editField('Secret', 'npc.secret', result.npc.secret, { textarea: true })}
        ${editList('Dialogue — one line each', 'npc.dialogue', result.npc.dialogue)}
      </div>` : ''}

      ${result.kind === 'location' ? `<div class="oracle-edit-grid">
        ${editField('Type', 'location.type', result.location.type)}
        ${editField('Address', 'location.address', result.location.address)}
        ${editField('Description', 'location.description', result.location.description, { textarea: true, rows: 4 })}
        ${editField('Secret', 'location.secret', result.location.secret, { textarea: true })}
      </div>` : ''}

      ${result.kind === 'item' ? `<div class="oracle-edit-grid">
        ${editField('Category', 'item.category', result.item.category)}
        ${editField('Value', 'item.value', result.item.value)}
        ${editField('Weight', 'item.weight', result.item.weight)}
        ${editField('Description', 'item.description', result.item.description, { textarea: true, rows: 4 })}
        ${editList('Properties — one each', 'item.properties', result.item.properties)}
        ${editField('Story hook', 'item.storyHook', result.item.storyHook, { textarea: true })}
      </div>` : ''}

      ${result.kind === 'quest' ? `<div class="oracle-edit-grid">
        ${editField('Hook', 'quest.hook', result.quest.hook, { textarea: true })}
        ${editField('Objective', 'quest.objective', result.quest.objective, { textarea: true })}
        ${editList('Complications — one each', 'quest.complications', result.quest.complications)}
        ${editField('Reward', 'quest.reward', result.quest.reward)}
      </div>` : ''}

      ${result.kind === 'event' ? `<div class="oracle-edit-grid">
        ${editField('When', 'event.when', result.event.when)}
        ${editField('What happened', 'event.whatHappened', result.event.whatHappened, { textarea: true, rows: 4 })}
        ${editList('Who is involved — one each', 'event.whoIsInvolved', result.event.whoIsInvolved)}
      </div>` : ''}

      ${result.kind === 'encounter' ? `<div class="oracle-edit-grid">
        ${editField('Setup', 'encounter.setup', result.encounter.setup, { textarea: true, rows: 4 })}
        ${editList('Creatures — one each', 'encounter.creatures', result.encounter.creatures)}
        ${editList('Complications — one each', 'encounter.complications', result.encounter.complications)}
        ${editField('Stakes', 'encounter.stakes', result.encounter.stakes)}
        ${editField('Twist', 'encounter.twist', result.encounter.twist)}
      </div>` : ''}

      ${result.kind === 'lore' ? `<div class="oracle-edit-grid">
        ${editField('Truth', 'lore.truth', result.lore.truth, { textarea: true, rows: 4 })}
        ${editField('Rumour', 'lore.rumor', result.lore.rumor, { textarea: true })}
        ${editField('Hook', 'lore.hook', result.lore.hook, { textarea: true })}
      </div>` : ''}

      ${result.kind === 'shop' ? `<div class="oracle-edit-grid">
        ${editField('Owner', 'shop.owner', result.shop.owner)}
        ${editField('Type', 'shop.type', result.shop.type)}
        ${editField('Description', 'shop.description', result.shop.description, { textarea: true, rows: 4 })}
        ${editList('Wares — one each', 'shop.wares', result.shop.wares)}
      </div>` : ''}

      ${result.fields?.length ? `<div class="oracle-edit-grid">
        ${result.fields.map((f, i) => `
          ${editField(`Extra detail ${i + 1} label`, `fields.${i}.label`, f.label)}
          ${editField('Value', `fields.${i}.value`, f.value)}
        `).join('')}
      </div>` : ''}

      <div class="oracle-actions">
        <button class="oracle-btn primary" type="submit">${icon('check', { size: 14 })} Apply changes</button>
        <button class="oracle-btn" type="button" data-act="ai-edit-cancel">Cancel</button>
      </div>
    </form>
  </div>`;
}

function welcomeView() {
  return `
  <div class="oracle-welcome">
    <div class="oracle-orb">${icon('sparkles', { size: 34 })}</div>
    <div class="eyebrow">THE ORACLE IS LISTENING</div>
    <h2>What would you like to generate?</h2>
    <p>Ask casually. The Oracle knows this campaign’s people, places and tone,
      and it will keep new inventions clearly separate from established facts.</p>
    <div class="oracle-welcome-hints">
      <span>${icon('users', { size: 12 })} “Generate a Bill Gray’s employee.”</span>
      <span>${icon('pin', { size: 12 })} “A suspicious house on Lake Road.”</span>
      <span>${icon('gem', { size: 12 })} “An item touched by the crystal.”</span>
    </div>
  </div>`;
}

function geoSetupView() {
  return `
  <div class="oracle-setup">
    <div class="oracle-orb muted">${icon('brain', { size: 34 })}</div>
    <div class="eyebrow">MODEL NOT CONNECTED</div>
    <h2>The Oracle needs a voice.</h2>
    <p>The AI Tools screen is built and DM-gated, but no model key is installed on
      this server yet. Add the key to <code>.env</code> (or your host’s secret
      manager), then restart the app.</p>
    <div class="oracle-setup-code">
      <span>NVIDIA_API_KEY</span>
      <code>your-key-here</code>
    </div>
    <div class="oracle-setup-code">
      <span>NVIDIA_API_BASE <em>optional</em></span>
      <code>https://integrate.api.nvidia.com/v1</code>
    </div>
    <div class="oracle-setup-code">
      <span>NVIDIA_MODEL <em>optional</em></span>
      <code>minimaxai/minimax-m3.1-flash</code>
    </div>
    <p class="oracle-muted">The key stays on the server. It is never sent to the
      browser, and no generated content is simulated while the key is missing.</p>
    <button class="oracle-btn" data-act="ai-reload">${icon('refresh', { size: 13 })} Recheck connection</button>
  </div>`;
}

function loadingView() {
  return `
  <div class="oracle-loading">
    <div class="oracle-orb pulse">${icon('sparkles', { size: 32 })}</div>
    <div class="eyebrow">READING THE CAMPAIGN</div>
    <h2>Opening the Oracle…</h2>
    <div class="oracle-skeleton"><i></i><i></i><i></i></div>
  </div>`;
}

function historyView() {
  const ai = ensureState();
  return `
  <aside class="oracle-history">
    <div class="oracle-panel-head">
      <span>THE THREAD</span>
      <b>${String(ai.history.length).padStart(2, '0')}</b>
    </div>
    <div class="oracle-history-list">
      ${ai.history.length ? ai.history.map((record) => {
        const meta = kindMeta(resultKind(record));
        return `<button class="oracle-history-item ${ai.current?.id === record.id ? 'on' : ''}" data-act="ai-history" data-id="${record.id}">
          <span class="oh-icon" style="--oracle-kind:${meta.color}">${icon(meta.icon, { size: 12 })}</span>
          <span class="oh-copy"><b>${esc(record.result?.title || record.prompt)}</b><em>${esc(record.prompt || meta.label)}</em></span>
          <span class="oh-time">${ago(record.createdAt)}</span>
        </button>`;
      }).join('') : `<div class="oracle-history-empty">${icon('chat', { size: 18 })}<p>No generations yet.</p><span>Your first request starts the thread.</span></div>`}
    </div>
    <div class="oracle-history-foot">
      <button data-act="ai-new">${icon('plus', { size: 12 })} New thread</button>
      <button data-act="ai-reload" title="Refresh history">${icon('refresh', { size: 12 })}</button>
    </div>
  </aside>`;
}

function quickView() {
  const ai = ensureState();
  return `
  <aside class="oracle-quick">
    <div class="oracle-panel-head"><span>QUICK GENERATION</span></div>
    <div class="oracle-quick-grid">
      ${QUICK_ACTIONS.map((action) => `
        <button class="oracle-quick-btn" data-act="ai-quick" data-kind="${action.kind}" data-prompt="${esc(action.prompt)}">
          <span>${icon(action.icon, { size: 14 })}</span>
          <b>${esc(action.label)}</b>
        </button>`).join('')}
    </div>
    <div class="oracle-panel-head" style="margin-top:18px"><span>TRY ASKING</span></div>
    <div class="oracle-suggestions">
      ${SUGGESTED.map((prompt) => `<button data-act="ai-suggest" data-prompt="${esc(prompt)}">“${esc(prompt)}”</button>`).join('')}
    </div>
    <div class="oracle-privacy">
      ${icon('shield', { size: 13 })}
      <p><b>DM eyes only.</b> Drafts and history live in this campaign, but players never receive them. Saved content is DM-only unless you tick “Share with players.”</p>
    </div>
    <div class="oracle-model">
      <span class="oracle-model-dot ${ai.status?.configured ? 'on' : ''}"></span>
      <span>${ai.status?.configured ? esc(ai.status.model || 'Model ready') : 'Model key needed'}</span>
      ${ai.status?.provider ? `<em>${esc(ai.status.provider)}</em>` : ''}
    </div>
  </aside>`;
}

function workspaceView() {
  const ai = ensureState();
  if (ai.loading && !ai.loaded) return loadingView();
  if (ai.setup || (ai.loaded && ai.status && !ai.status.configured)) {
    return geoSetupView();
  }
  if (ai.error && !ai.current) {
    return `<div class="oracle-error"><div>${icon('eyeOff', { size: 20 })}</div>
      <h2>The Oracle went quiet.</h2><p>${esc(ai.error)}</p>
      <button class="oracle-btn" data-act="ai-retry">${icon('refresh', { size: 13 })} Try again</button></div>`;
  }
  if (ai.current) {
    return ai.editing ? editView(ai.current) : resultView(ai.current);
  }
  return welcomeView();
}

export function aiToolsView() {
  if (!isDM()) {
    return `<div class="oracle-denied"><div class="oracle-orb muted">${icon('eyeOff', { size: 30 })}</div>
      <div class="eyebrow">DM ONLY</div><h2>The Oracle is sealed to players.</h2>
      <p>This desk contains campaign secrets and unpublished prep. Ask your Dungeon Master to use it.</p>
      <button class="btn" data-act="game-nav" data-page="world">Back to the world</button></div>`;
  }
  const ai = ensureState();
  return `
  <div class="oracle-screen" style="--oracle-bg:url('${BACKGROUNDS.spells}')">
    <div class="oracle-bg" style="background-image:url('${BACKGROUNDS.spells}')"></div>
    <div class="oracle-veil"></div>
    <div class="oracle-glow"></div>

    <header class="oracle-head">
      <div class="oracle-head-mark">${icon('sparkles', { size: 25 })}</div>
      <div class="oracle-head-copy">
        <div class="eyebrow">DM IMPROVISATION DESK / CAMPAIGN-AWARE</div>
        <h1>AI <em>TOOLS</em></h1>
        <p>Ask for a person, place, item, encounter or secret. You get a playable draft — never an automatic canon entry.</p>
      </div>
      <div class="oracle-head-status">
        <span class="oracle-live ${ai.status?.configured ? 'on' : ''}"></span>
        <span>${ai.status?.configured ? 'ORACLE ONLINE' : 'KEY NEEDED'}</span>
        <button class="oracle-icon-btn" data-act="ai-new" title="Start a new thread">${icon('plus', { size: 16 })}</button>
      </div>
    </header>

    <div class="oracle-layout">
      ${historyView()}
      <main class="oracle-main">
        <div class="oracle-scroll">
          ${workspaceView()}
          ${ai.error && ai.current ? `<div class="oracle-inline-error">${icon('eyeOff', { size: 13 })} ${esc(ai.error)}</div>` : ''}
        </div>
        <form class="oracle-composer" data-act="ai-generate">
          <div class="oracle-composer-inner">
            <span class="oracle-composer-icon">${icon('sparkles', { size: 18 })}</span>
            <textarea name="ai-prompt" data-live="ai-prompt" data-keep="ai-prompt" rows="2"
              placeholder="${ai.current ? 'Refine this draft, or ask for something else…' : 'What would you like to generate?'}"
              ${ai.busy || ai.setup || (ai.status && !ai.status.configured) ? 'disabled' : ''}>${esc(ai.prompt || '')}</textarea>
            <button class="oracle-generate" type="submit" ${ai.busy || ai.setup || (ai.status && !ai.status.configured) ? 'disabled' : ''}>
              ${ai.busy ? '<span class="oracle-spinner"></span> Weaving…' : `${icon('send', { size: 15 })} Generate`}
            </button>
          </div>
          <div class="oracle-composer-foot">
            <span>${icon('shield', { size: 11 })} SECURE SERVER-SIDE MODEL · DM ONLY</span>
            <span>${ai.current ? `Refining ${esc(ai.current.result?.title || 'the current draft')} · ask for a change or say “make a different one”` : 'Type naturally; no forms, no prompt syntax.'}</span>
          </div>
        </form>
      </main>
      ${quickView()}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- actions

function setPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (cursor[key] == null) cursor[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cursor = cursor[key];
  }
  const last = parts[parts.length - 1];
  cursor[/^\d+$/.test(last) ? Number(last) : last] = value;
}

const LIST_PATHS = new Set([
  'npc.dialogue', 'item.properties', 'quest.complications',
  'event.whoIsInvolved', 'encounter.creatures', 'encounter.complications', 'shop.wares',
]);

function readEdited(form) {
  const ai = ensureState();
  const result = JSON.parse(JSON.stringify(ai.current.result));
  for (const el of form.querySelectorAll('[data-edit]')) {
    const path = el.dataset.edit;
    const raw = el.value;
    const value = el.dataset.list === '1' || LIST_PATHS.has(path)
      ? raw.split('\n').map((line) => line.trim()).filter(Boolean)
      : raw.trim();
    setPath(result, path, value);
  }
  if (result.kind === 'npc') {
    result.npc = result.npc || {};
    result.npc.name = result.title;
    result.npc.dialogue = result.npc.dialogue || [];
    result.npc.dialogue = result.npc.dialogue.filter(Boolean);
  }
  result.duplicateOf = '';
  return result;
}

on('ai-prompt', (el) => {
  ensureState().prompt = el.value;
});

on('ai-suggest', (el) => {
  setPrompt(el.dataset.prompt || '');
});

on('ai-quick', (el) => {
  setPrompt(el.dataset.prompt || '');
  requestGeneration({ prompt: el.dataset.prompt || '', kind: el.dataset.kind || 'auto' });
});

on('ai-generate', (form) => {
  const field = form.querySelector('[name="ai-prompt"]');
  const prompt = field?.value?.trim() || ensureState().prompt.trim();
  requestGeneration({ prompt, kind: 'auto' });
});

on('ai-regenerate', () => {
  const ai = ensureState();
  const title = ai.current?.result?.title;
  const prompt = ai.current?.prompt || `Make a completely different ${title ? `${title} alternative` : 'version'}.`;
  requestGeneration({ prompt: `${prompt}\n\nMake this a completely different result with a new name and details.`, kind: ai.current?.kind || 'auto', action: 'regenerate' });
});

on('ai-expand', () => {
  const ai = ensureState();
  requestGeneration({ prompt: `Expand the backstory of ${ai.current?.result?.title || 'this NPC'}. Keep every other detail intact.`, kind: 'npc', action: 'expand-backstory' });
});

on('ai-dialogue', () => {
  const ai = ensureState();
  requestGeneration({ prompt: `Generate dialogue and things ${ai.current?.result?.title || 'this NPC'} might say. Keep every other detail intact.`, kind: 'npc', action: 'dialogue' });
});

on('ai-personality', () => {
  const ai = ensureState();
  requestGeneration({ prompt: `Deepen the personality, mannerisms, motivation, fear, quirk and secret of ${ai.current?.result?.title || 'this NPC'}. Keep every other detail intact.`, kind: 'npc', action: 'personality' });
});

on('ai-edit', () => {
  const ai = ensureState();
  if (!ai.current) return;
  ai.editing = true;
  ai.saved = null;
  render();
});

on('ai-edit-cancel', () => {
  const ai = ensureState();
  ai.editing = false;
  render();
});

on('ai-edit-save', (form) => {
  const ai = ensureState();
  if (!ai.current) return;
  ai.current = { ...ai.current, result: readEdited(form) };
  ai.editing = false;
  ai.saved = null;
  render();
  toast('Draft updated. Nothing saved yet.', 'ok');
});

on('ai-location', (el) => {
  const ai = ensureState();
  if (!ai.current) return;
  const location = (state.entries || []).find((e) => e.id === el.value);
  const result = ai.current.result;
  result.npc = result.npc || {};
  result.npc.location = location?.title || '';
  ai.locationId = location?.id || '';
  ai.saved = null;
  render();
  if (location) toast(`Assigned to ${location.title}.`, 'ok');
});

on('ai-share', (el) => {
  ensureState().share = !!el.checked;
});

on('ai-save', () => {
  saveCurrent();
});

on('ai-discard', () => {
  const ai = ensureState();
  if (ai.busy) return;
  ai.current = null;
  ai.editing = false;
  ai.saved = null;
  ai.error = '';
  ai.locationId = '';
  ai.share = false;
  render();
});

on('ai-history', (el) => {
  const ai = ensureState();
  const record = (ai.history || []).find((g) => g.id === el.dataset.id);
  if (!record) return;
  ai.current = record;
  ai.editing = false;
  ai.saved = null;
  ai.error = '';
  ai.locationId = '';
  ai.share = false;
  setPrompt(record.prompt || '');
});

on('ai-new', () => {
  const ai = ensureState();
  ai.current = null;
  ai.editing = false;
  ai.saved = null;
  ai.error = '';
  ai.setup = false;
  ai.share = false;
  ai.locationId = '';
  setPrompt('');
});

on('ai-reload', () => loadAITools(true));

on('ai-retry', () => {
  const ai = ensureState();
  ai.error = '';
  render();
  loadAITools(true);
});

on('ai-open-saved', () => {
  const ai = ensureState();
  if (!ai.saved) return;
  if (ai.saved.kind === 'journal') {
    state.page = 'codex';
    state.codexKind = 'journal';
    state.codexSelected = null;
  } else {
    state.page = 'codex';
    state.codexKind = ai.saved.kind;
    state.codexSelected = ai.saved.id || null;
  }
  render();
});
