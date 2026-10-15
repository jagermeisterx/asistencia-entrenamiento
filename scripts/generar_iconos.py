#!/usr/bin/env python3
"""
Genera los iconos de la PWA (icons/icon-192.png e icons/icon-512.png).

Uso:
    python3 scripts/generar_iconos.py

Requiere Pillow:  pip install pillow
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "icons"

AZUL = (22, 50, 79)        # --azul
AZUL_CLARO = (47, 97, 145)
VERDE = (22, 163, 74)      # --verde
BLANCO = (255, 255, 255)


def generar(tamano: int) -> Image.Image:
    # Se dibuja a 4x y se reduce para bordes suaves
    s = tamano * 4
    img = Image.new("RGB", (s, s), AZUL)
    draw = ImageDraw.Draw(img)

    # Resplandor radial suave
    brillo = Image.new("L", (s, s), 0)
    brillo_draw = ImageDraw.Draw(brillo)
    brillo_draw.ellipse([s * 0.1, -s * 0.35, s * 0.9, s * 0.55], fill=90)
    brillo = brillo.filter(ImageFilter.GaussianBlur(s // 8))
    img = Image.composite(Image.new("RGB", (s, s), AZUL_CLARO), img, brillo)
    draw = ImageDraw.Draw(img)

    # Portapapeles (pizarra de asistencia)
    ancho, alto = s * 0.56, s * 0.66
    x0, y0 = (s - ancho) / 2, (s - alto) / 2 + s * 0.03
    x1, y1 = x0 + ancho, y0 + alto
    radio = s * 0.06
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radio, fill=BLANCO)

    # Clip superior
    clip_an, clip_al = s * 0.22, s * 0.09
    cx0, cy0 = s / 2 - clip_an / 2, y0 - clip_al * 0.55
    draw.rounded_rectangle(
        [cx0, cy0, cx0 + clip_an, cy0 + clip_al],
        radius=s * 0.03,
        fill=AZUL,
    )

    # Palomas de "presente" (dos líneas)
    grosor = int(s * 0.055)
    puntos = [
        [(s * 0.30, s * 0.50), (s * 0.44, s * 0.64)],
        [(s * 0.44, s * 0.64), (s * 0.72, s * 0.33)],
    ]
    for tramo in puntos:
        draw.line(tramo, fill=VERDE, width=grosor, joint="curve")
    # Extremos redondeados
    for punto in (puntos[0][0], puntos[-1][1]):
        r = grosor / 2
        draw.ellipse([punto[0] - r, punto[1] - r, punto[0] + r, punto[1] + r], fill=VERDE)

    return img.resize((tamano, tamano), Image.LANCZOS)


def main():
    SALIDA.mkdir(exist_ok=True)
    for tamano in (192, 512):
        ruta = SALIDA / f"icon-{tamano}.png"
        generar(tamano).save(ruta, "PNG")
        print(f"✔ {ruta.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
