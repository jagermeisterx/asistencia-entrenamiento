#!/usr/bin/env python3
"""
Genera data/roster.json a partir del archivo Excel de nóminas.

Uso:
    python3 scripts/build_data.py

Lee el archivo .xlsx de la raíz del repositorio, limpia los datos
(fechas mixtas, espacios dobles, duplicados exactos dentro de una
categoría, marcadores "RUT INVALIDO" / "RUT NO ENCONTRADO") y genera
el JSON que consume la aplicación web.
"""

import json
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("Falta openpyxl. Instálalo con:  pip install openpyxl")

RAIZ = Path(__file__).resolve().parent.parent
EXCEL = next(iter(sorted(RAIZ.glob("*.xlsx"))), None)
SALIDA = RAIZ / "data" / "roster.json"

# Marcadores que el archivo fuente usa en la columna CLUB
MARCADORES_RUT = ("RUT INVALIDO", "RUT NO ENCONTRADO")


# ---------------------------------------------------------------- utilidades

def limpiar_texto(valor):
    """Normaliza un valor de celda a texto sin espacios redundantes."""
    if valor is None:
        return ""
    texto = str(valor)
    if isinstance(valor, datetime):
        texto = valor.strftime("%Y-%m-%d %H:%M:%S")
    texto = unicodedata.normalize("NFKC", texto)
    return re.sub(r"\s+", " ", texto).strip()


def parsear_fecha(valor):
    """Convierte fechas de Excel (datetime u objeto texto) a ISO YYYY-MM-DD."""
    if isinstance(valor, datetime):
        return valor.date().isoformat()
    if isinstance(valor, date):
        return valor.isoformat()
    texto = limpiar_texto(valor)
    if not texto:
        return None
    for formato in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(texto, formato).date().isoformat()
        except ValueError:
            continue
    return None  # formato desconocido: se omite sin romper


def dv_rut_chile(body):
    """Dígito verificador esperado de un RUT chileno (módulo 11)."""
    suma = 0
    multiplo = 2
    for digito in reversed(body):
        suma += int(digito) * multiplo
        multiplo = multiplo + 1 if multiplo < 7 else 2
    resto = 11 - (suma % 11)
    if resto == 11:
        return "0"
    if resto == 10:
        return "K"
    return str(resto)


def analizar_rut(valor):
    """Devuelve (rut_formateado, rut_normalizado, es_valido)."""
    texto = limpiar_texto(valor).upper().replace(".", "").replace(" ", "")
    cuerpo_dv = texto.split("-")
    if len(cuerpo_dv) != 2:
        return limpiar_texto(valor), "", False
    cuerpo, dv = cuerpo_dv
    if not cuerpo.isdigit() or len(cuerpo) < 7 or len(dv) != 1:
        return limpiar_texto(valor), "", False
    valido = dv_rut_chile(cuerpo) == dv
    formateado = f"{int(cuerpo):,}".replace(",", ".") + f"-{dv}"
    return formateado, cuerpo + dv, valido


def clave_jugador(jugador):
    """Clave de deduplicación: RUT normalizado o nombre completo."""
    return jugador["rut_normalizado"] or jugador["nombre"].upper()


# ---------------------------------------------------------------- lectura

def leer_secciones(ws):
    """Localiza las nóminas escaneando la columna B en busca de 'NOMINA SERIE'."""
    secciones = []
    for fila in range(1, ws.max_row + 1):
        etiqueta = limpiar_texto(ws.cell(row=fila, column=2).value).upper()
        if etiqueta.startswith("NOMINA SERIE"):
            serie = etiqueta.replace("NOMINA SERIE", "").strip()
            # El rango de edades puede estar en la columna C y/o D del título
            rango = " ".join(
                filtro for filtro in (
                    limpiar_texto(ws.cell(row=fila, column=3).value),
                    limpiar_texto(ws.cell(row=fila, column=4).value),
                ) if filtro
            )
            secciones.append({
                "fila_titulo": fila,
                "serie_bruta": serie,
                "nombre_mostrar": "SERIE " + serie,
                "rango": rango,
            })
    for i, seccion in enumerate(secciones):
        fin = secciones[i + 1]["fila_titulo"] if i + 1 < len(secciones) else ws.max_row + 1
        seccion["fila_fin"] = fin
    return secciones


def leer_jugadores(ws, seccion, avisos):
    jugadores = []
    vistos = {}
    for fila in range(seccion["fila_titulo"] + 1, seccion["fila_fin"]):
        num = ws.cell(row=fila, column=1).value
        if not isinstance(num, (int, float)):  # solo filas numeradas
            continue
        apellidos = limpiar_texto(ws.cell(row=fila, column=2).value)
        nombres = limpiar_texto(ws.cell(row=fila, column=3).value)
        if not apellidos and not nombres:
            continue  # fila numerada vacía

        rut_fmt, rut_norm, rut_ok = analizar_rut(ws.cell(row=fila, column=4).value)
        club_celda = limpiar_texto(ws.cell(row=fila, column=7).value)
        club, avisos_jugador = club_celda, []
        for marcador in MARCADORES_RUT:
            if club_celda.upper().startswith(marcador):
                club = ""
                rut_ok = False
                avisos_jugador.append(f"El archivo fuente marca: {marcador}")
                break

        jugador = {
            "n": int(num),
            "apellidos": apellidos,
            "nombres": nombres,
            "nombre": f"{nombres} {apellidos}".strip(),
            "rut": rut_fmt,
            "rut_normalizado": rut_norm,
            "rut_valido": rut_ok,
            "fecha_nac": parsear_fecha(ws.cell(row=fila, column=5).value),
            "clasificacion": limpiar_texto(ws.cell(row=fila, column=6).value),
            "club": club,
            "avisos": avisos_jugador,
        }
        if not apellidos:
            jugador["avisos"].append("Faltan apellidos en el archivo fuente")
        if rut_norm and not rut_ok and not avisos_jugador:
            jugador["avisos"].append("RUT con dígito verificador inválido")

        clave = clave_jugador(jugador)
        if clave in vistos:
            avisos.append(
                f"[{seccion['nombre_mostrar']}] duplicado eliminado: "
                f"{jugador['nombre']} ({jugador['rut'] or 'sin RUT'})"
            )
            continue
        vistos[clave] = True
        jugadores.append(jugador)
    return jugadores


