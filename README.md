# asistencia-entrenamiento

Sistema de asistencia web para los entrenamientos de la **Escuela Alemana
Paillaco**. La app está pensada para usarse **en el celular** al pasar la
lista: marca presentes/ausentes con el dedo y guarda directo en una hoja de
Google.

- **Interfaz:** GitHub Pages (HTML/CSS/JS sin dependencias).
- **Datos de la nómina:** generados desde el archivo Excel del repositorio
  (`SAESAA REAL 2026(1).xlsx`) → `data/roster.json`.
- **Registro de asistencia:** Google Sheets, a través de Google Apps Script
  (ver [SETUP.md](SETUP.md)).

## Funciones

- ⚽ 4 categorías (Serie Adulto, U17, U15, U13) con su cuerpo técnico.
- ✅/✗ Toque grande para alternar presente/ausente, contador en vivo,
  «Todos» / «Ninguno» / «Limpiar» y buscador.
- 📅 La fecha se elige al pasar la lista (hoy por defecto); si ya existe una
  lista para esa fecha y categoría, se **reemplaza** (sin duplicados).
- 📶 **Modo offline:** si no hay señal, la asistencia queda en cola en el
  celular y se envía sola al recuperar conexión.
- 📊 **Historial:** sesiones registradas y % de asistencia por jugador.
- 🔐 Acceso con PIN (validado en la app y en el servidor).
- 📲 Instalable en el pantalla de inicio (PWA) y funciona sin datos.

## Estructura

```
├── index.html              app (vista única)
├── css/styles.css          estilos mobile-first
├── js/
│   ├── config.js           URL del backend + PIN de acceso
│   ├── api.js              comunicación + cola offline
│   └── app.js              interfaz y enrutamiento
├── data/roster.json        nómina generada desde el Excel
├── apps-script/Code.gs     backend de Google Apps Script
├── scripts/
│   ├── build_data.py       Excel → roster.json
│   └── generar_iconos.py   regenera los iconos de la PWA
├── icons/  manifest.json  sw.js
├── SETUP.md                guía para conectar Google Sheets
└── SAESAA REAL 2026(1).xlsx   fuente maestra de la nómina
```

## Desarrollo

```bash
# Regenerar la nómina tras cambiar el Excel
pip install openpyxl
python3 scripts/build_data.py

# Probar localmente
python3 -m http.server 8000
# → http://localhost:8000  (sin config.js la app corre en modo demostración)
```

## Publicación

1. Configura el backend una sola vez: [SETUP.md](SETUP.md).
2. `git push`: GitHub Pages publica automáticamente la app en
   `https://jagermeisterx.github.io/asistencia-entrenamiento/`.
