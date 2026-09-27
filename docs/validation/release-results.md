# Resultados de validación de release

**Fecha:** 2026-09-27
**Estado de T059:** Parcial; validación local de cliente aprobada, proyecto Supabase limpio no disponible.

## Entorno observado

- Windows; Node.js `v24.14.0`, npm `11.18.0`.
- Versiones instaladas: Vite `7.3.6`, TypeScript `5.9.3`, Vitest `4.1.11` y Playwright `1.63.0`.
- Hay `node_modules` y `package-lock.json`; no existe `.env.local` ni `supabase/.env`.
- Supabase CLI, Docker y `psql` no están disponibles. No se configuró un proyecto Supabase remoto de prueba.
- `supabase/config.toml` apunta a localhost y `.env.example` contiene una URL/key de ejemplo, no credenciales operativas.

## Comandos locales ejecutados

| Comando                | Resultado                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | PASS                                                                                                                               |
| `npm run format:check` | PASS                                                                                                                               |
| `npm run typecheck`    | PASS                                                                                                                               |
| `npm test`             | PASS: 10 archivos, 35 pruebas                                                                                                      |
| `npm run build`        | PASS: 131 módulos; genera shell, manifest y service worker. Bundle JS: 576.16 kB (165.71 kB gzip); Vite advierte que supera 500 kB |
| `npm run test:e2e`     | PASS: 13 pruebas en Chromium, con configuración local/ficticia                                                                     |

Las pruebas Playwright no usan un proyecto Supabase real y no validan Auth remoto, SMTP, grants/RLS en Postgres, Cron ni restauración. Las suites pgTAP no pudieron ejecutarse.

## Comandos y escenarios pendientes

| Comando/escenario                           | Estado y motivo                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `supabase start`                            | No ejecutado: faltan Supabase CLI y Docker                                                                |
| `supabase db reset`                         | No ejecutado: no existe stack Supabase local; no se ejecutó contra ningún proyecto remoto                 |
| `supabase test db`                          | No ejecutado: faltan CLI y Postgres local                                                                 |
| Auth y correos de confirmación/recuperación | No ejecutados: faltan proyecto de prueba y SMTP                                                           |
| Restore desde backup y medición RPO/RTO     | No ejecutados: plan/proyecto sin elegir y herramientas no disponibles                                     |
| Safari iPhone/VoiceOver                     | Pendiente de dispositivo y tecnología de asistencia reales; ver [validación PWA](safari-accessibility.md) |
| Prueba de usabilidad con cinco personas     | No ejecutada; ver [protocolo y registro](usability-results.md)                                            |

La guía [quickstart.md](../../specs/001-personal-finance-tracker/quickstart.md) se actualizó para reflejar el estado actual y separar checks del cliente de los gates de Supabase. T059 solo se puede cerrar tras ejecutarla en un proyecto de prueba limpio, sin credenciales de producción, y registrar los resultados del backend.

La inspección estática confirmó que los seis planes pgTAP coinciden con sus cantidades de aserciones. Esto no es una ejecución de las suites ni valida el SQL contra Postgres. Se agregó `0009_finite_amounts.sql` para excluir `NaN` e infinitos de importes y una regresión pgTAP; ambas siguen pendientes de ejecución local.
