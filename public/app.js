const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { user: null, links: [], theme: 'meadow', profileTheme: 'meadow', authMode: 'login', result: null, editing: null };
let toastTimeout;
let sceneIndex = 0, themeRequest = 0;
const themes = ['meadow', 'dusk', 'ocean', 'forest', 'ember'];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }
  catch { throw new Error('Couldn’t connect. Check your connection and try again.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = response.status;
    throw err;
  }
  return data;
}
const send = (path, method, body) => api(path, { method, body: JSON.stringify(body) });
function showError(selector, message) { const element = $(selector); element.textContent = message || ''; element.hidden = !message; }
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 2800); }
async function copy(value) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
    else {
      const input = document.createElement('textarea'); input.value = value; input.className = 'sr-only'; document.body.append(input); input.select();
      if (!document.execCommand('copy')) throw new Error('Copy failed'); input.remove();
    }
    toast('Copied. A little link, ready to share.');
  } catch { toast('Couldn’t copy. Select the link to copy it.'); }
}
function setTheme(theme, remember = false) {
  if (!themes.includes(theme)) theme = 'meadow';
  const previous = state.theme;
  state.theme = theme; document.body.dataset.theme = theme;
  $$('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
  if (remember) storageSet('littlelink_theme', theme);
  const request = ++themeRequest;
  const scenes = $$('.landscape');
  const preload = new Image();
  preload.onload = () => {
    if (request !== themeRequest) return;
    const current = scenes[sceneIndex];
    if (current.dataset.scene === theme) return;
    const next = scenes[1 - sceneIndex];
    next.dataset.scene = theme;
    requestAnimationFrame(() => requestAnimationFrame(() => { next.classList.add('is-visible'); current.classList.remove('is-visible'); sceneIndex = 1 - sceneIndex; }));
  };
  preload.src = `/assets/${theme}${document.body.classList.contains('motion-paused') ? '-still' : ''}.gif`;
  if (previous !== theme && !reducedMotion()) {
    $('.heading-word').animate([{ opacity: .45, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
}
function setMotion(paused, remember = false) {
  document.body.classList.toggle('motion-paused', paused);
  $('#motion-toggle').setAttribute('aria-pressed', String(paused));
  $('#motion-toggle').setAttribute('aria-label', paused ? 'Play background animation' : 'Pause background animation');
  $('#motion-toggle').replaceChildren();
  const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = paused ? '▷' : 'Ⅱ';
  $('#motion-toggle').append(icon);
  $('#motion-toggle').title = paused ? 'Play background animation' : 'Pause background animation';
  if (remember) storageSet('littlelink_paused', String(paused));
}
$$('[data-theme-choice]').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.themeChoice, true)));
$('#motion-toggle').addEventListener('click', () => setMotion(!document.body.classList.contains('motion-paused'), true));
setTheme(storageGet('littlelink_theme') || 'meadow');
// A new motion setting clears the pause saved by the earlier preview.
setMotion(storageGet('littlelink_motion_v2') === 'paused');
$('#motion-toggle').addEventListener('click', () => storageSet('littlelink_motion_v2', document.body.classList.contains('motion-paused') ? 'paused' : 'playing'));

// Spring-following magnetic controls, with fixed hit areas and no layout shift.
const magneticStates = new Map();
let magneticFrame = 0;
function springButtons() {
  magneticFrame = 0;
  let moving = false;
  for (const [button, spring] of magneticStates) {
    if (!button.isConnected) { magneticStates.delete(button); continue; }
    spring.vx = (spring.vx + (spring.tx - spring.x) * .16) * .72;
    spring.vy = (spring.vy + (spring.ty - spring.y) * .16) * .72;
    spring.x += spring.vx; spring.y += spring.vy;
    button.style.translate = `${spring.x.toFixed(2)}px ${spring.y.toFixed(2)}px`;
    if (Math.abs(spring.tx - spring.x) + Math.abs(spring.ty - spring.y) + Math.abs(spring.vx) + Math.abs(spring.vy) > .06) moving = true;
    else if (!spring.tx && !spring.ty) { button.style.translate = ''; magneticStates.delete(button); }
  }
  if (moving) magneticFrame = requestAnimationFrame(springButtons);
}
function moveMagnet(button, tx, ty) {
  if (!magneticStates.has(button)) magneticStates.set(button, { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 });
  const spring = magneticStates.get(button); spring.tx = tx; spring.ty = ty;
  if (!magneticFrame) magneticFrame = requestAnimationFrame(springButtons);
}
let activeMagnet;
document.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || !matchMedia('(hover: hover)').matches || reducedMotion()) return;
  const button = event.target.closest('button:not(:disabled), a.account-icon, a.button');
  if (activeMagnet && activeMagnet !== button) moveMagnet(activeMagnet, 0, 0);
  activeMagnet = button;
  if (!button) return;
  const bounds = button.getBoundingClientRect(); const spring = magneticStates.get(button);
  const dx = event.clientX - (bounds.left + bounds.width / 2 - (spring?.x || 0));
  const dy = event.clientY - (bounds.top + bounds.height / 2 - (spring?.y || 0));
  moveMagnet(button, Math.max(-9, Math.min(9, dx * .23)), Math.max(-8, Math.min(8, dy * .23)));
});
document.addEventListener('pointerout', event => {
  if (activeMagnet && !activeMagnet.contains(event.relatedTarget)) { moveMagnet(activeMagnet, 0, 0); activeMagnet = null; }
});
window.addEventListener('blur', () => { for (const button of magneticStates.keys()) moveMagnet(button, 0, 0); });

