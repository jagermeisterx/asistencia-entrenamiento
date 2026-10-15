/**
 * ============================================================================
 *  Backend de asistencia — Google Apps Script
 * ============================================================================
 *  Recibe la asistencia desde la app web (GitHub Pages) y la guarda en la
 *  hoja de cálculo. Ver SETUP.md para la guía de instalación paso a paso.
 *
 *  Acciones:
 *    GET  ?action=ping                                 → prueba de conexión
 *    GET  ?action=historial&ch=HASH&categoria=&limite= → sesiones (resumen)
 *    GET  ?action=detalle&ch=HASH&fecha=&categoria=    → jugadores de 1 sesión
 *    GET  ?action=estadisticas&ch=HASH&categoria=      → % asistencia por jugador
 *    POST { action:'save', code:'PIN', ... }           → guarda/reemplaza lista
 *
 *  Nota: las lecturas envían `ch` = PIN de acceso para validar.
 * ============================================================================
 */

const SHEET_NAME = 'ASISTENCIA';
const HEADERS = ['FECHA', 'CATEGORIA', 'JUGADOR', 'RUT', 'ESTADO', 'REGISTRADO_POR', 'TIMESTAMP'];

// PIN de acceso en texto plano. Debe coincidir con CONFIG.PIN de la app
// (js/config.js). Cámbialo en ambos lados y despliega una nueva versión
// desde Implementar → Administrar implementaciones (ver SETUP.md).
const CODE_PIN = 'SAESA2026';

// ------------------------------------------------------------------ helpers

function codigoValido(pin) {
  return Boolean(pin) && String(pin) === CODE_PIN;
}

function hashValido(ch) {
  return Boolean(ch) && String(ch) === CODE_PIN;
}

function getSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(SHEET_NAME);
  if (!hoja) {
    hoja = ss.insertSheet(SHEET_NAME);
    hoja.appendRow(HEADERS);
    hoja.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    hoja.setColumnWidth(1, 90);   // FECHA
    hoja.setColumnWidth(2, 120);  // CATEGORIA
    hoja.setColumnWidth(3, 260);  // JUGADOR
    hoja.setColumnWidth(4, 110);  // RUT
    hoja.setColumnWidth(5, 80);   // ESTADO
    hoja.setColumnWidth(6, 180);  // REGISTRADO_POR
    hoja.setColumnWidth(7, 150);  // TIMESTAMP
    hoja.getRange(1, 1, 1000, 1).setNumberFormat('@'); // FECHA como texto
  }
  return hoja;
}

function responder(datos, callback) {
  const json = JSON.stringify(datos);
  const salida = callback
    ? callback + '(' + json + ')'
    : json;
  return ContentService.createTextOutput(salida)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function errorRespuesta(mensaje, callback) {
  return responder({ ok: false, error: String(mensaje) }, callback);
}

function esFechaISO(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''));
}

function textoSeguro(valor, max) {
  return String(valor == null ? '' : valor).trim().substring(0, max || 120);
}

// ------------------------------------------------------------------ ESCRITURA

function doPost(e) {
  let datos;
  try {
    datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return errorRespuesta('JSON inválido');
  }

  if (datos.action !== 'save') return errorRespuesta('Acción no soportada');
  if (!codigoValido(datos.code)) return errorRespuesta('Código de acceso incorrecto');
  if (!esFechaISO(datos.fecha)) return errorRespuesta('Fecha inválida');
  if (!datos.categoria_nombre) return errorRespuesta('Falta la categoría');

  const presentes = Array.isArray(datos.presentes) ? datos.presentes : [];
  const ausentes = Array.isArray(datos.ausentes) ? datos.ausentes : [];
  if (presentes.length + ausentes.length === 0) return errorRespuesta('Lista vacía');

  const registro = textoSeguro(datos.registrado_por, 120) || '—';
  const timestamp = new Date().toISOString();
  const categoria = textoSeguro(datos.categoria_nombre, 60);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    const hoja = getSheet();
    const ultima = hoja.getLastRow();
    let accion = 'creado';

    // Upsert: si ya existe una lista para esa FECHA+CATEGORÍA, se reemplaza
    if (ultima > 1) {
      const claves = hoja.getRange(2, 1, ultima - 1, 2).getValues();
      const borrar = [];
      for (let i = claves.length - 1; i >= 0; i--) {
        if (String(claves[i][0]) === datos.fecha && String(claves[i][1]) === categoria) {
          borrar.push(i + 2);
        }
      }
      if (borrar.length) {
        borrar.forEach(f => hoja.deleteRow(f));
        accion = 'reemplazado';
      }
    }

    const filas = [];
    presentes.forEach(j => filas.push([
      datos.fecha, categoria, textoSeguro(j.nombre, 120),
      textoSeguro(j.rut, 20), 'Presente', registro, timestamp
    ]));
    ausentes.forEach(j => filas.push([
      datos.fecha, categoria, textoSeguro(j.nombre, 120),
      textoSeguro(j.rut, 20), 'Ausente', registro, timestamp
    ]));

    if (filas.length) hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, HEADERS.length).setValues(filas);

    return responder({
      ok: true,
      accion: accion,
      escritos: filas.length,
      presentes: presentes.length,
      ausentes: ausentes.length,
      fecha: datos.fecha,
      categoria: categoria
    });
  } catch (err) {
    return errorRespuesta('Error al guardar: ' + err);
  } finally {
    try { lock.releaseLock(); } catch (ignorar) { }
  }
}

