import { state, api, bindEvents, setRenderer, render, loadMe, initSocket, joinSocket, fail } from './core.js';
import { gateView, lobbyView, shellView, autoOpen } from './views.js';

const root = document.getElementById('root');

setRenderer(() => {
  if (!state.booted) { root.innerHTML = '<div class="gate"></div>'; return; }
  if (!state.user) { root.innerHTML = gateView(); return; }
  if (!state.campaign) { root.innerHTML = lobbyView(); return; }
  root.innerHTML = shellView();

  // Chat panes should sit at the newest message.
  const log = document.getElementById('chatlog');
  if (log) log.scrollTop = log.scrollHeight;
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

// Re-sync after the phone wakes up or the tab regains focus.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.campaign) joinSocket(state.campaign.id);
});
