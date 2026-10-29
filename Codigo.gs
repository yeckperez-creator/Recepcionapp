/**
 * Recepción con escáner → Google Drive
 *
 * Cada recepción que se termina en la app llega aquí y queda guardada en esta hoja de Google:
 *   - Pestaña "Recepciones": una fila por recepción, con tiempos y conteo de errores.
 *   - Pestaña "Diferencias": una fila por cada faltante, sobrante, producto fuera de la hoja o cesta no recibida.
 *   - Carpeta "Recepciones (app)" en tu Drive: el Excel completo de cada recepción.
 * Si una recepción se termina otra vez (porque se corrigió), se reemplaza la anterior.
 *
 * Cómo instalarlo: Extensiones > Apps Script, pega este código, guarda y publícalo como
 * "Aplicación web" (Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario).
 */
const CLAVE = 'rcp1';                    // debe ser igual a DRIVE_KEY en la app
const CARPETA = 'Recepciones (app)';

const COLS = [
  ['id', 'ID'], ['enviado', 'Guardado'], ['sup', 'Recibe'], ['tienda', 'Tienda'], ['tipo', 'Tipo'],
  ['nombre', 'Recepción'], ['orden', 'Orden de entrega'], ['fechaNota', 'Fecha de la nota'],
  ['inicio', 'Inicio'], ['fin', 'Fin'], ['minAct', 'Minutos activos'], ['minTot', 'Minutos de inicio a fin'],
  ['lineas', 'Líneas de bultos'], ['bultosEsp', 'Bultos esperados'], ['bultosRec', 'Bultos recibidos'],
  ['lineasOk', 'Líneas completas'], ['lineasFalt', 'Líneas con faltante'], ['bultosFalt', 'Bultos faltantes'],
  ['lineasSob', 'Líneas con sobrante'], ['bultosSob', 'Bultos sobrantes'], ['noHoja', 'Escaneos fuera de la hoja'],
  ['cestasEsp', 'Cestas esperadas'], ['cestasRec', 'Cestas recibidas'], ['cestasFalt', 'Cestas no recibidas'],
  ['cam', 'Registros con cámara'], ['man', 'Registros a mano'], ['undo', 'Correcciones'], ['archivo', 'Excel']
];
const DCOLS = ['ID', 'Fin', 'Recibe', 'Tienda', 'Recepción', 'Tipo de diferencia', 'Contenedor', 'Ítem',
  'Descripción', 'Esperado', 'Recibido', 'Diferencia'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.k !== CLAVE) return salida({ ok: false, error: 'clave' });
    if (!d.id) return salida({ ok: false, error: 'sin id' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rec = hoja(ss, 'Recepciones', COLS.map(c => c[1]));
    const dif = hoja(ss, 'Diferencias', DCOLS);

    borrar(rec, d.id, true);
    borrar(dif, d.id, false);

    let url = '';
    if (d.xlsx) {
      const blob = Utilities.newBlob(Utilities.base64Decode(d.xlsx),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', d.file || ('Recepcion ' + d.id + '.xlsx'));
      url = carpeta().createFile(blob).getUrl();
    }
    d.enviado = new Date();
    d.archivo = url;
    rec.appendRow(COLS.map(c => valor(d[c[0]])));

    const fin = d.fin ? new Date(d.fin) : new Date();
    const filas = (d.dif || []).map(x => [d.id, fin, d.sup || '', d.tienda || '', d.nombre || '', x.tipo || '',
      texto(x.cont), texto(x.item), x.desc || '', num(x.esp), num(x.rec), num(x.dif)]);
    if (filas.length) dif.getRange(dif.getLastRow() + 1, 1, filas.length, DCOLS.length).setValues(filas);

    return salida({ ok: true, url: url });
  } catch (err) {
    return salida({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* Para comprobar que está publicado: abre la URL en el navegador y debe decir {"ok":true,...} */
function doGet() {
  return salida({ ok: true, app: 'recepcion' });
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function hoja(ss, nombre, encabezados) {
  let s = ss.getSheetByName(nombre);
  if (!s) {
    s = ss.insertSheet(nombre);
    s.appendRow(encabezados);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
  }
  return s;
}

/* Quita las filas de una recepción que ya estaba guardada (y manda su Excel viejo a la papelera) */
function borrar(s, id, conArchivo) {
  const n = s.getLastRow();
  if (n < 2) return;
  const ancho = conArchivo ? s.getLastColumn() : 1;
  const datos = s.getRange(2, 1, n - 1, ancho).getValues();
  for (let i = datos.length - 1; i >= 0; i--) {
    if (String(datos[i][0]) !== String(id)) continue;
    if (conArchivo) {
      const m = String(datos[i][ancho - 1] || '').match(/\/d\/([\w-]+)/);
      if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) {} }
    }
    s.deleteRow(i + 2);
  }
}

function carpeta() {
  const it = DriveApp.getFoldersByName(CARPETA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA);
}

/* Los códigos largos se guardan como texto para que la hoja no les quite los ceros ni los convierta */
function texto(v) {
  if (v == null || v === '') return '';
  v = String(v);
  return /^\d+$/.test(v) ? "'" + v : v;
}
function num(v) {
  const n = Number(v);
  return isNaN(n) ? (v == null ? '' : v) : n;
}
function valor(v) {
  if (v == null) return '';
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return new Date(v);
  if (typeof v === 'string' && /^\d{6,}$/.test(v)) return "'" + v;
  if (typeof v === 'string' && /^\d\d\/\d\d\/\d{4}$/.test(v)) return "'" + v;
  return v;
}