// ------------------------------------------------------------------ LECTURA

function leerRegistros(filtro) {
  const hoja = getSheet();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  const valores = hoja.getRange(2, 1, ultima - 1, HEADERS.length).getValues();
  return valores
    .map(f => ({
      fecha: String(f[0]), categoria: String(f[1]), jugador: String(f[2]),
      rut: String(f[3]), estado: String(f[4]), registrado_por: String(f[5]),
      timestamp: String(f[6])
    }))
    .filter(r => r.fecha && (!filtro || filtro(r)));
}

/** Resumen de sesiones: agrupa por FECHA+CATEGORÍA (más recientes primero). */
function accionHistorial(par) {
  const categoria = textoSeguro(par.categoria, 60);
  const limite = Math.min(parseInt(par.limite, 10) || 40, 200);
  const registros = leerRegistros(r => !categoria || r.categoria === categoria);

  const sesiones = {};
  registros.forEach(r => {
    const clave = r.fecha + '|' + r.categoria;
    if (!sesiones[clave]) {
      sesiones[clave] = {
        fecha: r.fecha, categoria: r.categoria, presentes: 0, total: 0,
        registrado_por: r.registrado_por
      };
    }
    sesiones[clave].total++;
    if (r.estado === 'Presente') sesiones[clave].presentes++;
  });

  const lista = Object.keys(sesiones)
    .map(k => sesiones[k])
    .sort((a, b) => (b.fecha + b.categoria).localeCompare(a.fecha + a.categoria))
    .slice(0, limite);

  return { ok: true, sesiones: lista };
}

/** Detalle de una sesión: jugadores con su estado. */
function accionDetalle(par) {
  if (!esFechaISO(par.fecha)) return { ok: false, error: 'Fecha inválida' };
  const registros = leerRegistros(
    r => r.fecha === String(par.fecha) && r.categoria === textoSeguro(par.categoria, 60)
  );
  return {
    ok: true,
    fecha: par.fecha,
    categoria: textoSeguro(par.categoria, 60),
    jugadores: registros
      .map(r => ({ nombre: r.jugador, rut: r.rut, estado: r.estado }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  };
}

/** % de asistencia por jugador en un período (por defecto últimos 365 días). */
function accionEstadisticas(par) {
  const categoria = textoSeguro(par.categoria, 60);
  const dias = Math.min(parseInt(par.dias, 10) || 365, 1095);
  const desde = new Date(Date.now() - dias * 86400000).toISOString().substring(0, 10);

  const registros = leerRegistros(
    r => r.fecha >= desde && (!categoria || r.categoria === categoria)
  );
  const porJugador = {};
  let sesionesTotales = 0;
  const vistas = {};

  registros.forEach(r => {
    const claveSesion = r.fecha + '|' + r.categoria;
    if (!vistas[claveSesion]) { vistas[claveSesion] = true; sesionesTotales++; }
    const clave = r.rut || r.jugador;
    if (!porJugador[clave]) {
      porJugador[clave] = { nombre: r.jugador, rut: r.rut, presentes: 0, sesiones: 0 };
    }
    porJugador[clave].sesiones++;
    if (r.estado === 'Presente') porJugador[clave].presentes++;
  });

  const jugadores = Object.keys(porJugador)
    .map(k => {
      const j = porJugador[k];
      j.pct = j.sesiones ? Math.round((100 * j.presentes) / j.sesiones) : 0;
      return j;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return { ok: true, categoria: categoria, desde: desde, sesiones: sesionesTotales, jugadores: jugadores };
}

function doGet(e) {
  const par = (e && e.parameter) || {};
  const callback = textoSeguro(par.callback, 60).replace(/[^\w.$]/g, '');

  try {
    if (par.action === 'ping') {
      // No valida el PIN (evita el PIN en URLs de GET); solo prueba el backend.
      getSheet();
      return responder({ ok: true, hora: new Date().toISOString(), backend: 'asistencia' }, callback);
    }
    if (!hashValido(par.ch)) return errorRespuesta('Código de acceso incorrecto', callback);

    switch (par.action) {
      case 'historial': return responder(accionHistorial(par), callback);
      case 'detalle': return responder(accionDetalle(par), callback);
      case 'estadisticas': return responder(accionEstadisticas(par), callback);
      default: return errorRespuesta('Acción no soportada', callback);
    }
  } catch (err) {
    return errorRespuesta('Error: ' + err, callback);
  }
}

// ------------------------------------------------------------------ SETUP

/** Ejecuta esta función una vez desde el editor para crear/formatear la hoja. */
function setup() {
  const hoja = getSheet();
  Logger.log('Hoja «%s» lista. Encabezados: %s', SHEET_NAME, HEADERS.join(' | '));
  return hoja.getName();
}
