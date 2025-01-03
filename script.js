
// Configuración de la aplicación Google
const CLIENT_ID = '185434111940-8gsma18aau8fd6lqqa9k0njbdvuuhc0p.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let tokenClient; // Cliente GIS para manejar tokens
let accessToken = null;
const folderNames = {
  'Exámenes Médicos': null,
  'Visitas Domiciliarias': null,
  'Consultas de Antecedentes': null,
};

// Inicializar Google Identity Services
function initGoogleAPI() {
  if (google && google.accounts && google.accounts.oauth2) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        accessToken = tokenResponse.access_token;
        console.log('Token recibido:', accessToken);
        alert('Inicio de sesión exitoso.');
        updateSigninStatus(true);
        cargarArchivos(); // Cargar archivos previamente subidos
      },
    });
  } else {
    console.error('Google Identity Services no se cargó correctamente.');
    alert('Error al cargar Google Identity Services.');
  }
}

// Actualizar estado de autenticación
function updateSigninStatus(isSignedIn) {
  if (isSignedIn && accessToken) {
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('logout-btn').style.display = 'block';
  } else {
    document.getElementById('login-btn').style.display = 'block';
    document.getElementById('logout-btn').style.display = 'none';
  }
}

// Manejar clic en "Iniciar sesión"
function handleAuthClick() {
  if (!tokenClient) {
    alert('El cliente de autenticación no se ha inicializado correctamente.');
    return;
  }

  if (!accessToken) {
    tokenClient.requestAccessToken();
  } else {
    alert('Ya estás autenticado.');
  }
}

// Manejar clic en "Cerrar sesión"
function handleSignOutClick() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {
      console.log('Cierre de sesión exitoso.');
      alert('Has cerrado sesión correctamente.');
      accessToken = null;
      updateSigninStatus(false);
    });
  } else {
    alert('No hay sesión activa para cerrar.');
  }
}

// Buscar carpeta en Google Drive
async function getFolderId(folderName) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}'+and+mimeType='application/vnd.google-apps.folder'`,
    {
      method: 'GET',
      headers: new Headers({
        Authorization: 'Bearer ' + accessToken,
      }),
    }
  );

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  return null;
}

// Crear carpeta en Google Drive si no existe
async function createFolder(folderName) {
  if (folderNames[folderName]) return folderNames[folderName];

  let folderId = await getFolderId(folderName);
  if (folderId) {
    folderNames[folderName] = folderId;
    return folderId;
  }

  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: new Headers({
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(metadata),
  });

  const data = await response.json();
  folderNames[folderName] = data.id;
  return data.id;
}

// Subir archivo a Google Drive
async function subirArchivo(tipo) {
  const fileInputId =
    tipo === 'Exámenes Médicos'
      ? 'fileExamenes'
      : tipo === 'Visitas Domiciliarias'
      ? 'fileVisitas'
      : 'fileAntecedentes';

  const fileInput = document.getElementById(fileInputId);
  const file = fileInput.files[0];

  if (!file) {
    alert('Por favor selecciona un archivo');
    return;
  }

  const folderId = await createFolder(tipo);

  const metadata = {
    name: file.name,
    mimeType: file.type,
    parents: [folderId],
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', file);

  fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: new Headers({
      Authorization: 'Bearer ' + accessToken,
    }),
    body: form,
  })
    .then((response) => response.json())
    .then((data) => {
      console.log('Archivo subido:', data);
      alert(`Archivo subido correctamente: ${data.name}`);
      agregarFila(tipo, data.name, data.id, data.webViewLink); // Agregar archivo con ID para visualización
      fileInput.value = '';
    })
    .catch((error) => {
      console.error('Error al subir archivo:', error);
      alert('Error al subir archivo.');
    });
}