function renderNavigation() {
  const nav = $('#navigation'); nav.replaceChildren();
  if (state.user) {
    const logout = document.createElement('button'); logout.className = 'account-icon logout-icon'; logout.textContent = '↪'; logout.setAttribute('aria-label', 'Log out'); logout.title = 'Log out';
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try { await send('/api/auth/logout', 'POST', {}); state.user = null; state.links = []; location.href = '/'; }
      catch (err) { toast(err.message); logout.disabled = false; }
    });
    const dashboard = document.createElement('a'); dashboard.href = '/dashboard'; dashboard.className = 'account-icon'; dashboard.textContent = state.user.name[0].toUpperCase(); dashboard.setAttribute('aria-label', 'Your profile and saved links'); dashboard.title = 'Your profile and saved links';
    nav.append(logout, dashboard);
  } else {
    const login = document.createElement('button'); login.className = 'account-icon'; login.setAttribute('aria-label', 'Log in or create an account'); login.title = 'Your account';
    login.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/></svg>';
    login.addEventListener('click', () => openAuth('login')); nav.append(login);
  }
}

function openAuth(mode) {
  state.authMode = mode; const register = mode === 'register';
  $('#auth-heading').innerHTML = register ? 'Your little <em>space.</em>' : 'Welcome <em>back.</em>';
  $('#auth-description').textContent = register ? 'Save your links. Share your corner of the internet.' : 'Your little corner is waiting for you.';
  $('#register-fields').hidden = !register; $('#auth-username').required = register; $('#auth-username').disabled = !register;
  $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = register ? 'Create your space ↗' : 'Log in ↗';
  $('#auth-switch-label').textContent = register ? 'Already have a little space?' : 'New around here?';
  $('#auth-switch').textContent = register ? 'Log in' : 'Create your little space'; showError('#auth-error', '');
  if (!$('#auth-dialog').open) $('#auth-dialog').showModal();
  (register ? $('#auth-username') : $('#auth-email')).focus();
}
$$('[data-auth]').forEach(button => button.addEventListener('click', () => openAuth(button.dataset.auth)));
$('#auth-switch').addEventListener('click', () => openAuth(state.authMode === 'register' ? 'login' : 'register'));
function closeDialog(dialog) {
  if (!dialog.open || dialog.classList.contains('is-closing')) return;
  if (reducedMotion()) { dialog.close(); return; }
  dialog.classList.add('is-closing');
  setTimeout(() => { dialog.close(); dialog.classList.remove('is-closing'); }, 180);
}
$$('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog($(`#${button.dataset.close}`))));
$$('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog); } });
});
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault(); showError('#auth-error', ''); const button = $('#auth-submit'); button.disabled = true;
  try {
    const data = await send(`/api/auth/${state.authMode}`, 'POST', { email: $('#auth-email').value, password: $('#auth-password').value, username: $('#auth-username').value });
    state.user = data.user; $('#auth-password').value = '';
    if (state.result) await send('/api/links', 'POST', { longUrl: state.result.longUrl }).catch(() => toast('Log in succeeded. Add your last link from your space.'));
    $('#auth-dialog').close(); location.href = '/dashboard';
  } catch (err) { showError('#auth-error', err.message); }
  finally { button.disabled = false; }
});

