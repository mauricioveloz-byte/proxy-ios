const loginPanel = document.querySelector('#login-panel');
const loginForm = document.querySelector('#login-form');
const loginButton = loginForm.querySelector('button[type="submit"]');
const dashboard = document.querySelector('#dashboard');
const logoutButton = document.querySelector('#logout-button');
const refreshButton = document.querySelector('#refresh-button');
const list = document.querySelector('#resource-list');
const form = document.querySelector('#customization-form');
const notice = document.querySelector('#notice');
const connectionState = document.querySelector('#connection-state');
const activeResourceSelect = document.querySelector('#active-resource-select');
const activateSelectedButton = document.querySelector('#activate-selected');
let activeResourceId = null;

const tokenStorageKey = 'customizationHubToken';

function setNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle('is-error', isError);
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem(tokenStorageKey);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) endSession();
    const error = new Error(payload.error || `Error HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function showDashboard(username) {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  logoutButton.hidden = false;
  connectionState.textContent = username || 'Sesión activa';
  connectionState.classList.add('is-connected');
  loadResources();
}

function endSession() {
  sessionStorage.removeItem(tokenStorageKey);
  loginPanel.hidden = false;
  dashboard.hidden = true;
  logoutButton.hidden = true;
  connectionState.textContent = 'Desconectado';
  connectionState.classList.remove('is-connected');
}

function addText(parent, tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function renderResources(resources, activeId) {
  activeResourceId = activeId;
  activeResourceSelect.replaceChildren();
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Sin recurso activo';
  activeResourceSelect.append(emptyOption);
  for (const resource of resources.filter((item) => item.isActive)) {
    const option = document.createElement('option');
    option.value = resource._id;
    option.textContent = `${resource.name} · ${resource.category} · ${resource.version}`;
    activeResourceSelect.append(option);
  }
  activeResourceSelect.value = activeId || '';

  list.replaceChildren();
  if (!resources.length) {
    addText(list, 'p', 'Todavía no hay recursos registrados.', 'empty-state');
    return;
  }

  for (const resource of resources) {
    const row = document.createElement('article');
    row.className = 'resource-row';
    const details = document.createElement('div');
    details.className = 'resource-details';
    const titleLine = document.createElement('div');
    titleLine.className = 'resource-title-line';
    addText(titleLine, 'h3', resource.name);
    addText(titleLine, 'span', resource.isActive ? 'Disponible' : 'Retirado', `status ${resource.isActive ? 'status-on' : 'status-off'}`);
    details.append(titleLine);
    addText(details, 'p', `${resource.category} · versión ${resource.version}`, 'resource-meta');
    const url = document.createElement('a');
    url.className = 'resource-url';
    url.href = resource.resource_url;
    url.target = '_blank';
    url.rel = 'noopener noreferrer';
    url.textContent = resource.resource_url;
    details.append(url);
    addText(details, 'code', `SHA-256 ${resource.checksum_sha256}`, 'checksum');

    if (activeId === resource._id) {
      addText(details, 'span', 'Activo para este usuario', 'active-label');
    }
    row.append(details);
    list.append(row);
  }
}

async function loadResources() {
  setNotice('Cargando catálogo…');
  try {
    const [{ customizations }, activeResponse] = await Promise.all([
      apiFetch('/customizations'),
      apiFetch('/user/active-resource').catch((error) => {
        if (error.status === 404) return null;
        throw error;
      }),
    ]);
    renderResources(customizations, activeResponse?.resource_id || null);
    connectionState.textContent = `${customizations.length} recursos`;
    connectionState.classList.add('is-connected');
    setNotice('Catálogo actualizado.');
  } catch (error) {
    connectionState.textContent = 'Sin conexión';
    connectionState.classList.remove('is-connected');
    setNotice(error.message, true);
  }
}

async function setActive(id, active) {
  try {
    await apiFetch(`/user/customizations/${encodeURIComponent(id)}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    setNotice(active ? 'Recurso activado para este usuario.' : 'Recurso desactivado.');
    await loadResources();
  } catch (error) {
    setNotice(error.message, true);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  setNotice('Validando licencia con KeyAuth…');
  try {
    const formData = new FormData(loginForm);
    const response = await fetch('/api/v1/login-keyauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: formData.get('licenseKey') }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo validar la licencia');

    sessionStorage.setItem(tokenStorageKey, payload.token);
    loginForm.reset();
    setNotice('Licencia válida. Sesión iniciada.');
    showDashboard(payload.user?.username);
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener('click', () => {
  endSession();
  setNotice('Sesión cerrada.');
});
refreshButton.addEventListener('click', loadResources);
activateSelectedButton.addEventListener('click', async () => {
  const selectedId = activeResourceSelect.value;
  if (selectedId) {
    await setActive(selectedId, true);
  } else if (activeResourceId) {
    await setActive(activeResourceId, false);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  try {
    await apiFetch('/upload', { method: 'POST', body: data });
    form.reset();
    setNotice('Archivo subido y checksum registrado.');
    await loadResources();
  } catch (error) {
    setNotice(error.message, true);
  }
});

fetch('/api/v1/session-mode')
  .then((response) => response.json())
  .then(({ localAuthBypass }) => {
    const savedToken = sessionStorage.getItem(tokenStorageKey);
    if (localAuthBypass) {
      showDashboard('Modo local sin login');
    } else if (savedToken) {
      showDashboard('Sesión activa');
    }
  })
  .catch(() => {
    const savedToken = sessionStorage.getItem(tokenStorageKey);
    if (savedToken) showDashboard('Sesión activa');
  });
