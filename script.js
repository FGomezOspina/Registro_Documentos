/******************************
 * script.js
 ******************************/
// Configuración de la aplicación Google
const CLIENT_ID =
  '185434111940-8gsma18aau8fd6lqqa9k0njbdvuuhc0p.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let tokenClient; // Cliente GIS para manejar tokens
let accessToken = null;

// Para saber a qué sección (tipo) pertenece la subida actual
let tipoDocumentoActual = null;

// Objeto para almacenar los folderIds
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

/********************************************************
 * 1. Función para abrir el modal y establecer el tipo
 ********************************************************/
function abrirModal(tipo) {
  tipoDocumentoActual = tipo; // Guardamos el tipo en una variable global
  // Limpiamos los campos del modal
  document.getElementById('fechaSubida').value = '';
  document.getElementById('tiempoRecordatorio').value = '';
  document.getElementById('fileInputModal').value = '';
  // Abrimos el modal con Bootstrap
  const modal = new bootstrap.Modal(document.getElementById('uploadModal'), {
    keyboard: false,
  });
  modal.show();
}

/********************************************************
 * 2. Función que se ejecuta al hacer clic en "Subir" dentro del modal
 ********************************************************/
async function handleSubirArchivo() {
  // Obtener valores del modal
  const fecha = document.getElementById('fechaSubida').value;
  const recordatorio = document.getElementById('tiempoRecordatorio').value;
  const fileInput = document.getElementById('fileInputModal');
  const file = fileInput.files[0];

  if (!fecha || !recordatorio || !file) {
    alert('Por favor completa todos los campos y selecciona un archivo.');
    return;
  }

  // Aquí podrías hacer algo con "recordatorio" si necesitas guardarlo,
  // p. ej. enviarlo también como parte del metadata (usando la descripción).
  // Llamamos a la misma función subirArchivo pero le pasamos la fecha:
  subirArchivo(tipoDocumentoActual, fecha);

  // Cerramos el modal manualmente
  const modal = bootstrap.Modal.getInstance(document.getElementById('uploadModal'));
  modal.hide();
}

/********************************************************
 * 3. Subir archivo a Google Drive
 *    Se modifica para recibir la fecha como parámetro
 ********************************************************/
async function subirArchivo(tipo, fecha) {
  // Obtenemos el archivo desde el modal
  const file = document.getElementById('fileInputModal').files[0];
  if (!file) {
    alert('Por favor selecciona un archivo');
    return;
  }

  // Creamos/cargamos carpeta
  const folderId = await createFolder(tipo);

  // EJEMPLO: podemos guardar la fecha en la propiedad "description" del archivo
  // para recuperarla luego en la list. Dependerá de tu implementación
  const metadata = {
    name: file.name,
    mimeType: file.type,
    parents: [folderId],
    description: fecha, // Guardar la fecha en la descripción
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
      // data.description contendrá la fecha si la guardamos
      // data.webViewLink NO la tenemos de manera predeterminada a menos que
      // usemos ?fields=id,name,webViewLink,description en la creación
      // Para simplificar, recargaremos la tabla
      // O bien, podemos llamar a agregarFila con la info que tenemos:
      // OJO: la API de subida no siempre devuelve webViewLink directo.
      // Podemos forzar un nuevo fetch o suponer que data.id es suficiente.
      obtenerInfoArchivo(tipo, data.id, file.name, fecha);
      // Limpieza de inputs:
      document.getElementById('fileInputModal').value = '';
    })
    .catch((error) => {
      console.error('Error al subir archivo:', error);
      alert('Error al subir archivo.');
    });
}

/********************************************************
 * 4. Obtener info adicional del archivo (webViewLink) y actualizar tabla
 ********************************************************/
async function obtenerInfoArchivo(tipo, fileId, fileName, fecha) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,webViewLink,description`,
      {
        method: 'GET',
        headers: new Headers({
          Authorization: 'Bearer ' + accessToken,
        }),
      }
    );
    const data = await response.json();
    // Llamamos a la función para agregar la fila
    agregarFila(tipo, data.name, data.id, data.webViewLink, data.description || fecha);
  } catch (error) {
    console.error('Error al obtener info del archivo:', error);
    // Si falla, al menos agregamos la fila con la info mínima
    agregarFila(tipo, fileName, fileId, '', fecha);
  }
}

/********************************************************
 * 5. Crear carpeta en Google Drive si no existe
 ********************************************************/
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

/********************************************************
 * 6. Cargar archivos existentes (con fecha en description)
 ********************************************************/
async function cargarArchivos() {
  for (const [tipo, folderId] of Object.entries(folderNames)) {
    const id = await createFolder(tipo); // Crear carpeta si no existe
    // Agregar description al fields para obtener la fecha guardada
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${id}'+in+parents&fields=files(id,name,webViewLink,description)`,
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
        // file.description será la fecha si así lo guardamos
        agregarFila(tipo, file.name, file.id, file.webViewLink, file.description);
      });
    }
  }
}

/********************************************************
 * 7. Agregar fila a la tabla (con columna Fecha)
 ********************************************************/
function agregarFila(tipo, nombre, id, webViewLink, fecha) {
  const tableId =
    tipo === 'Exámenes Médicos'
      ? 'tablaExamenes'
      : tipo === 'Visitas Domiciliarias'
      ? 'tablaVisitas'
      : 'tablaAntecedentes';

  const tabla = $(`#${tableId}`).DataTable();

  // Botón para visualizar
  let visualizarBtn = '';
  if (webViewLink) {
    visualizarBtn = `<a href="${webViewLink}" target="_blank" class="btn btn-primary btn-sm">Visualizar</a>`;
  } else {
    visualizarBtn =
      '<button class="btn btn-secondary btn-sm" disabled>No disponible</button>';
  }

  // Botón para eliminar
  const eliminarBtn = `<button class="btn btn-danger btn-sm" onclick="eliminarArchivo('${tipo}', '${id}')">Eliminar</button>`;

  // Agregamos la fila con la nueva columna 'Fecha'
  // El orden de columnas en DataTable debe coincidir con tu configuración en el init
  tabla.row.add([nombre, fecha || '', visualizarBtn, eliminarBtn]).node().id = id;
  tabla.draw();
}

/********************************************************
 * 8. Limpiar tabla
 ********************************************************/
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

/********************************************************
 * 9. Eliminar archivo en Google Drive
 ********************************************************/
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

/********************************************************
 * 10. Cambiar entre secciones
 ********************************************************/
function mostrarSeccion(seccion) {
  document.querySelectorAll('section').forEach((sec) => {
    sec.classList.add('seccion-oculta');
  });
  document.getElementById(seccion).classList.remove('seccion-oculta');
}

/********************************************************
 * 11. Inicializar la aplicación al cargar la página
 ********************************************************/
document.addEventListener('DOMContentLoaded', () => {
  initGoogleAPI();

  // Inicializar DataTables con la nueva columna "Fecha"
  // Recuerda que el orden de columns[] debe coincidir con el orden en agregarFila()
  ['tablaExamenes', 'tablaVisitas', 'tablaAntecedentes'].forEach((id) => {
    $(`#${id}`).DataTable({
      columns: [
        { title: 'Nombre' },
        { title: 'Fecha' },
        { title: 'Visualizar' },
        { title: 'Eliminar' },
      ],
    });
  });

  // Añadir eventos para botones de autenticación
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