def leer_cuerpo_tecnico(ws, seccion):
    cuerpo = []
    for fila in range(seccion["fila_fin"] - 12, seccion["fila_fin"]):
        etiqueta = limpiar_texto(ws.cell(row=fila, column=1).value).upper().rstrip(":")
        if not etiqueta.startswith(("ENTRENADOR", "ASISTENTE")):
            continue
        nombres = limpiar_texto(ws.cell(row=fila, column=3).value)
        apellidos = limpiar_texto(ws.cell(row=fila, column=2).value)
        if not nombres and not apellidos:
            continue
        rut_fmt, _, rut_ok = analizar_rut(ws.cell(row=fila, column=4).value)
        cuerpo.append({
            "rol": etiqueta.title(),
            "nombre": f"{nombres} {apellidos}".strip(),
            "rut": rut_fmt,
            "rut_valido": rut_ok,
            "nivel": limpiar_texto(ws.cell(row=fila, column=6).value),
            "nota": limpiar_texto(ws.cell(row=fila, column=7).value),
        })
    orden = {"Entrenador": 0, "Asistente 1": 1, "Asistente 2": 2}
    cuerpo.sort(key=lambda r: orden.get(r["rol"], 9))
    return cuerpo


def leer_staff_adicional(ws, avisos):
    """PREP. FISICO / KINESIOLOGO / UTILERO (al final del archivo)."""
    staff = []
    for fila in range(1, ws.max_row + 1):
        etiqueta = limpiar_texto(ws.cell(row=fila, column=1).value).upper().rstrip(":")
        if etiqueta in ("PREP. FISICO", "KINESIOLOGO", "UTILERO"):
            nombres = limpiar_texto(ws.cell(row=fila, column=3).value)
            apellidos = limpiar_texto(ws.cell(row=fila, column=2).value)
            nombre = f"{nombres} {apellidos}".strip()
            if nombre:
                rut_fmt, _, rut_ok = analizar_rut(ws.cell(row=fila, column=4).value)
                staff.append({"rol": etiqueta.title(), "nombre": nombre,
                              "rut": rut_fmt, "rut_valido": rut_ok})
            else:
                avisos.append(f"Sin datos para: {etiqueta}")
    return staff


def id_categoria(serie_bruta):
    base = re.sub(r"[^A-Z0-9]+", "", serie_bruta.upper())
    return base.lower()


# ---------------------------------------------------------------- principal

def main():
    if EXCEL is None:
        sys.exit("No se encontró el archivo .xlsx en la raíz del repositorio")

    wb = openpyxl.load_workbook(EXCEL, data_only=True)
    ws = wb[wb.sheetnames[0]]
    avisos = []

    club = limpiar_texto(ws.cell(row=2, column=3).value) or "CLUB SIN NOMBRE"
    anio = None
    for fila in range(1, 6):
        for col in range(1, ws.max_column + 1):
            valor = ws.cell(row=fila, column=col).value
            if isinstance(valor, (int, float)) and 2000 < valor < 2100:
                anio = int(valor)

    categorias = []
    for seccion in leer_secciones(ws):
        jugadores = leer_jugadores(ws, seccion, avisos)
        cuerpo = leer_cuerpo_tecnico(ws, seccion)
        nombre = "Serie " + " ".join(
            w if w.isdigit() or w.upper().startswith("U") else w.capitalize()
            for w in seccion["serie_bruta"].split()
        )
        categorias.append({
            "id": id_categoria(seccion["serie_bruta"]),
            "nombre": re.sub(r"\bU\s+(\d)", r"U\1", nombre),  # "U 17" → "U17"
            "rango_edades": seccion["rango"],
            "jugadores": jugadores,
            "cuerpo_tecnico": cuerpo,
        })

    roster = {
        "club": club,
        "anio": anio,
        "generado": date.today().isoformat(),
        "fuente": EXCEL.name,
        "categorias": categorias,
        "staff_adicional": leer_staff_adicional(ws, avisos),
    }

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(roster, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")

    # Resumen para la consola
    print(f"✔ {SALIDA.relative_to(RAIZ)} generado desde «{EXCEL.name}»")
    print(f"  Club: {club} · Año: {anio}")
    for cat in categorias:
        invalidos = sum(1 for j in cat["jugadores"] if not j["rut_valido"])
        extra = f" · {invalidos} RUT con alerta" if invalidos else ""
        print(f"  {cat['nombre']:<14} {len(cat['jugadores']):>2} jugadores"
              f" · {len(cat['cuerpo_tecnico'])} cuerpo técnico{extra}")
    if avisos:
        print("\nAvisos:")
        for aviso in avisos:
            print(f"  · {aviso}")


if __name__ == "__main__":
    main()