// Eliminar archivo en Google Drive
async function eliminarArchivo(tipo, id) {
  const tableId =
    tipo === 'Exámenes Médicos'
      ? 'tablaExamenes'
      : tipo === 'Visitas Domiciliarias'
      ? 'tablaVisitas'
      : 'tablaAntecedentes';

  const tabla = $(`#${tableId}`).DataTable();

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
    method: 'DELETE',
    headers: new Headers({
      Authorization: 'Bearer ' + accessToken,
    }),
  });

  if (response.status === 204) {
    alert('Archivo eliminado correctamente');
    const row = tabla.row(`#${id}`);
    row.remove().draw();
  } else {
    alert('Error al eliminar archivo.');
  }
}

// Cargar archivos existentes
async function cargarArchivos() {
  for (const [tipo, folderId] of Object.entries(folderNames)) {
    const id = await createFolder(tipo); // Crear carpeta si no existe
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${id}'+in+parents&fields=files(id,name,webViewLink)`,
      {
        method: 'GET',
        headers: new Headers({
          Authorization: 'Bearer ' + accessToken,
        }),
      }
    );

    const data = await response.json();
    limpiarTabla(tipo); // Limpia la tabla antes de agregar nuevas filas

    if (data.files && data.files.length > 0) {
      data.files.forEach((file) => {
        agregarFila(tipo, file.name, file.id, file.webViewLink);
      });
    }
  }
}

// Limpiar tabla
function limpiarTabla(tipo) {
  const tableId =
    tipo === 'Exámenes Médicos'
      ? 'tablaExamenes'
      : tipo === 'Visitas Domiciliarias'
      ? 'tablaVisitas'
      : 'tablaAntecedentes';

  const tabla = $(`#${tableId}`).DataTable();
  tabla.clear().draw();
}

// Agregar fila a la tabla
function agregarFila(tipo, nombre, id, webViewLink) {
  const tableId =
    tipo === 'Exámenes Médicos'
      ? 'tablaExamenes'
      : tipo === 'Visitas Domiciliarias'
      ? 'tablaVisitas'
      : 'tablaAntecedentes';

  const tabla = $(`#${tableId}`).DataTable();
  const visualizarBtn = `<a href="${webViewLink}" target="_blank" class="btn btn-primary btn-sm">Visualizar</a>`;
  const eliminarBtn = `<button class="btn btn-danger btn-sm" onclick="eliminarArchivo('${tipo}', '${id}')">Eliminar</button>`;
  tabla.row.add([nombre, visualizarBtn, eliminarBtn]).node().id = id;
  tabla.draw();
}

// Cambiar entre secciones
function mostrarSeccion(seccion) {
  document.querySelectorAll('section').forEach((sec) => {
    sec.classList.add('seccion-oculta');
  });
  document.getElementById(seccion).classList.remove('seccion-oculta');
}

// Inicializar la aplicación al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  initGoogleAPI();

  // Inicializar DataTables
  ['tablaExamenes', 'tablaVisitas', 'tablaAntecedentes'].forEach((id) => {
    $(`#${id}`).DataTable({
      columns: [
        { title: 'Nombre' },
        { title: 'Visualizar' },
        { title: 'Eliminar' },
      ],
    });
  });

  // Añadir eventos para botones
  document.getElementById('login-btn').addEventListener('click', handleAuthClick);
  document.getElementById('logout-btn').addEventListener('click', handleSignOutClick);
});