$('#shorten-form').addEventListener('submit', async event => {
  event.preventDefault(); showError('#shorten-error', ''); const button = $('#shorten-form button'); button.disabled = true; button.classList.add('loading');
  try {
    const result = await send('/shorten', 'POST', { longUrl: $('#long-url').value }); state.result = result;
    $('#result-url').textContent = result.shortUrl.replace(/^https?:\/\//, ''); $('#result-url').href = result.shortUrl; $('#shorten-result').hidden = false;
    if (!reducedMotion()) $('#shorten-result').animate([{ opacity: 0, transform: 'translateY(12px) scale(.97)', filter: 'blur(5px)' }, { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
    $('#save-message').replaceChildren();
    if (result.saved) $('#save-message').textContent = 'Saved to your little space. Ready to share.';
    else {
      const button = document.createElement('button'); button.className = 'text-button'; button.textContent = 'Keep this link in your little space'; button.addEventListener('click', () => openAuth('register')); $('#save-message').append(button);
    }
  } catch (err) {
    showError('#shorten-error', err.message);
    if (err.status === 401) openAuth('login');
  } finally { button.disabled = false; button.classList.remove('loading'); }
});
$('#copy-result').addEventListener('click', () => state.result && copy(state.result.shortUrl));

function iconButton(label, symbol, action) { const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button'; button.setAttribute('aria-label', label); button.title = label; button.textContent = symbol; button.addEventListener('click', action); return button; }
function renderLinks() {
  $('#saved-links').replaceChildren(); $('#empty-links').hidden = state.links.length > 0; $('#link-count').textContent = state.links.length;
  $('#click-count').textContent = `${state.links.reduce((total, link) => total + link.clicks, 0)} total clicks`;
  state.links.forEach((link, index) => {
    const row = document.createElement('article'); row.className = 'saved-link'; row.dataset.id = link.id;
    row.style.setProperty('--delay', `${Math.min(index * 35, 175)}ms`);
    const number = document.createElement('span'); number.className = 'link-number'; number.textContent = String(index + 1).padStart(2, '0');
    const info = document.createElement('div'); info.className = 'saved-link-info';
    const title = document.createElement('h3'); title.textContent = link.title;
    const url = document.createElement('a'); url.href = link.shortUrl; url.target = '_blank'; url.rel = 'noopener noreferrer'; url.textContent = link.shortUrl.replace(/^https?:\/\//, '');
    const meta = document.createElement('div'); meta.className = 'link-meta'; const clicks = document.createElement('span'); clicks.textContent = `${link.clicks} click${link.clicks === 1 ? '' : 's'}`; meta.append(clicks);
    if (!link.visible) { const hidden = document.createElement('span'); hidden.className = 'private-tag'; hidden.textContent = 'Hidden from profile'; meta.append(hidden); }
    info.append(title, url, meta); const actions = document.createElement('div'); actions.className = 'link-actions';
    actions.append(iconButton(`Copy ${link.title}`, '⧉', () => copy(link.shortUrl)), iconButton(`Edit ${link.title}`, '⋯', () => openEdit(link)));
    const reorder = document.createElement('div'); reorder.className = 'reorder-actions';
    const up = iconButton(`Move ${link.title} up`, '▴', () => moveLink(index, -1)); up.disabled = index === 0;
    const down = iconButton(`Move ${link.title} down`, '▾', () => moveLink(index, 1)); down.disabled = index === state.links.length - 1;
    reorder.append(up, down); actions.append(reorder); row.append(number, info, actions); $('#saved-links').append(row);
  });
}
async function loadLinks() { const data = await api('/api/links'); state.links = data.links; renderLinks(); }
async function moveLink(index, direction) {
  const reordered = [...state.links]; [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
  $$('.reorder-actions button').forEach(button => { button.disabled = true; });
  try { await send('/api/links/reorder', 'PATCH', { ids: reordered.map(link => link.id) }); state.links = reordered; renderLinks(); }
  catch (err) { toast(err.message); renderLinks(); }
}
$('#add-link-form').addEventListener('submit', async event => {
  event.preventDefault(); showError('#links-error', ''); const button = $('#add-link-form button'); button.disabled = true;
  try { await send('/api/links', 'POST', { longUrl: $('#add-url').value }); $('#add-url').value = ''; await loadLinks(); toast('A new little link, saved.'); }
  catch (err) { showError('#links-error', err.message); if (err.status === 401) openAuth('login'); }
  finally { button.disabled = false; }
});
function openEdit(link) {
  state.editing = link; $('#edit-title').value = link.title; $('#edit-visible').checked = link.visible; $('#edit-destination').textContent = link.longUrl; showError('#edit-error', '');
  $('#delete-link').textContent = 'Remove from my space'; $('#delete-link').dataset.confirm = ''; $('#edit-dialog').showModal(); $('#edit-title').focus();
}
$('#edit-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#edit-form button'); button.disabled = true; showError('#edit-error', '');
  try { await send(`/api/links/${state.editing.id}`, 'PATCH', { title: $('#edit-title').value, visible: $('#edit-visible').checked }); await loadLinks(); closeDialog($('#edit-dialog')); toast('Little details, updated.'); }
  catch (err) { showError('#edit-error', err.message); }
  finally { button.disabled = false; }
});
$('#delete-link').addEventListener('click', async () => {
  const button = $('#delete-link');
  if (!button.dataset.confirm) { button.dataset.confirm = 'true'; button.textContent = 'Click again to remove this link'; return; }
  button.disabled = true;
  try { await api(`/api/links/${state.editing.id}`, { method: 'DELETE' }); await loadLinks(); closeDialog($('#edit-dialog')); toast('Removed from your little space.'); }
  catch (err) { showError('#edit-error', err.message); }
  finally { button.disabled = false; }
});
function selectProfileTheme(theme) {
  state.profileTheme = theme;
  $$('[data-profile-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.profileTheme === theme)));
  setTheme(theme);
}
$$('[data-profile-theme]').forEach(button => button.addEventListener('click', () => selectProfileTheme(button.dataset.profileTheme)));
function renderProfileForm() {
  $('#profile-name').value = state.user.name; $('#profile-bio').value = state.user.bio; $('#profile-avatar').textContent = state.user.name[0].toUpperCase(); $('#profile-handle').textContent = `@${state.user.username}`;
  $('#view-profile').href = `/u/${state.user.username}`; selectProfileTheme(state.user.theme);
}
$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#profile-form button[type=submit]'); button.disabled = true; showError('#profile-error', '');
  try { const data = await send('/api/profile', 'PATCH', { name: $('#profile-name').value, bio: $('#profile-bio').value, theme: state.profileTheme }); state.user = data.user; renderProfileForm(); toast('Your little space, just how you like it.'); }
  catch (err) { showError('#profile-error', err.message); }
  finally { button.disabled = false; }
});
$('#copy-profile').addEventListener('click', () => copy(new URL(`/u/${state.user.username}`, location.origin).href));

async function renderPublicProfile(username) {
  $('#home').hidden = true; $('#public-profile').hidden = false; $('#site-footer').hidden = true;
  const data = await api(`/api/profiles/${encodeURIComponent(username)}`); const { user, links } = data;
  setTheme(user.theme); document.title = `${user.name} — Littlelink`;
  $('#public-avatar').textContent = user.name[0].toUpperCase(); $('#public-handle').textContent = `@${user.username}`; $('#public-name').textContent = user.name; $('#public-bio').textContent = user.bio; $('#public-bio').hidden = !user.bio;
  $('#public-links').replaceChildren(); $('#public-empty').hidden = links.length > 0;
  links.forEach(link => {
    const item = document.createElement('a'); item.href = link.shortUrl; item.target = '_blank'; item.rel = 'noopener noreferrer'; item.className = 'public-link';
    const icon = document.createElement('span'); icon.className = 'link-number'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = '↗';
    const text = document.createElement('span'); text.className = 'public-link-title'; text.textContent = link.title; const host = document.createElement('small'); host.textContent = new URL(link.longUrl).hostname.replace(/^www\./, ''); text.append(host);
    const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '↗'; item.append(icon, text, arrow); $('#public-links').append(item);
  });
}
async function init() {
  const path = location.pathname;
  let sessionError;
  try { const data = await api('/api/auth/me'); state.user = data.user; } catch (err) { sessionError = err; }
  renderNavigation();
  if (path.startsWith('/u/')) {
    try { await renderPublicProfile(decodeURIComponent(path.slice(3))); }
    catch (err) { $('#public-name').textContent = err.status === 404 ? 'A little lost.' : 'A little pause.'; $('#public-bio').textContent = err.message; $('#public-avatar').textContent = '↗'; }
  } else if (path === '/dashboard') {
    $('#home').hidden = true; $('#dashboard').hidden = false; document.title = 'Your little space — Littlelink';
    if (sessionError) { showError('#links-error', sessionError.message); return; }
    if (!state.user) { $('#dashboard').hidden = true; $('#home').hidden = false; openAuth('login'); return; }
    renderProfileForm(); try { await loadLinks(); } catch (err) { showError('#links-error', err.message); }
  }
}
init();
