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
const adminUploadPanel = document.querySelector('#admin-upload-panel');
const proxyAdminPanel = document.querySelector('#proxy-admin');
const proxyListenerPort = document.querySelector('#proxy-listener-port');
const proxyPortHelp = document.querySelector('#proxy-port-help');
const iosProxyServer = document.querySelector('#ios-proxy-server');
const iosProxyPort = document.querySelector('#ios-proxy-port');
const iosApiBaseUrl = document.querySelector('#ios-api-base-url');
const proxyRouteForm = document.querySelector('#proxy-route-form');
const proxyRouteList = document.querySelector('#proxy-route-list');
let activeResourceId = null;
let proxyFormDefaultsLoaded = false;

const tokenStorageKey = 'customizationHubToken';
const deviceIdStorageKey = 'customizationHubDeviceId';

function getDeviceId() {
  let deviceId = localStorage.getItem(deviceIdStorageKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(deviceIdStorageKey, deviceId);
  }
  return deviceId;
}

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

function showDashboard(username, isAdmin = false) {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  logoutButton.hidden = false;
  adminUploadPanel.hidden = !isAdmin;
  proxyAdminPanel.hidden = !isAdmin;
  connectionState.textContent = username || 'Sesión activa';
  connectionState.classList.add('is-connected');
  loadResources();
  if (isAdmin) loadProxyRoutes();
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

async function loadProxyRoutes() {
  try {
    const {
      routes,
      listenerPort,
      listenerPortManagedByPlatform,
      clientServer,
      clientPort,
      clientApiBaseUrl,
      proxyDefaults,
    } = await apiFetch('/proxy-routes');
    proxyListenerPort.textContent = listenerPort;
    proxyPortHelp.textContent = listenerPortManagedByPlatform
      ? 'Render asigna el puerto de escucha. El puerto del servicio destino se configura en cada URL.'
      : 'El proceso escucha en este puerto; para cambiarlo, configura PORT y reinicia el servidor.';
    iosProxyServer.textContent = `Servidor: ${clientServer}`;
    iosProxyPort.textContent = `Puerto público: ${clientPort}`;
    iosApiBaseUrl.textContent = clientApiBaseUrl;
    if (!proxyFormDefaultsLoaded) {
      proxyRouteForm.elements.targetServer.value = proxyDefaults.targetServer;
      proxyRouteForm.elements.targetPort.value = proxyDefaults.targetPort;
      proxyFormDefaultsLoaded = true;
    }
    proxyRouteList.replaceChildren();
    if (!routes.length) {
      addText(proxyRouteList, 'p', 'No hay rutas configuradas.', 'empty-state');
      return;
    }

    for (const route of routes) {
      const row = document.createElement('article');
      row.className = 'proxy-route-row';
      const details = document.createElement('div');
      details.className = 'proxy-route-details';
      addText(details, 'strong', route.name);
      addText(details, 'code', `${route.pathPrefix} → ${route.targetUrl}`);
      addText(details, 'span', route.enabled ? 'Activa' : 'Desactivada', `status ${route.enabled ? 'status-on' : 'status-off'}`);
      row.append(details);

      const actions = document.createElement('div');
      actions.className = 'proxy-route-actions';
      const toggleButton = addText(actions, 'button', route.enabled ? 'Desactivar' : 'Activar', 'button button-outline');
      toggleButton.type = 'button';
      toggleButton.title = route.enabled ? 'Desactivar ruta' : 'Activar ruta';
      toggleButton.addEventListener('click', () => updateProxyRoute(route._id, { enabled: !route.enabled }));
      const deleteButton = addText(actions, 'button', 'Eliminar', 'button button-danger');
      deleteButton.type = 'button';
      deleteButton.title = 'Eliminar ruta';
      deleteButton.addEventListener('click', () => removeProxyRoute(route._id));
      row.append(actions);
      proxyRouteList.append(row);
    }
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function updateProxyRoute(id, changes) {
  try {
    await apiFetch(`/proxy-routes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
    await loadProxyRoutes();
  } catch (error) {
    setNotice(error.message, true);
  }
}

async function removeProxyRoute(id) {
  if (!window.confirm('¿Eliminar esta ruta del proxy?')) return;
  try {
    await apiFetch(`/proxy-routes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setNotice('Ruta eliminada.');
    await loadProxyRoutes();
  } catch (error) {
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
      body: JSON.stringify({ licenseKey: formData.get('licenseKey'), hwid: getDeviceId() }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo validar la licencia');

    sessionStorage.setItem(tokenStorageKey, payload.token);
    loginForm.reset();
    setNotice('Licencia válida. Sesión iniciada.');
    showDashboard(payload.user?.username, payload.user?.role === 'admin');
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

proxyRouteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(proxyRouteForm);
  try {
    const targetServer = String(data.get('targetServer') || '').trim();
    const targetPort = Number(data.get('targetPort'));
    const targetProtocol = data.get('targetProtocol');
    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      throw new Error('El puerto destino debe estar entre 1 y 65535.');
    }
    if (!['http', 'https'].includes(targetProtocol)) {
      throw new Error('Selecciona HTTP o HTTPS para el destino.');
    }
    let target;
    try {
      target = new URL(`${targetProtocol}://${targetServer}:${targetPort}`);
    } catch {
      throw new Error('Escribe un servidor válido, sin protocolo, ruta ni credenciales.');
    }
    if (!target.hostname || target.pathname !== '/' || target.username || target.password || target.search || target.hash) {
      throw new Error('Escribe sólo el host del servidor, sin ruta ni credenciales.');
    }
    await apiFetch('/proxy-routes', {
      method: 'POST',
      body: JSON.stringify({
        name: data.get('name'),
        pathPrefix: data.get('pathPrefix'),
        targetUrl: target.origin,
      }),
    });
    setNotice('Ruta del proxy agregada.');
    await loadProxyRoutes();
  } catch (error) {
    setNotice(error.message, true);
  }
});

fetch('/api/v1/session-mode')
  .then((response) => response.json())
  .then(async ({ localAuthBypass }) => {
    const savedToken = sessionStorage.getItem(tokenStorageKey);
    if (localAuthBypass) {
      showDashboard('Modo local sin login', true);
    } else if (savedToken) {
      try {
        const { user } = await apiFetch('/user/session');
        showDashboard(user.username, user.role === 'admin');
      } catch {
        endSession();
      }
    }
  })
  .catch(() => {
    const savedToken = sessionStorage.getItem(tokenStorageKey);
    if (savedToken) showDashboard('Sesión activa');
  });