/*
// Configuración de la aplicación Microsoft
const CLIENT_ID = 'b26ebe9f-61f1-45ad-9a89-24f3e94adb11';
const AUTHORITY = 'https://login.microsoftonline.com/common';
const SCOPES = ['Files.Read', 'User.Read'];
let accessToken = null;
let msalInstance;
const folderNames = {
  'Exámenes Médicos': null,
  'Visitas Domiciliarias': null,
  'Consultas de Antecedentes': null,
};

// Inicializar MSAL.js
function initMicrosoftAPI() {
  msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: AUTHORITY,
    },
  });
}

// Manejar inicio de sesión
async function handleAuthClick() {
  try {
    const loginResponse = await msalInstance.loginPopup({ scopes: SCOPES });
    accessToken = loginResponse.accessToken;
    console.log('Token recibido:', accessToken);
    alert('Inicio de sesión exitoso.');
    updateSigninStatus(true);
    cargarArchivos();
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    alert('Error al iniciar sesión.');
  }
}

// Manejar cierre de sesión
function handleSignOutClick() {
  msalInstance.logout();
  accessToken = null;
  updateSigninStatus(false);
  alert('Has cerrado sesión correctamente.');
}

// Actualizar estado de autenticación
function updateSigninStatus(isSignedIn) {
  if (isSignedIn && accessToken) {
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('logout-btn').style.display = 'block';
  } else {
    document.getElementById('login-btn').style.display = 'block';
    document.getElementById('logout-btn').style.display = 'none';
  }
}

// Buscar carpeta en OneDrive
async function getFolderId(folderName) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root/children`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  const folder = data.value.find((item) => item.name === folderName && item.folder);
  return folder ? folder.id : null;
}

// Crear carpeta en OneDrive si no existe
async function createFolder(folderName) {
  if (folderNames[folderName]) return folderNames[folderName];

  let folderId = await getFolderId(folderName);
  if (folderId) {
    folderNames[folderName] = folderId;
    return folderId;
  }

  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root/children`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: folderName, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
  });

  const data = await response.json();
  folderNames[folderName] = data.id;
  return data.id;
}

// Subir archivo a OneDrive
async function subirArchivo(tipo) {
  const fileInputId =
    tipo === 'Exámenes Médicos'
      ? 'fileExamenes'
      : tipo === 'Visitas Domiciliarias'
      ? 'fileVisitas'
      : 'fileAntecedentes';

  const fileInput = document.getElementById(fileInputId);
  const file = fileInput.files[0];

  if (!file) {
    alert('Por favor selecciona un archivo');
    return;
  }

  const folderId = await createFolder(tipo);

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: file,
    }
  );

  const data = await response.json();
  console.log('Archivo subido:', data);
  alert(`Archivo subido correctamente: ${data.name}`);
  agregarFila(tipo, data.name, data.id, data.webUrl);
  fileInput.value = '';
}

// Cargar archivos existentes
async function cargarArchivos() {
  for (const [tipo, folderId] of Object.entries(folderNames)) {
    const id = await createFolder(tipo);
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${id}/children`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = await response.json();
    limpiarTabla(tipo);

    if (data.value && data.value.length > 0) {
      data.value.forEach((file) => {
        agregarFila(tipo, file.name, file.id, file.webUrl);
      });
    }
  }
}

// Limpiar tabla
function limpiarTabla(tipo) {
  const tableId =
    tipo === 'Exámenes Médicos'
      ? 'tablaExamenes'
      : tipo === 'Visitas Domiciliarias'
      ? 'tablaVisitas'
      : 'tablaAntecedentes';

  const tabla = $(`#${tableId}`).DataTable();
  tabla.clear().draw();
}

// Agregar fila a la tabla
function agregarFila(tipo, nombre, id, webUrl) {
  const tableId =
    tipo === 'Exámenes Médicos'
      ? 'tablaExamenes'
      : tipo === 'Visitas Domiciliarias'
      ? 'tablaVisitas'
      : 'tablaAntecedentes';

  const tabla = $(`#${tableId}`).DataTable();
  const visualizarBtn = `<a href="${webUrl}" target="_blank" class="btn btn-primary btn-sm">Visualizar</a>`;
  const eliminarBtn = `<button class="btn btn-danger btn-sm" onclick="eliminarArchivo('${tipo}', '${id}')">Eliminar</button>`;
  tabla.row.add([nombre, visualizarBtn, eliminarBtn]).node().id = id;
  tabla.draw();
}

// Inicializar la aplicación al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  initMicrosoftAPI();

  // Inicializar DataTables
  ['tablaExamenes', 'tablaVisitas', 'tablaAntecedentes'].forEach((id) => {
    $(`#${id}`).DataTable({
      columns: [
        { title: 'Nombre' },
        { title: 'Visualizar' },
        { title: 'Eliminar' },
      ],
    });
  });

  // Añadir eventos para botones
  document.getElementById('login-btn').addEventListener('click', handleAuthClick);
  document.getElementById('logout-btn').addEventListener('click', handleSignOutClick);
});
*/