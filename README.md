# D&D DS — Dungeons & Dragons Dripper Studios

A live campaign companion for D&D 5th Edition. One DM, any number of players,
everyone on their own phone, everything synced instantly.

## What's in it

- **Accounts** — email + password, no verification step
- **Campaigns & invites** — the DM invites players by email; the invite is waiting
  when they sign in with that address
- **Illustrated character creator** — a full-screen class, species and background
  selection with large fantasy sourcebook plates, a class/species portrait picker
  and custom portrait uploads. The fantasy art is separate from the modern Webster
  campaign photography; art details are in `public/assets/art/rpg/CREDITS.md`
- **Character sheets** — abilities, HP, AC, skills, conditions, spell slots, coins,
  and a **portrait** you upload from your phone (resized in the browser, so a 4 MB
  photo becomes ~40 KB before it is stored)
- **Campaign Codex** — quests, NPCs, locations, shops, items and a session timeline,
  each with its own picture. Anything the DM marks DM-only never reaches players
- **AI Tools (DM only)** — a campaign-aware Oracle for improvising NPCs, local
  employees, locations, items, encounters and secrets during play. It reads the
  campaign’s existing people, places and notes, keeps invented facts separate from
  canon, and presents every result as a draft. Nothing enters the campaign until
  the DM saves it, and saves are DM-only unless explicitly shared. Results are
  editable before saving, can be refined or expanded, and keep a generation history
- **Shops you can actually buy from** — players spend their own gold, the coins come
  off their sheet and the item lands in their inventory, stacking if they already
  had one. Prices understand `50 gp`, `2 sp`, `10 cp`
- **Loot tables** — every enemy can carry drops with a percentage each, so a goblin
  always leaves its scimitar but only sometimes the good stuff. Coins roll on a
  formula (`2d6 gp`). The DM loots a downed enemy straight into a character's bag
- **The DM assigns characters to players** by picking their email, and that player
  then owns the sheet — stats, spells, inventory and all
- **Inventory** — per character, with weight and quantities
- **Dice roller** — full notation (`2d6+3`, `4d6kh3`), advantage/disadvantage,
  and a shared roll log the whole party sees
- **Combat tracker** — initiative order, HP, conditions, turn/round advancement
  - Everyone rolls their **own** initiative; the DM can roll for the stragglers
  - The order sorts itself highest-first and cycles automatically, ticking the
    round over when it wraps
  - When your turn comes up you get a full-screen **"PARKER, IT'S YOUR TURN!"**
    takeover with a chime and a buzz on phones. Everyone else sees
    "Waiting for Parker…", and the DM gets a turn timer and a Skip button
  - **Action cards** rather than bare dice: Quick Attack, Power Attack, Defensive
    Stance, Aim, Help Ally, Dodge, Interact and Use Environment — each with real
    mechanical effects the server applies
  - **Spells that actually cast.** Guiding Bolt rolls a spell attack and leaves the
    target easier to hit; Cure Wounds heals; Hunter's Mark adds 1d6 to every hit
    from whoever cast it. Slots are spent, higher slots scale the dice
  - **Conditions with timers.** The DM taps a condition, sets how many turns, and it
    counts down on its own and clears itself
  - **Animations**: sword slash for melee, purple blast for magic, green glow for
    healing, gold explosion on a natural 20, dark smoke on a natural 1, red screen
    shake on a big hit, and a spell card that flies in when a spell is named
  - **Attacks actually resolve**: d20 + to-hit against the target's AC, then damage
    dice, applied to their HP and written to the combat log. Rolled on the server so
    nobody can fudge it and everyone sees the same numbers
  - Natural 20 crits (doubles the dice, not the modifier), natural 1 always misses
  - Damage to a player character updates their character sheet too
- **Enemy library** — 18 ready-made 5e monsters with real stat blocks and attacks,
  plus any custom enemies the DM saves. Drop them into a fight in two clicks,
  several at a time
- **Spells** — 5e reference for the common low-level spells, per-character known list
- **Item Library** — a Chronica-style master library of items for the campaign.
  Build each item once (name, value, weight, description, tags like Consumable or
  Quest, an optional picture, and a heal effect), then drop copies into any
  character's bag or a shop's stock. Library items also show up in the inventory
  "add from list" picker, and Chronica's `master_item_library` imports straight
  into it.
