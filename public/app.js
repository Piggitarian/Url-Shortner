// Shared setup · Step 1: Create DOM helpers and keep page state in one place.
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { user: null, links: [], theme: 'meadow', profileTheme: 'meadow', authMode: 'login', result: null, editing: null };
let toastTimeout;
let sceneIndex = 0, themeRequest = 0;
const themes = ['meadow', 'dusk', 'ocean', 'forest', 'ember'];

// Shared setup · Step 2: Read preferences without failing when browser storage is unavailable.
function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
// Shared setup · Step 3: Save preferences when browser storage is available.
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
// Shared setup · Step 4: Request JSON and turn network or server failures into readable errors.
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
// Shared setup · Step 5: Serialize JSON bodies for account, link, and profile requests.
const send = (path, method, body) => api(path, { method, body: JSON.stringify(body) });
// Shared feedback · Step 1: Show or clear an inline error beside the relevant form.
function showError(selector, message) { const element = $(selector); element.textContent = message || ''; element.hidden = !message; }
// Shared feedback · Step 2: Briefly announce completed actions to users and screen readers.
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 2800); }
// Shared feedback · Step 3: Copy a URL with a fallback for browsers without clipboard access.
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
// Home page · Step 1: Preload the selected landscape and crossfade it into view.
function setTheme(theme, remember = false) {
  if (!themes.includes(theme)) theme = 'meadow';
  const previous = state.theme;
  state.theme = theme; document.body.dataset.theme = theme;
  // Home page · Step 3: Connect theme and motion controls, then restore saved preferences.
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
  if (previous !== theme) {
    $('.heading-word').animate([{ opacity: .45, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
}
// Home page · Step 2: Switch between animated landscapes and still images.
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

// Shared controls · Step 1: Track spring positions only for selected primary action buttons.
const magneticStates = new Map();
const magneticSelector = 'button[data-magnetic]:not(:disabled)';
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let magneticFrame = 0;
let activeMagnet;

// Shared controls · Step 2: Animate attraction and return each control to its resting position.
function springButtons() {
  magneticFrame = 0;
  let moving = false;
  for (const [button, spring] of magneticStates) {
    if (!button.isConnected || button.disabled || !button.getClientRects().length) {
      button.style.translate = ''; button.classList.remove('is-magnetic-active'); magneticStates.delete(button); continue;
    }
    spring.vx = (spring.vx + (spring.tx - spring.x) * .16) * .72;
    spring.vy = (spring.vy + (spring.ty - spring.y) * .16) * .72;
    spring.x += spring.vx; spring.y += spring.vy;
    button.style.translate = `${spring.x.toFixed(2)}px ${spring.y.toFixed(2)}px`;
    if (Math.abs(spring.tx - spring.x) + Math.abs(spring.ty - spring.y) + Math.abs(spring.vx) + Math.abs(spring.vy) > .06) moving = true;
    else if (!spring.tx && !spring.ty) { button.style.translate = ''; magneticStates.delete(button); }
  }
  if (moving) magneticFrame = requestAnimationFrame(springButtons);
}

// Shared controls · Step 3: Update a spring target without changing the control's layout.
function moveMagnet(button, tx, ty) {
  if (!magneticStates.has(button)) magneticStates.set(button, { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 });
  const spring = magneticStates.get(button); spring.tx = tx; spring.ty = ty;
  if (!magneticFrame) magneticFrame = requestAnimationFrame(springButtons);
}

// Shared controls · Step 4: Measure the resting hit area so moving buttons never jitter.
function restingBounds(button) {
  const bounds = button.getBoundingClientRect(), spring = magneticStates.get(button);
  return { left: bounds.left - (spring?.x || 0), top: bounds.top - (spring?.y || 0), width: bounds.width, height: bounds.height };
}

// Shared controls · Step 5: Release attraction when the cursor leaves or focus changes.
function resetMagnets() {
  activeMagnet = null;
  for (const button of magneticStates.keys()) { button.classList.remove('is-magnetic-active'); moveMagnet(button, 0, 0); }
}

// Shared controls · Step 6: Attract the closest selected action without pulling near other controls.
document.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || !finePointer.matches) return;
  const root = document.querySelector('dialog[open]') || document;
  let button = event.target.closest(magneticSelector);
  if (button && !root.contains(button)) button = null;
  if (!button && !event.target.closest('button, a[href], [role="button"], input, textarea, select, label')) {
    let nearest = 38;
    for (const candidate of root.querySelectorAll(magneticSelector)) {
      if (!candidate.getClientRects().length) continue;
      const bounds = restingBounds(candidate);
      const dx = Math.max(bounds.left - event.clientX, 0, event.clientX - bounds.left - bounds.width);
      const dy = Math.max(bounds.top - event.clientY, 0, event.clientY - bounds.top - bounds.height);
      const distance = Math.hypot(dx, dy);
      if (distance < nearest) { button = candidate; nearest = distance; }
    }
  }
  if (activeMagnet && activeMagnet !== button) { activeMagnet.classList.remove('is-magnetic-active'); moveMagnet(activeMagnet, 0, 0); }
  activeMagnet = button;
  if (!button) return;
  const bounds = restingBounds(button);
  const dx = event.clientX - (bounds.left + bounds.width / 2), dy = event.clientY - (bounds.top + bounds.height / 2);
  const maxX = Math.min(24, bounds.width * .34), maxY = Math.min(17, bounds.height * .34);
  button.classList.add('is-magnetic-active');
  moveMagnet(button, Math.max(-maxX, Math.min(maxX, dx * .52)), Math.max(-maxY, Math.min(maxY, dy * .52)));
});
document.addEventListener('pointerout', event => { if (!event.relatedTarget) resetMagnets(); });
document.addEventListener('pointerdown', resetMagnets);
document.addEventListener('focusin', resetMagnets);
document.addEventListener('scroll', resetMagnets, true);
window.addEventListener('blur', resetMagnets);
finePointer.addEventListener('change', resetMagnets);

// Navigation · Step 1: Show account access or the signed-in profile and logout controls.
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

// Account page · Step 1: Set the login or signup fields and open the account dialog.
function openAuth(mode) {
  const switching = $('#auth-dialog').open && state.authMode !== mode;
  state.authMode = mode; const register = mode === 'register';
  $('#auth-dialog').dataset.mode = mode;
  $$('.auth-mode-switch [data-auth]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.auth === mode)));
  $('#auth-heading').innerHTML = register ? 'Your little <em>space.</em>' : 'Welcome <em>back.</em>';
  $('#auth-description').textContent = register ? 'Save your links. Share your corner of the internet.' : 'Your little corner is waiting for you.';
  $('#register-fields').hidden = !register; $('#auth-username').required = register; $('#auth-username').disabled = !register;
  $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
  $('#auth-password').minLength = register ? 10 : 1;
  $('#auth-password').placeholder = register ? 'Create a password' : 'Your password';
  $('#password-hint').hidden = !register;
  $('#auth-submit-label').textContent = register ? 'Create your space' : 'Log in';
  $('#auth-submit').setAttribute('aria-busy', 'false');
  setPasswordVisibility(false);
  $('#auth-switch-label').textContent = register ? 'Already have a little space?' : 'New around here?';
  $('#auth-switch').textContent = register ? 'Log in' : 'Create your little space'; showError('#auth-error', '');
  resetMagnets();
  if (!$('#auth-dialog').open) { $('#auth-dialog').classList.remove('is-closing'); $('#auth-dialog').showModal(); }
  if (switching) {
    const direction = register ? 1 : -1;
    ['#auth-heading', '#auth-description', '#auth-form', '.auth-switch'].forEach((selector, index) => {
      const element = $(selector);
      element.getAnimations().forEach(animation => animation.cancel());
      element.animate([
        { opacity: 0, transform: `translateX(${direction * 18}px) translateY(6px)`, filter: 'blur(3px)' },
        { opacity: 1, transform: 'translateX(0) translateY(0)', filter: 'blur(0)' },
      ], { duration: 360, delay: index * 35, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    });
  }
  (register ? $('#auth-username') : $('#auth-email')).focus();
}
// Account page · Step 2: Connect the account tabs and the login/signup switch.
$$('[data-auth]').forEach(button => button.addEventListener('click', () => openAuth(button.dataset.auth)));
$('#auth-switch').addEventListener('click', () => openAuth(state.authMode === 'register' ? 'login' : 'register'));

// Account page · Step 3: Let users check their password while preserving keyboard focus.
function setPasswordVisibility(visible) {
  $('#auth-password').type = visible ? 'text' : 'password';
  $('#toggle-password').setAttribute('aria-pressed', String(visible));
  $('#toggle-password').setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
}
$('#toggle-password').addEventListener('click', () => setPasswordVisibility($('#auth-password').type === 'password'));
// Dialogs · Step 1: Return magnetic controls to rest and animate the dialog closed.
function closeDialog(dialog) {
  if (!dialog.open || dialog.classList.contains('is-closing')) return;
  resetMagnets();
  dialog.classList.add('is-closing');
  setTimeout(() => { dialog.close(); dialog.classList.remove('is-closing'); }, 180);
}
// Dialogs · Step 2: Close dialogs from their close button, Escape, or an outside click.
$$('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog($(`#${button.dataset.close}`))));
$$('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog); } });
});
// Account page · Step 4: Submit credentials, show progress, and open the dashboard after success.
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault(); showError('#auth-error', ''); const button = $('#auth-submit'); button.disabled = true;
  const mode = state.authMode;
  const modeButtons = [...$$('.auth-mode-switch button'), $('#auth-switch')];
  modeButtons.forEach(control => { control.disabled = true; });
  button.setAttribute('aria-busy', 'true'); $('#auth-submit-label').textContent = mode === 'register' ? 'Creating your space…' : 'Logging in…';
  try {
    const data = await send(`/api/auth/${mode}`, 'POST', { email: $('#auth-email').value, password: $('#auth-password').value, username: $('#auth-username').value });
    state.user = data.user; $('#auth-password').value = '';
// Account page · Step 5: Save the last anonymously shortened link after successful authentication.
    if (state.result) await send('/api/links', 'POST', { longUrl: state.result.longUrl }).catch(() => toast('Log in succeeded. Add your last link from your space.'));
    $('#auth-dialog').close(); location.href = '/dashboard';
  } catch (err) { showError('#auth-error', err.message); }
  finally {
    button.disabled = false; button.setAttribute('aria-busy', 'false'); modeButtons.forEach(control => { control.disabled = false; });
    $('#auth-submit-label').textContent = mode === 'register' ? 'Create your space' : 'Log in';
  }
});

// Home page · Step 4: Shorten the entered URL and display its copy and save actions.
$('#shorten-form').addEventListener('submit', async event => {
  event.preventDefault(); showError('#shorten-error', ''); const button = $('#shorten-form button'); button.disabled = true; button.classList.add('loading');
  try {
    const result = await send('/shorten', 'POST', { longUrl: $('#long-url').value }); state.result = result;
    $('#result-url').textContent = result.shortUrl.replace(/^https?:\/\//, ''); $('#result-url').href = result.shortUrl; $('#shorten-result').hidden = false;
    $('#shorten-result').animate([{ opacity: 0, transform: 'translateY(12px) scale(.97)', filter: 'blur(5px)' }, { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
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
// Home page · Step 5: Copy the most recently created short URL.
$('#copy-result').addEventListener('click', () => state.result && copy(state.result.shortUrl));

// Dashboard page · Step 1: Build labeled copy, edit, and reorder buttons for each saved link.
function iconButton(label, symbol, action) { const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button'; button.setAttribute('aria-label', label); button.title = label; button.textContent = symbol; button.addEventListener('click', action); return button; }
// Dashboard page · Step 2: Render the saved collection with titles, clicks, visibility, and ordering.
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
// Dashboard page · Step 3: Fetch saved links and refresh the collection.
async function loadLinks() { const data = await api('/api/links'); state.links = data.links; renderLinks(); }
// Dashboard page · Step 4: Persist a new link order before updating the displayed collection.
async function moveLink(index, direction) {
  const reordered = [...state.links]; [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
  $$('.reorder-actions button').forEach(button => { button.disabled = true; });
  try { await send('/api/links/reorder', 'PATCH', { ids: reordered.map(link => link.id) }); state.links = reordered; renderLinks(); }
  catch (err) { toast(err.message); renderLinks(); }
}
// Dashboard page · Step 5: Add a URL to the account and refresh the list.
$('#add-link-form').addEventListener('submit', async event => {
  event.preventDefault(); showError('#links-error', ''); const button = $('#add-link-form button'); button.disabled = true;
  try { await send('/api/links', 'POST', { longUrl: $('#add-url').value }); $('#add-url').value = ''; await loadLinks(); toast('A new little link, saved.'); }
  catch (err) { showError('#links-error', err.message); if (err.status === 401) openAuth('login'); }
  finally { button.disabled = false; }
});
// Dashboard page · Step 6: Open the edit dialog with the selected link details.
function openEdit(link) {
  state.editing = link; $('#edit-title').value = link.title; $('#edit-visible').checked = link.visible; $('#edit-destination').textContent = link.longUrl; showError('#edit-error', '');
  $('#delete-link').textContent = 'Remove from my space'; $('#delete-link').dataset.confirm = ''; $('#edit-dialog').showModal(); $('#edit-title').focus();
}
// Dashboard page · Step 7: Save the edited title and public visibility.
$('#edit-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#edit-form button'); button.disabled = true; showError('#edit-error', '');
  try { await send(`/api/links/${state.editing.id}`, 'PATCH', { title: $('#edit-title').value, visible: $('#edit-visible').checked }); await loadLinks(); closeDialog($('#edit-dialog')); toast('Little details, updated.'); }
  catch (err) { showError('#edit-error', err.message); }
  finally { button.disabled = false; }
});
// Dashboard page · Step 8: Require a second click before removing a saved link.
$('#delete-link').addEventListener('click', async () => {
  const button = $('#delete-link');
  if (!button.dataset.confirm) { button.dataset.confirm = 'true'; button.textContent = 'Click again to remove this link'; return; }
  button.disabled = true;
  try { await api(`/api/links/${state.editing.id}`, { method: 'DELETE' }); await loadLinks(); closeDialog($('#edit-dialog')); toast('Removed from your little space.'); }
  catch (err) { showError('#edit-error', err.message); }
  finally { button.disabled = false; }
});
// Dashboard page · Step 9: Preview a landscape while retaining unsaved profile details.
function selectProfileTheme(theme) {
  state.profileTheme = theme;
  // Dashboard page · Step 10: Connect each landscape choice to the profile preview.
$$('[data-profile-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.profileTheme === theme)));
  setTheme(theme);
}
$$('[data-profile-theme]').forEach(button => button.addEventListener('click', () => selectProfileTheme(button.dataset.profileTheme)));
// Dashboard page · Step 11: Fill profile details and attach the public page URL.
function renderProfileForm() {
  $('#profile-name').value = state.user.name; $('#profile-bio').value = state.user.bio; $('#profile-avatar').textContent = state.user.name[0].toUpperCase(); $('#profile-handle').textContent = `@${state.user.username}`;
  $('#view-profile').href = `/u/${state.user.username}`; selectProfileTheme(state.user.theme);
}
// Dashboard page · Step 12: Save the display name, bio, and selected landscape together.
$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#profile-form button[type=submit]'); button.disabled = true; showError('#profile-error', '');
  try { const data = await send('/api/profile', 'PATCH', { name: $('#profile-name').value, bio: $('#profile-bio').value, theme: state.profileTheme }); state.user = data.user; renderProfileForm(); toast('Your little space, just how you like it.'); }
  catch (err) { showError('#profile-error', err.message); }
  finally { button.disabled = false; }
});
// Dashboard page · Step 13: Copy the public profile URL.
$('#copy-profile').addEventListener('click', () => copy(new URL(`/u/${state.user.username}`, location.origin).href));

// Public profile page · Step 1: Fetch public details and apply the profile landscape.
async function renderPublicProfile(username) {
  $('#home').hidden = true; $('#public-profile').hidden = false; $('#site-footer').hidden = true;
  const data = await api(`/api/profiles/${encodeURIComponent(username)}`); const { user, links } = data;
  setTheme(user.theme); document.title = `${user.name} — Littlelink`;
  $('#public-avatar').textContent = user.name[0].toUpperCase(); $('#public-handle').textContent = `@${user.username}`; $('#public-name').textContent = user.name; $('#public-bio').textContent = user.bio; $('#public-bio').hidden = !user.bio;
  $('#public-links').replaceChildren(); $('#public-empty').hidden = links.length > 0;
// Public profile page · Step 2: Build shareable cards for the visible saved links.
  links.forEach(link => {
    const item = document.createElement('a'); item.href = link.shortUrl; item.target = '_blank'; item.rel = 'noopener noreferrer'; item.className = 'public-link';
    const icon = document.createElement('span'); icon.className = 'link-number'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = '↗';
    const text = document.createElement('span'); text.className = 'public-link-title'; text.textContent = link.title; const host = document.createElement('small'); host.textContent = new URL(link.longUrl).hostname.replace(/^www\./, ''); text.append(host);
    const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '↗'; item.append(icon, text, arrow); $('#public-links').append(item);
  });
}
// Page routing · Step 1: Restore the session before choosing which page to display.
async function init() {
  const path = location.pathname;
  let sessionError;
  try { const data = await api('/api/auth/me'); state.user = data.user; } catch (err) { sessionError = err; }
  renderNavigation();
// Page routing · Step 2: Render public profiles and handle missing profiles inline.
  if (path.startsWith('/u/')) {
    try { await renderPublicProfile(decodeURIComponent(path.slice(3))); }
    catch (err) { $('#public-name').textContent = err.status === 404 ? 'A little lost.' : 'A little pause.'; $('#public-bio').textContent = err.message; $('#public-avatar').textContent = '↗'; }
// Page routing · Step 3: Require a session before loading dashboard details.
  } else if (path === '/dashboard') {
    $('#home').hidden = true; $('#dashboard').hidden = false; document.title = 'Your little space — Littlelink';
    if (sessionError) { showError('#links-error', sessionError.message); return; }
    if (!state.user) { $('#dashboard').hidden = true; $('#home').hidden = false; openAuth('login'); return; }
    renderProfileForm(); try { await loadLinks(); } catch (err) { showError('#links-error', err.message); }
  }
}
// Page routing · Step 4: Start the page after the deferred script has loaded.
init();
