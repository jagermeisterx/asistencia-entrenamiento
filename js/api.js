/**
 * api.js — comunicación con el backend (Google Apps Script) + cola offline.
 *
 * - Escritura: POST con Content-Type text/plain (evita el preflight CORS
 *   que Apps Script no soporta; el body JSON llega como texto).
 * - Lectura: JSONP (script tag) porque las redirecciones de GET en Apps
 *   Script rompen el CORS tradicional. Todas las lecturas envían el PIN
 *   como parámetro `ch` para que el servidor las autorice.
 * - Cola offline: si el envío falla, la asistencia queda en localStorage
 *   y se reenvía automáticamente cuando vuelve la conexión.
 */
const Api = (() => {
  "use strict";

  const CLAVE_COLA = "asistencia.cola.v1";

  /** Envía una asistencia. En modo demo solo la registra localmente. */
  async function guardar(payload) {
    if (!CONFIG.SCRIPT_URL) {
      const demo = JSON.parse(localStorage.getItem("asistencia.demo.v1") || "[]");
      demo.push(payload);
      localStorage.setItem("asistencia.demo.v1", JSON.stringify(demo.slice(-50)));
      return { ok: true, accion: "demo" };
    }
    const resp = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const datos = await resp.json();
    if (!datos.ok) throw new Error(datos.error || "Error del servidor");
    return datos;
  }

  /** Llamada de lectura vía JSONP (?action=...&ch=PIN&callback=cb). */
  function jsonp(accion, params) {
    return new Promise((resolve, reject) => {
      if (!CONFIG.SCRIPT_URL) {
        return reject(new Error("Modo demostración: sin backend conectado"));
      }
      const nombre = "__asis_cb_" + Math.random().toString(36).slice(2);
      const url = new URL(CONFIG.SCRIPT_URL);
      url.searchParams.set("action", accion);
      url.searchParams.set("ch", CONFIG.PIN || "");
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
      });
      url.searchParams.set("callback", nombre);

      const script = document.createElement("script");
      const limpiar = () => {
        clearTimeout(temporizador);
        delete window[nombre];
        script.remove();
      };
      const temporizador = setTimeout(() => {
        limpiar();
        reject(new Error("Sin respuesta del servidor"));
      }, 20000);

      window[nombre] = (datos) => {
        limpiar();
        if (datos && datos.ok) resolve(datos);
        else reject(new Error((datos && datos.error) || "Error del servidor"));
      };
      script.onerror = () => {
        limpiar();
        reject(new Error("No se pudo contactar con el servidor"));
      };
      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  const historial = (categoria, limite) => jsonp("historial", { categoria, limite });
  const detalle = (fecha, categoria) => jsonp("detalle", { fecha, categoria });
  const estadisticas = (categoria) => jsonp("estadisticas", { categoria });

  // ---------------------------------------------------------- cola offline

  function leerCola() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_COLA)) || [];
    } catch {
      return [];
    }
  }

  function agregarACola(payload) {
    const cola = leerCola();
    cola.push(payload);
    localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
    return cola.length;
  }

  /** Reenvía la cola en orden. Usa overwrite para que sea idempotente. */
  async function procesarCola() {
    const cola = leerCola();
    if (!cola.length) return { enviadas: 0, restantes: 0 };

    const restantes = [];
    let enviadas = 0;
    for (const payload of cola) {
      try {
        await guardar({ ...payload, overwrite: true });
        enviadas++;
      } catch {
        restantes.push(payload);
      }
    }
    localStorage.setItem(CLAVE_COLA, JSON.stringify(restantes));
    return { enviadas, restantes: restantes.length };
  }

  return {
    guardar,
    historial,
    detalle,
    estadisticas,
    leerCola,
    agregarACola,
    procesarCola,
  };
})();
