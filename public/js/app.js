import { state, api, bindEvents, setRenderer, render, loadMe, initSocket, joinSocket, fail } from './core.js';
import { gateView, lobbyView, shellView, autoOpen, tickTurnTimer } from './views.js';

const root = document.getElementById('root');

setRenderer(() => {
  if (!state.booted) { root.innerHTML = '<div class="gate"></div>'; return; }
  if (!state.user) { root.innerHTML = gateView(); return; }
  if (!state.campaign) { root.innerHTML = lobbyView(); return; }
  root.innerHTML = shellView();

  // Chat panes should sit at the newest message.
  const log = document.getElementById('chatlog');
  if (log) log.scrollTop = log.scrollHeight;

  // After the popup's first paint, mark it settled so later renders don't replay
  // the entrance animation.
  if (state.turnAlert) state.turnAlertShown = true;
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
