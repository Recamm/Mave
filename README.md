# Mave

Mave es una PWA de finanzas personales para registrar ingresos y gastos manualmente desde iPhone y PC, entender los movimientos y hacer seguimiento de ahorros, con datos privados por persona y captura disponible sin conexión.

> **Estado:** la SPA, los flujos de producto y las migraciones están implementados; la validación automatizada local pasa. No se eligieron hosting ni proyecto Supabase operativo, y faltan los gates manuales de dispositivos, SMTP, restauración y usabilidad. Usar solo datos sintéticos hasta completar esas pruebas.

## Objetivos del producto

- Hacer que anotar un gasto o ingreso sea rápido y útil, sin depender de una integración bancaria.
- Permitir que una misma cuenta acceda a sus datos privados desde iPhone y computadora.
- Conservar temporalmente movimientos offline y sincronizarlos cuando se vuelva a abrir la app con conexión. En iOS no se promete sincronización con la app cerrada.
- Mostrar resúmenes claros y ayudar a seguir metas de ahorro sencillas.
- Mantener abierta la posibilidad de espacios compartidos en el futuro, sin mezclar cuentas personales en la primera versión.

## Estado actual

- **Producto:** alcance, reglas financieras y criterios de aceptación documentados.
- **Spec Kit:** la feature `001-personal-finance-tracker` tiene especificación, plan, modelo, contratos y tareas.
- **Aplicación y stack:** SPA React, TypeScript y Vite implementada; Supabase Auth/Postgres es el backend previsto, con migraciones y pruebas pgTAP en el repositorio.
- **Validación local:** lint, formato, TypeScript, pruebas unitarias, Playwright y build disponibles mediante npm; el resultado más reciente está en [release-results.md](docs/validation/release-results.md).
- **Backend y hosting:** no hay proyecto remoto, plan, región ni proveedor de hosting elegidos; los gates operativos pendientes están registrados en [la revisión de hosting](docs/operations/hosting-review.md).
- **Marca:** nombre definido: Mave. Logo e identidad visual final pendientes.
- **Licencia:** pendiente de decisión. No asumir que este repositorio tiene una licencia open source.

## Documentación

- [Informe de producto, alcance y hosting](info/finanzas-pwa/informe-producto.md)
- [Insumo para la constitución de Spec Kit](info/finanzas-pwa/constitution-input.md)
- [Descripción para `/speckit-specify`](info/finanzas-pwa/specify-input.md)
- [Prompts para logo e icono PWA](info/finanzas-pwa/prompts-para-assets.md)
- [Cómo usar los insumos](info/finanzas-pwa/README.md)
- [Guía de Spec Kit](how-to-use-speckit.md)

## Alcance inicial

La primera versión incluye:

- Cuenta personal privada y acceso desde más de un dispositivo.
- Registro manual de ingresos, gastos y transferencias entre cuentas propias.
- Historial y resumen por período, categoría y moneda.
- ARS y USD mostrados por separado; sin conversión automática.
- Cuentas personales y metas sencillas con seguimiento manual.
- Captura offline con estado pendiente y sincronización al volver a abrir la app.
- Interfaz instalable desde Safari en iPhone y utilizable en escritorio, con modos claro, oscuro y sistema.

La integración automática con Mercado Pago o bancos, los espacios compartidos, los pagos, la custodia de fondos y las recomendaciones de inversión no forman parte del MVP.

## Desarrollo local y validación

Con Node.js `>=22.12.0` y npm instalados, iniciar la interfaz local:

```powershell
npm ci
npm run dev
```

Para Auth y persistencia hace falta Supabase local con Docker/CLI o un proyecto de prueba y una `.env.local` con URL y publishable key. No poner claves secretas en variables `VITE_*`. Seguir la [guía completa de validación](specs/001-personal-finance-tracker/quickstart.md); Playwright usa configuración ficticia y no reemplaza pruebas pgTAP, SMTP, restore o Safari/VoiceOver.

Los checks locales principales son `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build` y `npm run test:e2e`. Los artefactos activos de Spec Kit están en [specs/001-personal-finance-tracker](specs/001-personal-finance-tracker/plan.md); para sus comandos en Copilot Chat, consultá la [guía del repositorio](how-to-use-speckit.md).

## Hosting y datos

La investigación recomienda evaluar Supabase para autenticación y datos, y mantener el frontend como PWA estática y portable. No se seleccionó proveedor: la [revisión actual de hosting](docs/operations/hosting-review.md) registra términos y cuotas consultados, sin aprobar un candidato. También siguen pendientes SMTP y restauración: [correo de Auth](docs/operations/auth-email.md) y [backup/restore](docs/operations/backup-restore.md). Consultá la [investigación de producto](info/finanzas-pwa/informe-producto.md) y verificá términos y precios antes de desplegar.

No cargues ni publiques en GitHub:

- Movimientos financieros reales, datos personales o capturas con información identificable.
- Contraseñas, tokens, claves privadas, archivos `.env` ni credenciales bancarias.
- Claves secretas de backend en código cliente. La aplicación debe conservar la autorización por usuario y probar el aislamiento de cada dato.

## Contribuciones y licencia

El proyecto todavía no tiene proceso de contribución ni licencia elegida. Antes de aceptar contribuciones o distribuir el código, definir una licencia y agregar el archivo `LICENSE` correspondiente.
