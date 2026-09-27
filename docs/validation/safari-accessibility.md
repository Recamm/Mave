# Validación PWA y accesibilidad

**Fecha**: 2026-09-27
**Estado**: validación automatizada completada; verificación manual en dispositivo pendiente.

## Entorno

- Windows y Playwright con Chromium de escritorio.
- Pruebas E2E ejecutadas contra el servidor local de Vite.
- No se dispuso de un iPhone físico, Safari de iOS ni VoiceOver.

## Resultados automatizados

- `npm run build`: correcto; genera `dist/service-worker.js`, el manifest y los iconos. El bundle JS mide 576.16 kB (165.71 kB gzip) y Vite advierte que supera 500 kB.
- `npm run test:e2e`: 13 pruebas aprobadas.
- En viewport de 320 × 720 px, el flujo de acceso no presenta scroll horizontal.
- El flujo de acceso funciona con teclado y muestra foco visible de 3 px.
- axe no detecta violaciones de los criterios configurados WCAG 2.0/2.1/2.2 AA en apariencia clara, oscura o del sistema.
- El tema oscuro se conserva después de recargar.
- Playwright verifica manifest instalable, iconos 192 × 192 y 512 × 512, icono Apple 180 × 180, worker activo y shell en caché. Las URLs de API no aparecen en CacheStorage.

## Verificación manual pendiente

T055 no está completo. Antes de cerrar la fase, ejecutar en Safari real de iPhone y registrar modelo, versión de iOS y resultados:

1. Abrir la app por HTTPS, añadirla a Inicio desde Safari y reabrirla como app instalada.
2. Cambiar entre apariencia clara, oscura y del sistema; comprobar que el modo sistema sigue los cambios del dispositivo y que una selección explícita prevalece.
3. Completar captura y consulta de movimientos, navegación y Ajustes con VoiceOver; revisar nombres, estados anunciados, orden y foco visible.
4. Repetir los flujos principales en un navegador de escritorio con teclado y tecnología de asistencia.
5. Confirmar que los estados se entienden sin depender únicamente del color y registrar cualquier limitación observada.

Chromium automatizado no sustituye la instalación desde Safari ni la validación con VoiceOver. Esas comprobaciones quedan pendientes por falta de dispositivo en este entorno.

Los iconos actuales se generaron desde el logo existente en `info/finanzas-pwa/assets/brand/logo.png`. La checklist de identidad visual sigue sin revisar y no se modificó; reemplazar o aprobar estos iconos cuando se cierre esa revisión.