- **World Atlas and infinite hex world** — the World page opens on a real
  pan/zoom OpenStreetMap atlas. Zoom toward a place and it hands off to a
  global 160 m hex lattice; the authored Webster/Ontario seed becomes editable
  campaign data while everything outside it is generated as a frontier. Zoom
  back out from the hex view to return to the atlas at the same coordinate.
  The atlas is not a fixed rectangular campaign map: panning recenters a new
  chunk of global hexes, and saved edits keep their world coordinates.
- **Notes** — shared with the party, or DM-only
- **Party chat**
- **Import & backup** (Settings, DM only) — pull a whole campaign in from Chronica
  or any other tool: characters, NPCs, quests, locations, shops, timeline and notes.
  The importer reads all the common field names, so a messy export still maps
  cleanly, and it previews the tally before writing anything. "Back up this
  campaign" downloads everything as JSON, which re-imports as a perfect restore.

Everything is pushed over websockets, so a change on one phone shows on all of
them within a fraction of a second.

## Run it on your own machine

```bash
npm install
npm start
```

Open http://localhost:3000. With no database configured it uses a local SQLite
file (`dndds.db`) — nothing else to set up.

## Put it online for free

Two free accounts, no card needed, about ten minutes.

### 1. Database — Neon (free forever)

1. Sign up at https://neon.tech and create a project.
2. Copy the connection string (starts with `postgresql://`).

### 2. Web app — Render (free tier)

1. Push this folder to a GitHub repo.
2. At https://render.com → **New → Web Service** → connect that repo.
3. Render reads `render.yaml`, so the settings fill themselves in. The only thing
   you add by hand is the environment variable **`DATABASE_URL`** — paste the Neon
   string from step 1.
4. Deploy. You get a public URL like `https://dnd-ds.onrender.com` that works from
   any phone, anywhere.

**One catch with the free tier:** the server sleeps after 15 minutes with nobody
on it, and the first person to open it waits ~40 seconds while it wakes up. After
that it's instant for everyone. Render's $7/month Starter plan removes the sleep
if it bugs you on game night.

## Environment variables

| Variable       | Needed?          | What it does                                            |
| -------------- | ---------------- | ------------------------------------------------------- |
| `DATABASE_URL` | production       | Postgres connection string. Omit it to use local SQLite. |
| `JWT_SECRET`   | production       | Signs login sessions. Render generates one for you.      |
| `PORT`         | no               | Defaults to 3000.                                        |
| `NODE_ENV`     | production       | Set to `production` when deployed.                       |
| `ATLAS_TILE_URL` | no             | Raster tile template for the World Atlas, using `{z}`, `{x}`, `{y}`. Defaults to OpenStreetMap. |
| `ATLAS_USER_AGENT` | no            | Descriptive User-Agent for the atlas tile proxy. Keep it set when deploying. |
| `NVIDIA_API_KEY` | for AI Tools | Server-side NVIDIA NIM key used by the DM-only Oracle. Never expose this in the browser. |
| `NVIDIA_API_BASE` | no | OpenAI-compatible API base. Defaults to `https://integrate.api.nvidia.com/v1`. |
| `NVIDIA_MODEL` | no | Model name. Defaults to `minimaxai/minimax-m3.1-flash`. |

Atlas map data is © OpenStreetMap contributors and is available under the
Open Database License (ODbL). The app proxies tiles through `/api/atlas/tile/*`
and includes the required attribution in the map UI. The Webster/Ontario seed
is derived from OSM and documented in `public/assets/earth/CREDITS.md`.

## Layout

```
server/
  index.js   REST API, auth, websocket broadcasting
  db.js      Postgres or SQLite, same interface either way
  dice.js    Dice notation parser
  srd.js     5e spells and conditions
public/
  index.html
  css/styles.css
  js/core.js   state, API client, socket, render loop
  js/views.js  every page and modal
  js/icons.js  the inline SVG icon set (no CDN, works offline)
  js/earth.js  NASA Blue Marble globe and globe-to-world transition
  js/atlas.js  world slippy map and street-level handoff
  js/world.js  infinite hex camera, world generation and DM editor
  js/app.js    boot
  tiles.js     same-origin cached atlas tile proxy
  region.js    Webster/Ontario seed and global hex projection
```

## Character artwork

The character creator uses an original generated fantasy plate set stored in
`public/assets/art/rpg/`: 13 class illustrations, 14 species portraits and 10
background scenes. The images are bundled locally—the running app does not call
the image service. Exact prompts, seeds, generation notes and licensing caveats
are in `public/assets/art/rpg/CREDITS.md` and `rpg/generation.json`.

The modern-Webster world, party and codex screens continue to use the separately
credited local photography. The fantasy creator does not borrow photographs or
official D&D artwork for its class, species or background plates.
