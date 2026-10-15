# Configuración — conectar Google Sheets (≈10 minutos)

La app vive en **GitHub Pages** (interfaz) y usa **Google Apps Script** como
puente para leer y escribir en tu hoja de cálculo.

> **Estado actual:** el repositorio ya viene configurado con la URL del
> despliegue y el PIN `SAESA2026`. Solo falta el **paso 2** (pegar el
> `Code.gs` actualizado en el editor de Apps Script) y el **paso 4**
> (desplegar una nueva versión).

---

## 1. Crear la hoja de Google

1. Ve a [sheets.new](https://sheets.new) e inicia sesión con la cuenta del club.
2. Nombra la hoja: **Asistencia SAESAA 2026** (o el nombre que prefieras).
3. Deja la pestaña en blanco: la app crea sola la pestaña `ASISTENCIA`
   con sus encabezados en el primer guardado.

## 2. Actualizar el backend en Apps Script

Tu editor de Apps Script ya tiene el código, pero con la validación antigua.
Reemplázalo por el actualizado:

1. Abre tu proyecto de Apps Script (desde la hoja: **Extensión → Apps Script**).
2. Abre [`apps-script/Code.gs`](apps-script/Code.gs) de este repositorio,
   copia **todo** su contenido (Ver archivo bruto → Ctrl+A → Ctrl+C).
3. En el editor: borra todo y pega el contenido nuevo → **Guarda** (Ctrl+S).
4. Verifica que esta línea esté cerca del inicio:
   ```js
   const CODE_PIN = 'SAESA2026';
   ```

## 3. (Opcional) Cambiar el PIN

El PIN aparece en **dos lugares** y deben coincidir:

| Archivo | Línea |
|---|---|
| `apps-script/Code.gs` | `const CODE_PIN = 'SAESA2026';` |
| `js/config.js` | `PIN: "SAESA2026",` |

Si cambias el de `Code.gs`, repite el paso 4 para publicar la nueva versión.

## 4. Desplegar la nueva versión (misma URL)

1. En Apps Script: **Implementar → Administrar implementaciones**.
2. Haz clic en la ✏️ (editar) de tu implementación existente.
3. Tipo de versión: **Nueva versión** → **Implementar**.
4. La URL `/exec` **se mantiene igual**: no hay que tocar `js/config.js`.

## 5. Publicar en GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. Source: **Deploy from a branch** · Rama: `main` / carpeta: `/ (root)` → Save.
3. En unos minutos la app queda en:
   `https://jagermeisterx.github.io/asistencia-entrenamiento/`
4. Ábrela en el celular, ingresa el PIN (`SAESA2026`) y… ¡ya puedes pasar la lista!

> **Consejo:** en el celular, menú del navegador → **Agregar a pantalla de
> inicio**. La app quedará como un icono propio (funciona instalada).

## 6. Probar que todo funciona

1. Entra a la app con el PIN → elige una categoría → marca jugadores →
   **Guardar asistencia**.
2. Vuelve a tu hoja de Google: aparece la pestaña `ASISTENCIA` con una fila
   por jugador (FECHA · CATEGORIA · JUGADOR · RUT · ESTADO · REGISTRADO_POR).
3. Entra otra vez a la misma categoría/fecha y guarda de nuevo: la app
   **reemplaza** la lista anterior (nunca duplica).
4. Revisa también la pestaña **Historial** dentro de la app: debe mostrar
   la sesión que acabas de registrar.

---

## Mantenimiento

### Actualizar la nómina de jugadores

Cuando cambie el archivo Excel (nuevas series, altas y bajas):

1. Reemplaza el `.xlsx` en la raíz del repositorio.
2. Ejecuta:

   ```bash
   pip install openpyxl       # solo la primera vez
   python3 scripts/build_data.py
   ```

3. Revisa el resumen en consola (avisa duplicados y RUT con problemas).
4. Haz commit y push: la app usa la nueva nómina al instante.

### Cambiar el backend (editar Code.gs)

Cada vez que edites `Code.gs` debes crear una **nueva versión**:
**Implementar → Administrar implementaciones → ✏️ → Nueva versión**.
La URL `/exec` no cambia.

---

## Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| «Código incorrecto» con el PIN correcto | El PIN de `config.js` y el de `Code.gs` no coinciden. Deben ser idénticos. |
| «Sin conexión: guardada en el celular» persistente | Abre la URL `/exec` + `?action=ping` en el navegador: debe mostrar `{"ok":true...}`. Si muestra error, revisa Implementar → Administrar implementaciones: la implementación debe ser «Aplicación web» con acceso «Cualquiera». |
| La asistencia no aparece en la hoja | En Apps Script: **Ejecuciones** revisa el error más reciente. Suele ser permisos: ejecuta `setup()` una vez desde el editor para autorizar. |
| El historial no carga | Verifica que la URL en `config.js` termine en `/exec` y no tenga caracteres extra. |
| El PIN quedó registrado en un celular perdido | Cambia el PIN (paso 3) y ya no servirá el anterior. |
| La app no actualiza tras un push | Service worker: en el celular, recarga con la app abierta o reinstala desde el navegador (la caché se limpia sola al subir la versión del SW). |
