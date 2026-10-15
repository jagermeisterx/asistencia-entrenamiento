/**
 * app.js — lógica de la aplicación de asistencia.
 *
 * Vistas (enrutadas por hash):
 *   #/                  inicio con las categorías
 *   #/lista/<categoria> pasar la lista (marcar presentes/ausentes)
 *   #/historial         sesiones registradas + % por jugador
 *   #/detalle/<fecha>/<categoria>  detalle de una sesión
 */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const CLAVE_CODE = "asistencia.code.v1";

  const state = {
    roster: null,
    catId: null,
    fecha: hoyISO(),
    marcados: new Map(), // clave jugador → true (presente) | false (ausente) | null
    guardando: false,
    sucio: false,
    tab: "sesiones",
    filtroCat: "",
    semanaCat: null,
    semanaLunesISO: null,
    semanaModelo: null,
  };

  const ICONOS_CAT = { adulto: "🏆", u17: "🥇", u15: "🎯", u13: "🌱" };

  // ───────────────────────────────────────────────────────── utilidades

  function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function esc(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fmtFecha(iso, largo = false) {
    const [y, m, d] = String(iso).split("-").map(Number);
    if (!y) return iso;
    const f = new Date(y, m - 1, d);
    return f.toLocaleDateString("es-CL", largo
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "short", day: "numeric", month: "short" });
  }

  let temporizadorToast = null;
  function toast(mensaje, tipo = "ok", ms = 2800) {
    const el = $("#toast");
    el.textContent = mensaje;
    el.className = `toast toast-${tipo}`;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => el.classList.add("oculta"), ms);
  }

  function credencial() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_CODE));
    } catch {
      return null;
    }
  }

  const claveJugador = (j) => j.rut_normalizado || j.nombre.toUpperCase();
  const categoria = () => state.roster?.categorias.find((c) => c.id === state.catId);
  const escapear = (s) =>
    window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&");

  // ───────────────────────────────────────────────────────── enrutador

  const VISTAS = ["v-login", "v-inicio", "v-lista", "v-historial", "v-detalle", "v-semana"];

  function mostrar(id) {
    VISTAS.forEach((v) => $("#" + v).classList.toggle("oculta", v !== id));
    window.scrollTo(0, 0);
  }

  function navegar(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function render() {
    if (!state.roster) return; // aún cargando
    const cred = credencial();
    // Pide PIN si no hay sesión, o si el PIN guardado ya no coincide
    if (!cred || (CONFIG.PIN && cred.pin !== CONFIG.PIN)) {
      mostrar("v-login");
      return;
    }
    const ruta = location.hash || "#/";
    if (ruta.startsWith("#/lista/")) {
      renderLista(decodeURIComponent(ruta.slice(8)));
      return mostrar("v-lista");
    }
    if (ruta.startsWith("#/detalle/")) {
      const [fecha, cat] = ruta.slice(10).split("/").map(decodeURIComponent);
      renderDetalle(fecha, cat);
      return mostrar("v-detalle");
    }
    if (ruta.startsWith("#/semana/")) {
      renderSemana(decodeURIComponent(ruta.slice(9)));
      return mostrar("v-semana");
    }
    if (ruta === "#/historial") {
      renderHistorial();
      return mostrar("v-historial");
    }
    renderInicio();
    mostrar("v-inicio");
  }

  // ───────────────────────────────────────────────────────── login

  async function intentarLogin(pin) {
    if (!pin) throw new Error("Ingresa el código de acceso");
    if (!CONFIG.PIN) {
      if (CONFIG.SCRIPT_URL) {
        throw new Error("Falta configurar el PIN: revisa SETUP.md y js/config.js");
      }
      // Modo demostración: cualquier código abre la app
      localStorage.setItem(CLAVE_CODE, JSON.stringify({ pin }));
      return;
    }
    if (pin !== CONFIG.PIN) {
      throw new Error("Código incorrecto. Inténtalo de nuevo.");
    }
    localStorage.setItem(CLAVE_CODE, JSON.stringify({ pin }));
  }

  function bindLogin() {
    $("#form-login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = $("#login-error");
      errorEl.classList.add("oculta");
      try {
        await intentarLogin($("#input-pin").value.trim());
        $("#input-pin").value = "";
        navegar("#/");
        render();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove("oculta");
      }
    });
  }

  // ───────────────────────────────────────────────────────── inicio

  function renderInicio() {
    const { club, anio } = state.roster;
    $("#inicio-club").textContent = club;
    $("#inicio-subtitulo").textContent = `${state.roster.categorias.length} categorías · Temporada ${anio ?? ""}`.trim();
    $("#demo-banner").classList.toggle("oculta", Boolean(CONFIG.SCRIPT_URL));

    $("#categorias").innerHTML = state.roster.categorias
      .map((c) => {
        const entrenador = c.cuerpo_tecnico.find((t) => t.rol === "Entrenador");
        return `
        <div class="tarjeta-cat" data-cat="${esc(c.id)}" role="button" tabindex="0">
          <span class="tarjeta-cat-ico">${ICONOS_CAT[c.id] || "⚽"}</span>
          <span class="tarjeta-cat-datos">
            <span class="tarjeta-cat-nombre">${esc(c.nombre)}</span>
            <span class="suave">${esc(c.rango_edades || anio || "")}</span>
            <span class="suave2">${c.jugadores.length} jugadores${entrenador ? " · " + esc(entrenador.nombre) : ""}</span>
          </span>
          <button class="icono-share" data-semana="${esc(c.id)}" title="Resumen semanal para compartir">📤</button>
          <span class="flecha">›</span>
        </div>`;
      })
      .join("");
  }

  // ───────────────────────────────────────────────────────── pasar lista

  function renderLista(catId) {
    const cat = state.roster.categorias.find((c) => c.id === catId);
    if (!cat) return navegar("#/");

    if (state.catId !== catId) {
      state.catId = catId;
      state.marcados = new Map(cat.jugadores.map((j) => [claveJugador(j), null]));
      state.sucio = false;
    }

    $("#lista-titulo").textContent = cat.nombre;
    $("#lista-fecha").value = state.fecha;
    $("#lista-buscar").value = "";
    const guardador = localStorage.getItem(`asistencia.registrador.${catId}`);
    $("#input-registrador").value = guardador ?? cat.cuerpo_tecnico.find((t) => t.rol === "Entrenador")?.nombre ?? "";

    pintarFilas("");
    actualizarContador();
    restaurarBotonGuardar();
  }

  function pintarFilas(busqueda) {
    const cat = categoria();
    const texto = busqueda.trim().toLowerCase();
    const visibles = cat.jugadores.filter(
      (j) => !texto || j.nombre.toLowerCase().includes(texto) || j.rut.toLowerCase().includes(texto)
    );

    $("#lista-jugadores").innerHTML = visibles.length
      ? visibles.map(filaJugador).join("")
      : `<p class="vacio">Ningún jugador coincide con «${esc(busqueda)}»</p>`;
  }

  function filaJugador(j) {
    const clave = claveJugador(j);
    const estado = state.marcados.get(clave);
    const clase = estado === true ? "presente" : estado === false ? "ausente" : "";
    const marca = estado === true ? "✓" : estado === false ? "✗" : "·";
    const aviso = j.avisos.length ? `<span class="aviso" title="${esc(j.avisos.join(" · "))}">⚠</span>` : "";
    return `
      <button class="fila-jugador ${clase}" data-clave="${esc(clave)}">
        <span class="marca">${marca}</span>
        <span class="fila-datos">
          <span class="fila-nombre">${esc(j.nombre)} ${aviso}</span>
          <span class="fila-meta">${esc(j.rut || "RUT sin registrar")}${j.clasificacion ? " · " + esc(j.clasificacion) : ""}</span>
        </span>
      </button>`;
  }

  function alternar(clave) {
    const actual = state.marcados.get(clave);
    state.marcados.set(clave, actual === true ? false : true);
    state.sucio = true;
    const fila = $(`.fila-jugador[data-clave="${escapear(clave)}"]`);
    if (fila) {
      const nuevo = state.marcados.get(clave);
      fila.classList.toggle("presente", nuevo === true);
      fila.classList.toggle("ausente", nuevo === false);
      fila.querySelector(".marca").textContent = nuevo === true ? "✓" : nuevo === false ? "✗" : "·";
    }
    actualizarContador();
    restaurarBotonGuardar(true);
  }

  function actualizarContador() {
    const cat = categoria();
    if (!cat) return;
    let presentes = 0;
    let sinMarcar = 0;
    cat.jugadores.forEach((j) => {
      const m = state.marcados.get(claveJugador(j));
      if (m === true) presentes++;
      else if (m == null) sinMarcar++;
    });
    const el = $("#lista-contador");
    el.innerHTML = `<strong>${presentes}</strong>/${cat.jugadores.length} presentes${sinMarcar ? ` · <span class="aviso-contador">${sinMarcar} sin marcar</span>` : ""}`;
  }

  function marcarTodos(valor) {
    const cat = categoria();
    cat.jugadores.forEach((j) => state.marcados.set(claveJugador(j), valor));
    state.sucio = true;
    pintarFilas($("#lista-buscar").value);
    actualizarContador();
    restaurarBotonGuardar(true);
  }

  function restaurarBotonGuardar(modificado = false) {
    const btn = $("#btn-guardar");
    if (state.guardando) return;
    if (modificado || state.sucio) {
      btn.disabled = false;
      btn.textContent = "Guardar asistencia";
      btn.classList.remove("btn-ok");
    }
  }

  async function guardarAsistencia() {
    const cat = categoria();
    if (!cat || state.guardando) return;

    const presentes = [];
    const ausentes = [];
    const sinMarcar = [];
    cat.jugadores.forEach((j) => {
      const m = state.marcados.get(claveJugador(j));
      const ref = { nombre: j.nombre, rut: j.rut };
      if (m === true) presentes.push(ref);
      else if (m === false) ausentes.push(ref);
      else sinMarcar.push(ref);
    });

    if (presentes.length + ausentes.length === 0) {
      return toast("Marca al menos un jugador antes de guardar", "aviso");
    }
    if (sinMarcar.length) {
      const ok = confirm(
        `${sinMarcar.length} jugador(es) sin marcar se guardarán como AUSENTE(S).\n¿Guardar la asistencia de todos modos?`
      );
      if (!ok) return;
      ausentes.push(...sinMarcar);
    }

    const registrador = $("#input-registrador").value.trim() || "—";
    localStorage.setItem(`asistencia.registrador.${cat.id}`, registrador);

    const payload = {
      action: "save",
      code: CONFIG.PIN || "",
      fecha: state.fecha,
      categoria: cat.id,
      categoria_nombre: cat.nombre,
      presentes,
      ausentes,
      registrado_por: registrador,
      overwrite: true,
      app_version: CONFIG.APP_VERSION,
    };

    const btn = $("#btn-guardar");
    state.guardando = true;
    btn.disabled = true;
    btn.textContent = "Guardando…";

    try {
      const r = await Api.guardar(payload);
      state.guardando = false;
      state.sucio = false;
      btn.textContent = "✓ Guardada";
      btn.classList.add("btn-ok");
      if (r.accion === "demo") {
        toast("Modo demostración: no se envió a Google Sheets", "aviso", 3500);
      } else if (r.accion === "reemplazado") {
        toast(`Asistencia actualizada (${r.presentes} presentes, ${r.ausentes} ausentes)`);
      } else {
        toast(`Asistencia guardada ✓ (${r.presentes} presentes, ${r.ausentes} ausentes)`);
      }
    } catch (err) {
      state.guardando = false;
      btn.disabled = false;
      btn.textContent = "Guardar asistencia";
      if (/c[oó]digo|lista vac|fecha inv/i.test(err.message)) {
        // Error de validación: reenviarlo no tiene sentido
        toast("⚠ " + err.message, "error", 4500);
        return;
      }
      // Sin conexión o error del servidor → queda en cola local
      Api.agregarACola(payload);
      actualizarCola();
      toast("⚠ Sin conexión: guardada en el celular. Se enviará sola al volver la señal.", "error", 4500);
    }
  }

  // ───────────────────────────────────────────────────────── cola offline

  function actualizarCola() {
    const n = Api.leerCola().length;
    const banner = $("#banner-cola");
    banner.classList.toggle("oculta", n === 0);
    if (n) {
      $("#banner-cola-texto").textContent =
        n === 1 ? "1 asistencia pendiente de envío" : `${n} asistencias pendientes de envío`;
    }
  }

  async function reenviarCola() {
    if (!Api.leerCola().length) return;
    toast("Reenviando asistencias pendientes…", "info", 2000);
    const r = await Api.procesarCola();
    actualizarCola();
    if (r.enviadas) toast(`${r.enviadas} asistencia(s) enviada(s) ✓`);
    if (r.restantes) toast(`Quedan ${r.restantes} sin enviar. Reintentaremos solas.`, "error", 4000);
  }

  // ───────────────────────────────────────────────────────── historial

  function pintarFiltros() {
    const chips = [{ id: "", nombre: "Todas" }].concat(
      state.roster.categorias.map((c) => ({ id: c.nombre, nombre: c.nombre }))
    );
    $("#historial-filtros").innerHTML = chips
      .map(
        (c) => `<button class="chip ${state.filtroCat === c.id ? "activa" : ""}" data-filtro="${esc(c.id)}">${esc(c.nombre)}</button>`
      )
      .join("");
  }

  function renderHistorial() {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("activa", t.dataset.tab === state.tab));
    pintarFiltros();
    const cont = $("#historial-contenido");

    if (!CONFIG.SCRIPT_URL) {
      cont.innerHTML = `<p class="vacio">El historial vive en Google Sheets.<br>Conecta el backend siguiendo <strong>SETUP.md</strong>.</p>`;
      return;
    }
    cont.innerHTML = `<p class="vacio"><span class="spinner"></span> Cargando…</p>`;

    if (state.tab === "sesiones") {
      Api.historial(state.filtroCat)
        .then((r) => {
          cont.innerHTML = r.sesiones.length
            ? r.sesiones.map(filaSesion).join("")
            : `<p class="vacio">Aún no hay sesiones registradas${state.filtroCat ? ` para ${esc(state.filtroCat)}` : ""}.</p>`;
        })
        .catch((e) => {
          cont.innerHTML = `<p class="vacio">⚠ ${esc(e.message)}<br><button class="btn btn-suave" id="btn-reintentar">Reintentar</button></p>`;
          $("#btn-reintentar")?.addEventListener("click", renderHistorial);
        });
    } else {
      Api.estadisticas(state.filtroCat)
        .then((r) => {
          if (!r.jugadores.length) {
            cont.innerHTML = `<p class="vacio">Sin datos en el período seleccionado.</p>`;
            return;
          }
          const encabezado = `<p class="resumen-linea"><strong>${r.sesiones}</strong> sesión(es) desde ${fmtFecha(r.desde)}</p>`;
          cont.innerHTML = encabezado + r.jugadores.map(filaEstadistica).join("");
        })
        .catch((e) => {
          cont.innerHTML = `<p class="vacio">⚠ ${esc(e.message)}<br><button class="btn btn-suave" id="btn-reintentar">Reintentar</button></p>`;
          $("#btn-reintentar")?.addEventListener("click", renderHistorial);
        });
    }
  }

  function filaSesion(s) {
    return `
      <button class="tarjeta-sesion" data-fecha="${esc(s.fecha)}" data-cat="${esc(s.categoria)}">
        <span class="tarjeta-sesion-datos">
          <span class="tarjeta-cat-nombre">${fmtFecha(s.fecha, true)}</span>
          <span class="suave">${esc(s.categoria)}${s.registrado_por && s.registrado_por !== "—" ? " · Por: " + esc(s.registrado_por) : ""}</span>
        </span>
        <span class="sesion-num">${s.presentes}<span class="suave">/${s.total}</span></span>
      </button>`;
  }

  function filaEstadistica(j) {
    const color = j.pct >= 80 ? "verde" : j.pct >= 50 ? "ambar" : "rojo";
    return `
      <div class="fila-estadistica">
        <div class="fila-estadistica-top">
          <span class="fila-nombre">${esc(j.nombre)}</span>
          <span class="pct-num pct-${color}">${j.pct}%</span>
        </div>
        <div class="pct-barra"><div class="pct-relleno pct-${color}" style="width:${j.pct}%"></div></div>
        <span class="suave2">${j.presentes} presentes de ${j.sesiones} sesión(es)</span>
      </div>`;
  }

  // ───────────────────────────────────────────────────────── detalle

  function renderDetalle(fecha, cat) {
    $("#detalle-titulo").textContent = cat;
    $("#detalle-sub").textContent = fmtFecha(fecha, true);
    const cont = $("#detalle-contenido");

    if (!CONFIG.SCRIPT_URL) {
      cont.innerHTML = `<p class="vacio">Conecta el backend siguiendo <strong>SETUP.md</strong>.</p>`;
      return;
    }
    cont.innerHTML = `<p class="vacio"><span class="spinner"></span> Cargando…</p>`;

    Api.detalle(fecha, cat)
      .then((r) => {
        const presentes = r.jugadores.filter((j) => j.estado === "Presente");
        const ausentes = r.jugadores.filter((j) => j.estado !== "Presente");
        cont.innerHTML =
          `<h3 class="seccion">✅ Presentes (${presentes.length})</h3>` +
          (presentes.map((j) => filaDetalle(j, true)).join("") || `<p class="vacio">Ninguno</p>`) +
          `<h3 class="seccion">❌ Ausentes (${ausentes.length})</h3>` +
          (ausentes.map((j) => filaDetalle(j, false)).join("") || `<p class="vacio">Ninguno</p>`);
      })
      .catch((e) => {
        cont.innerHTML = `<p class="vacio">⚠ ${esc(e.message)}</p>`;
      });
  }

  function filaDetalle(j, presente) {
    return `
      <div class="fila-detalle ${presente ? "presente" : "ausente"}">
        <span class="marca">${presente ? "✓" : "✗"}</span>
        <span class="fila-datos">
          <span class="fila-nombre">${esc(j.nombre)}</span>
          <span class="fila-meta">${esc(j.rut || "—")}</span>
        </span>
      </div>`;
  }

  // ───────────────────────────────────────────────────────── resumen semanal

  async function renderSemana(catId) {
    const cat = state.roster.categorias.find((c) => c.id === catId);
    if (!cat) return navegar("#/");

    if (state.semanaCat !== catId) {
      state.semanaCat = catId;
      state.semanaLunesISO = Compartir.lunesDeISO(hoyISO());
    }
    const lunes = Compartir.parseISO(state.semanaLunesISO);
    $("#semana-titulo").textContent = cat.nombre;
    $("#semana-rango").textContent = "Cargando…";
    $("#btn-semana-siguiente").disabled = state.semanaLunesISO >= Compartir.lunesDeISO(hoyISO());
    $("#btn-compartir-imagen").disabled = true;
    $("#btn-imprimir").disabled = true;

    const cont = $("#semana-preview");
    cont.innerHTML = `<p class="vacio"><span class="spinner"></span> Cargando historial…</p>`;

    try {
      const modelo = await Compartir.construir(cat, lunes, state.roster.club);
      state.semanaModelo = modelo;
      $("#semana-rango").textContent = modelo.rango;
      if (modelo.vacio) {
        cont.innerHTML = `<p class="vacio">Esta semana no hay sesiones registradas en ${esc(cat.nombre)}.<br><span class="suave">Usa ‹ para ver semanas anteriores.</span></p>`;
        return;
      }
      $("#btn-compartir-imagen").disabled = false;
      $("#btn-imprimir").disabled = false;
      cont.innerHTML = vistaMatriz(modelo);
    } catch (err) {
      state.semanaModelo = null;
      cont.innerHTML = `<p class="vacio">⚠ No se pudo cargar el historial: ${esc(err.message)}<br><button class="btn btn-suave" id="btn-semana-reintentar">Reintentar</button></p>`;
      $("#btn-semana-reintentar")?.addEventListener("click", () => renderSemana(catId));
    }
  }

  /** Vista previa HTML de la matriz (es además la zona de impresión). */
  function vistaMatriz(m) {
    const columnas = `minmax(0,1.4fr) repeat(${m.dias.length}, minmax(44px, 80px))`;
    const encabezados =
      `<span class="mh">Jugador</span>` +
      m.dias.map((d) => `<span class="mh">${esc(d.etiqueta)}</span>`).join("");
    const filas = m.jugadores
      .map(
        (j) =>
          `<span class="mn">${esc(j.nombre)}</span>` +
          j.celdas
            .map((c) => `<span class="mc ${c === 1 ? "ok" : c === 0 ? "no" : "sin"}">${c === 1 ? "✓" : c === 0 ? "✗" : "–"}</span>`)
            .join("")
      )
      .join("");
    const chip = `${m.jugadores.length} jugadores · ${m.dias.length} sesiones · ${m.pct}% asistencia`;
    return `
      <div class="matriz">
        <div class="matriz-head">
          <strong>${esc(m.club)}</strong>
          <span>${esc(m.categoria)} · ${esc(m.rango)}</span>
          <span class="matriz-chip">${chip}</span>
        </div>
        <div class="matriz-grid" style="grid-template-columns:${columnas}">${encabezados}${filas}</div>
        <p class="matriz-pie">Generado de la app de asistencia · ${esc(m.club)} · ${new Date().toLocaleDateString("es-CL")}</p>
      </div>`;
  }

  async function compartirSemana() {
    const m = state.semanaModelo;
    if (!m || m.vacio) return;
    const btn = $("#btn-compartir-imagen");
    btn.disabled = true;
    try {
      const canvas = Compartir.dibujar(m);
      if (!canvas) return toast("Tu navegador no permite generar imágenes", "error");
      const resultado = await Compartir.compartirPNG(canvas, Compartir.nombreArchivo(m), `Asistencia ${m.categoria}`);
      if (resultado === "descargado") {
        toast("Imagen descargada. Ábrela desde tu galería o archivos para compartirla.", "aviso", 4000);
      }
    } catch (err) {
      toast("No se pudo generar la imagen: " + err.message, "error", 4000);
    } finally {
      btn.disabled = false;
    }
  }

  // ───────────────────────────────────────────────────────── arranque

  async function iniciar() {
    bindLogin();

    // Navegación por botones con data-ir y enrutador
    document.body.addEventListener("click", (e) => {
      const ir = e.target.closest("[data-ir]");
      if (ir) return navegar(ir.dataset.ir);
      const share = e.target.closest("[data-semana]");
      if (share) return navegar(`#/semana/${encodeURIComponent(share.dataset.semana)}`);
      const tarjeta = e.target.closest(".tarjeta-cat");
      if (tarjeta) return navegar(`#/lista/${encodeURIComponent(tarjeta.dataset.cat)}`);
      const sesion = e.target.closest(".tarjeta-sesion");
      if (sesion) {
        return navegar(`#/detalle/${encodeURIComponent(sesion.dataset.fecha)}/${encodeURIComponent(sesion.dataset.cat)}`);
      }
      const chip = e.target.closest(".chip");
      if (chip && chip.dataset.filtro !== undefined) {
        state.filtroCat = chip.dataset.filtro;
        return renderHistorial();
      }
      const tab = e.target.closest(".tab");
      if (tab) {
        state.tab = tab.dataset.tab;
        return renderHistorial();
      }
    });

    // Lista
    $("#lista-jugadores").addEventListener("click", (e) => {
      const fila = e.target.closest(".fila-jugador");
      if (fila) alternar(fila.dataset.clave);
    });
    $("#lista-buscar").addEventListener("input", (e) => pintarFilas(e.target.value));
    $("#lista-fecha").addEventListener("change", (e) => {
      state.fecha = e.target.value || hoyISO();
    });
    $("#btn-todos").addEventListener("click", () => marcarTodos(true));
    $("#btn-ninguno").addEventListener("click", () => marcarTodos(false));
    $("#btn-limpiar").addEventListener("click", () => {
      state.marcados.forEach((_, clave) => state.marcados.set(clave, null));
      state.sucio = true;
      pintarFilas($("#lista-buscar").value);
      actualizarContador();
      restaurarBotonGuardar(true);
    });
    $("#btn-guardar").addEventListener("click", guardarAsistencia);
    $("#input-registrador").addEventListener("change", () => {
      localStorage.setItem(`asistencia.registrador.${state.catId}`, $("#input-registrador").value.trim());
    });

    // Cola offline
    $("#btn-reenviar").addEventListener("click", reenviarCola);
    window.addEventListener("online", reenviarCola);
    setInterval(() => {
      if (Api.leerCola().length && navigator.onLine) reenviarCola();
    }, 45000);

    // Cerrar sesión
    $("#btn-cerrar-sesion").addEventListener("click", () => {
      if (confirm("¿Cerrar sesión?")) {
        localStorage.removeItem(CLAVE_CODE);
        render();
      }
    });

    // Resumen semanal (compartir con los padres)
    $("#btn-semana-anterior").addEventListener("click", () => {
      state.semanaLunesISO = Compartir.sumarDiasISO(state.semanaLunesISO, -7);
      renderSemana(state.semanaCat);
    });
    $("#btn-semana-siguiente").addEventListener("click", () => {
      if (state.semanaLunesISO >= Compartir.lunesDeISO(hoyISO())) return;
      state.semanaLunesISO = Compartir.sumarDiasISO(state.semanaLunesISO, 7);
      renderSemana(state.semanaCat);
    });
    $("#btn-compartir-imagen").addEventListener("click", compartirSemana);
    $("#btn-imprimir").addEventListener("click", () => window.print());

    // Teclado en las tarjetas del inicio (accesibilidad)
    document.body.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("tarjeta-cat")) {
        e.preventDefault();
        navegar(`#/lista/${encodeURIComponent(e.target.dataset.cat)}`);
      }
    });

    // Service worker (app instalable + caché offline)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => { });
    }

    // Nómina desde el JSON generado por scripts/build_data.py
    try {
      const resp = await fetch("data/roster.json", { cache: "no-cache" });
      state.roster = await resp.json();
      $("#login-club").textContent = state.roster.club;
    } catch {
      document.body.innerHTML = `<p class="vacio" style="padding:2rem">⚠ No se pudo cargar la nómina (data/roster.json).</p>`;
      return;
    }

    window.addEventListener("hashchange", render);
    actualizarCola();
    render();
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
