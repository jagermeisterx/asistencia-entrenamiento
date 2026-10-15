/**
 * compartir.js — resumen semanal por categoría para compartir con los padres.
 *
 * Construye la matriz «jugadores × días (lun–sáb)» de la semana elegida a
 * partir de los endpoints existentes (historial + detalle), la dibuja en un
 * canvas de 1080px de ancho para compartir como imagen (WhatsApp) y expone
 * el nombre de archivo. La vista previa HTML (en app.js) usa el mismo modelo
 * y sirve además como zona de impresión (Imprimir → guardar como PDF).
 */
const Compartir = (() => {
  "use strict";

  const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const FUENTE = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const ANCHO = 1080;
  const MARGEN = 48;
  const COL_DIA = 132;
  const ALTO_FILA = 76;

  // ───────────────────────────────────────────────────────── fechas

  function parseISO(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function isoDe(f) {
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
  }

  function agregarDias(f, n) {
    const g = new Date(f);
    g.setDate(g.getDate() + n);
    return g;
  }

  /** Lunes (ISO) de la semana que contiene la fecha dada. */
  function lunesDe(iso) {
    const f = parseISO(iso);
    const dia = f.getDay(); // 0 dom … 6 sáb
    return agregarDias(f, dia === 0 ? -6 : 1 - dia);
  }

  const lunesDeISO = (iso) => isoDe(lunesDe(iso));
  const sumarDiasISO = (iso, n) => isoDe(agregarDias(parseISO(iso), n));

  function etiquetaDia(f) {
    return `${DIAS_CORTOS[f.getDay()]} ${f.getDate()}`;
  }

  function etiquetaRango(inicio) {
    const fin = agregarDias(inicio, 5); // lun–sáb
    const mesInicio = inicio.toLocaleDateString("es-CL", { month: "long" });
    const mismoMes = inicio.getMonth() === fin.getMonth();
    return mismoMes
      ? `Semana del ${inicio.getDate()} al ${fin.getDate()} de ${mesInicio}`
      : `Semana del ${inicio.getDate()} de ${mesInicio} al ${fin.getDate()} de ${fin.toLocaleDateString("es-CL", { month: "long" })}`;
  }

  const normalizarRut = (rut) => String(rut || "").replace(/[^\wKk]/g, "").toUpperCase();

  // ───────────────────────────────────────────────────────── modelo

  /**
   * Arma la matriz semanal de una categoría.
   * @param categoria objeto del roster { nombre, jugadores }
   * @param lunes Date del lunes de la semana deseada
   * @param club nombre del club (encabezado)
   */
  async function construir(categoria, lunes, club) {
    const dias = [];
    for (let i = 0; i < 6; i++) {
      const f = agregarDias(lunes, i); // lun … sáb
      dias.push({ fecha: isoDe(f), etiqueta: etiquetaDia(f) });
    }
    const base = {
      vacio: true,
      club,
      categoria: categoria.nombre,
      rango: etiquetaRango(lunes),
      dias: [],
      jugadores: [],
      sesiones: 0,
      pct: 0,
      inicio: dias[0].fecha,
      fin: dias[5].fecha,
    };

    const fechas = new Set(dias.map((d) => d.fecha));
    const hist = await Api.historial(categoria.nombre, 200);
    const sesiones = (hist.sesiones || [])
      .filter((s) => fechas.has(s.fecha))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    if (!sesiones.length) return base;

    const detalles = await Promise.all(
      sesiones.map((s) => Api.detalle(s.fecha, categoria.nombre))
    );

    // fecha → estados por RUT (preferente) o por nombre
    const porFecha = {};
    detalles.forEach((d, i) => {
      const mapa = { rut: {}, nombre: {} };
      (d.jugadores || []).forEach((j) => {
        const presente = j.estado === "Presente";
        const rn = normalizarRut(j.rut);
        if (rn) mapa.rut[rn] = presente;
        mapa.nombre[String(j.nombre).toUpperCase()] = presente;
      });
      porFecha[sesiones[i].fecha] = mapa;
    });

    const diasConSesion = dias.filter((d) => porFecha[d.fecha]);

    const jugadores = categoria.jugadores.map((j) => {
      const rn = normalizarRut(j.rut);
      const clave = String(j.nombre).toUpperCase();
      const celdas = diasConSesion.map((d) => {
        const mapa = porFecha[d.fecha];
        const estado = rn && mapa.rut[rn] !== undefined ? mapa.rut[rn] : mapa.nombre[clave];
        return estado === undefined ? null : estado ? 1 : 0; // null = sin dato
      });
      return { nombre: j.nombre, celdas };
    });

    let presentes = 0;
    let marcadas = 0;
    jugadores.forEach((j) =>
      j.celdas.forEach((c) => {
        if (c !== null) {
          marcadas++;
          if (c === 1) presentes++;
        }
      })
    );

    return {
      ...base,
      vacio: false,
      dias: diasConSesion,
      jugadores,
      sesiones: sesiones.length,
      pct: marcadas ? Math.round((100 * presentes) / marcadas) : 0,
    };
  }

  // ───────────────────────────────────────────────────────── canvas

  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  function truncar(ctx, texto, maxAncho) {
    if (ctx.measureText(texto).width <= maxAncho) return texto;
    let t = texto;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxAncho) {
      t = t.slice(0, -1);
    }
    return t + "…";
  }

  /**
   * Dibuja el modelo en un canvas de 1080px.
   * Si se pasa un ctx externo (pruebas), dibuja en él y no devuelve nada.
   */
  function dibujar(modelo, ctxExterno) {
    const nDias = modelo.dias.length;
    const colJugadores = ANCHO - MARGEN * 2 - nDias * COL_DIA;
    const altoCabecera = 268;
    const altoColumnas = 66;
    const altoPie = 92;
    const alto = altoCabecera + altoColumnas + modelo.jugadores.length * ALTO_FILA + altoPie;

    let ctx = ctxExterno;
    let canvas = null;
    if (!ctx) {
      canvas = document.createElement("canvas");
      canvas.width = ANCHO;
      canvas.height = alto;
      ctx = canvas.getContext("2d");
      if (!ctx) return null; // entorno sin soporte de canvas
    }

    // Fondo
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ANCHO, alto);

    // Encabezado
    ctx.fillStyle = "#16324f";
    ctx.fillRect(0, 0, ANCHO, altoCabecera);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 46px ${FUENTE}`;
    ctx.fillText(modelo.club.toUpperCase(), ANCHO / 2, 78);
    ctx.fillStyle = "#bfdbfe";
    ctx.font = `500 30px ${FUENTE}`;
    ctx.fillText(`${modelo.categoria} · ${modelo.rango}`, ANCHO / 2, 126);

    const textoChip = `${modelo.jugadores.length} jugadores · ${modelo.dias.length} sesiones · ${modelo.pct}% asistencia`;
    ctx.font = `600 28px ${FUENTE}`;
    const anchoChip = ctx.measureText(textoChip).width + 56;
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    redondeado(ctx, ANCHO / 2 - anchoChip / 2, 162, anchoChip, 58, 29);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(textoChip, ANCHO / 2, 200);

    // Fila de columnas
    const yCols = altoCabecera;
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, yCols, ANCHO, altoColumnas);
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = `700 24px ${FUENTE}`;
    ctx.fillText("JUGADOR", MARGEN, yCols + 42);
    ctx.textAlign = "center";
    ctx.fillStyle = "#1f4e79";
    ctx.font = `700 26px ${FUENTE}`;
    modelo.dias.forEach((d, i) => {
      const x = MARGEN + colJugadores + i * COL_DIA + COL_DIA / 2;
      ctx.fillText(d.etiqueta, x, yCols + 42);
    });

    // Filas de jugadores
    modelo.jugadores.forEach((j, i) => {
      const y = yCols + altoColumnas + i * ALTO_FILA;
      if (i % 2 === 1) {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, y, ANCHO, ALTO_FILA);
      }
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(0, y + ALTO_FILA);
      ctx.lineTo(ANCHO, y + ALTO_FILA);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#0f172a";
      ctx.font = `600 32px ${FUENTE}`;
      ctx.fillText(truncar(ctx, j.nombre, colJugadores - 28), MARGEN, y + 50);

      ctx.textAlign = "center";
      ctx.font = `700 38px ${FUENTE}`;
      j.celdas.forEach((c, k) => {
        const x = MARGEN + colJugadores + k * COL_DIA + COL_DIA / 2;
        if (c === 1) { ctx.fillStyle = "#16a34a"; ctx.fillText("✓", x, y + 50); }
        else if (c === 0) { ctx.fillStyle = "#dc2626"; ctx.fillText("✗", x, y + 50); }
        else { ctx.fillStyle = "#cbd5e1"; ctx.fillText("–", x, y + 50); }
      });
    });

    // Pie
    const yPie = alto - altoPie;
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(MARGEN, yPie + 20);
    ctx.lineTo(ANCHO - MARGEN, yPie + 20);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";
    ctx.font = `400 24px ${FUENTE}`;
    ctx.fillText(
      `Generado de la app de asistencia · ${modelo.club} · ${new Date().toLocaleDateString("es-CL")}`,
      ANCHO / 2,
      yPie + 62
    );

    return canvas;
  }

  // ───────────────────────────────────────────────────────── compartir

  function nombreArchivo(modelo) {
    const limpio = (s) =>
      String(s)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return `resumen-${limpio(modelo.categoria)}-${modelo.inicio}_${modelo.fin}.png`;
  }

  /**
   * Comparte el canvas como PNG. Devuelve "compartido" | "descargado" |
   * "cancelado". Usa la hoja de compartir del celular; si no existe,
   * descarga el archivo.
   */
  async function compartirPNG(canvas, archivo, titulo) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No se pudo generar la imagen");

    try {
      const file = new File([blob], archivo, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: titulo });
        return "compartido";
      }
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelado";
      // cualquier otro problema → se intenta descargar
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return "descargado";
  }

  return { construir, dibujar, compartirPNG, nombreArchivo, lunesDeISO, sumarDiasISO, parseISO };
})();
