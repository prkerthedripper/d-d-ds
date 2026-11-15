import { state, api, bindEvents, setRenderer, render, loadMe, initSocket, joinSocket, fail } from './core.js';
import { gateView, lobbyView, autoOpen, tickTurnTimer } from './views.js';
import { gameShell } from './gameui.js';
import { mountWorld } from './world.js';

const root = document.getElementById('root');
let lastPage = null;

/** Lift the boot veil once there is something real behind it. */
function liftBoot() {
  const boot = document.getElementById('boot');
  if (!boot || boot.classList.contains('boot-out')) return;
  boot.classList.add('boot-out');
  setTimeout(() => boot.remove(), 700);
}

setRenderer(() => {
  if (!state.booted) { root.innerHTML = '<div class="gate"></div>'; return; }
  if (!state.user) { root.innerHTML = gateView(); liftBoot(); return; }
  if (!state.campaign) { root.innerHTML = lobbyView(); liftBoot(); return; }
  root.innerHTML = gameShell();
  mountWorld();

  // A page change is the only time sections animate in. The app re-renders on
  // every socket patch, so animating unconditionally made the whole screen
  // pulse each time anyone rolled a die.
  if (state.page !== lastPage) {
    document.querySelectorAll('.content > *').forEach((el) => el.classList.add('page-enter'));
    lastPage = state.page;
  }

  // Chat panes should sit at the newest message.
  const log = document.getElementById('chatlog');
  if (log) log.scrollTop = log.scrollHeight;

  // After the popup's first paint, mark it settled so later renders don't replay
  // the entrance animation.
  if (state.turnAlert) state.turnAlertShown = true;

  liftBoot();
});

bindEvents(root, render);

(async function boot() {
  try {
    const srd = await api('GET', '/api/srd');
    state.srd = srd;
    await loadMe();
    if (state.user) {
      initSocket();
      await autoOpen();
    }
  } catch (err) {
    fail(err);
  } finally {
    state.booted = true;
    render();
  }
})();

// Drive the DM's turn timer by patching that one element, never by re-rendering:
// a full re-render restarts every CSS entrance animation and made the turn popup
// flicker in and out once a second.
setInterval(() => {
  if (!state.campaign || document.hidden) return;
  tickTurnTimer();
}, 1000);

// Re-sync after the phone wakes up or the tab regains focus.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.campaign) joinSocket(state.campaign.id);
});
