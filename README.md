# D&D DS — Dungeons & Dragons Dripper Studios

A live campaign companion for D&D 5th Edition. One DM, any number of players,
everyone on their own phone, everything synced instantly.

## What's in it

- **Accounts** — email + password, no verification step
- **Campaigns & invites** — the DM invites players by email; the invite is waiting
  when they sign in with that address
- **Character sheets** — abilities, HP, AC, skills, conditions, spell slots, coins,
  and a **portrait** you upload from your phone (resized in the browser, so a 4 MB
  photo becomes ~40 KB before it is stored)
- **Campaign Codex** — quests, NPCs, locations, shops and a session timeline, each
  with its own picture. Anything the DM marks DM-only never reaches players
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
  - When your turn comes up you get a full-screen **"IT'S YOUR TURN TO ATTACK"**
    takeover with a chime, a buzz on phones, your attacks and every target one tap
    away — so nobody misses their turn
  - **Attacks actually resolve**: d20 + to-hit against the target's AC, then damage
    dice, applied to their HP and written to the combat log. Rolled on the server so
    nobody can fudge it and everyone sees the same numbers
  - Natural 20 crits (doubles the dice, not the modifier), natural 1 always misses
  - Damage to a player character updates their character sheet too
- **Enemy library** — 18 ready-made 5e monsters with real stat blocks and attacks,
  plus any custom enemies the DM saves. Drop them into a fight in two clicks,
  several at a time
- **Spells** — 5e reference for the common low-level spells, per-character known list
- **Notes** — shared with the party, or DM-only
- **Party chat**

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
  js/app.js    boot
```
