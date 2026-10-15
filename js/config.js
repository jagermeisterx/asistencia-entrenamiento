/**
 * Configuración de la app.
 *
 * SCRIPT_URL: URL de tu app web desplegada en Google Apps Script (termina en /exec).
 * PIN: código de acceso para los entrenadores. Debe coincidir con CODE_PIN
 *      en apps-script/Code.gs.
 *
 * Mientras SCRIPT_URL esté vacío, la app funciona en modo demostración
 * (la asistencia no se envía a Google Sheets).
 */
const CONFIG = {
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyK2zU4dVNGudZB5tuMgnJitTfuF_k-MiFLkTj_WfcXPqc6kyJxKDFUQ-j-8T-qBYn4Hg/exec",
  PIN: "SAESA2026",
  APP_VERSION: "1.1.0",
};
