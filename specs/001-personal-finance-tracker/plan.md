# Implementation Plan: Mave - Finanzas personales

**Branch**: `001-personal-finance-tracker` | **Date**: 2026-09-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-personal-finance-tracker/spec.md`; product and hosting research from `info/finanzas-pwa/informe-producto.md`.

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Mave es una PWA instalable, privada y manual-first para registrar y comprender
movimientos financieros en ARS y USD. La arquitectura recomendada es una SPA
estática y portable con React, TypeScript y Vite; Supabase Auth y Postgres con
grants mínimos y RLS para los datos canónicos; e IndexedDB como outbox para
capturas offline. Operaciones financieras sensibles se ejecutan en transacciones
Postgres; una función Edge programada gestiona vencimientos de eliminación. No
se agrega una API de aplicación propia ni se fija proveedor de hosting. Las
decisiones y gates están en [research.md](research.md), [data-model.md](data-model.md),
[contracts/supabase-data-api.md](contracts/supabase-data-api.md) y
[quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript `^5.9.2`; Node.js `>=22.12.0` (CI ejecuta Node 24). Importes cruzan la frontera cliente/servidor como texto decimal.

**Primary Dependencies**: React 19, React Router 7, Vite 7 y `@supabase/supabase-js`; APIs del navegador para IndexedDB, service worker e instalación PWA. El lockfile fija las resoluciones y `package.json` define los scripts. Sin SSR ni backend de aplicación propio.

**Storage**: Supabase Postgres (`numeric`) como fuente canónica; IndexedDB para outbox y estado local asociado al usuario. La escala decimal y el tratamiento de precisión adicional deben decidirse antes de implementar. El service worker cachea shell/assets, no respuestas financieras.

**Testing**: Vitest 4 y Testing Library para reglas unitarias; Playwright 1 con axe para E2E; constraints, grants y RLS en Supabase local con pruebas negativas entre dos cuentas; Safari real de iPhone, teclado/tecnología de asistencia y restauración ensayada antes de testers.

**Target Platform**: PWA instalable desde Safari en iPhone y web responsive en navegadores actuales de escritorio. HTTPS estático portable. La sincronización ocurre al abrir/volver a primer plano; no se garantiza con la app cerrada en iOS.

**Project Type**: SPA PWA estática y Supabase gestionado para Auth/Postgres; una función Edge acotada al borrado programado, sin API propia de negocio.

**Performance Goals**: La spec no establece SLA ni concurrencia. La captura local no debe esperar red; medir SC-001 y SC-005. No fijar metas de carga de servidor para el MVP individual sin evidencia de uso.

**Constraints**: aislamiento por propietario con grants y RLS; importes exactos y monedas separadas; sync idempotente, resolución explícita de conflictos y denegación de sync al vencimiento de eliminación; secretos solo server-side; no almacenar respuestas financieras en caché compartida; WCAG 2.2 AA; sin bancos, pagos, custodia ni conversión automática. Confirmar backups/restauración, SMTP, términos y cuotas antes de testers.

**Scale/Scope**: una persona por cuenta, sin espacios compartidos ni volumen comprometido. Hosting aún no seleccionado. Planes gratuitos solo se consideran para prototipo personal sujeto a términos vigentes; no se presume que habiliten testers o uso comercial.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Gate de diseño | Estado después de Phase 1 |
|---|---|---|
| Privacidad y propiedad | Propietario en cada entidad; grants mínimos y RLS por operación; pruebas negativas entre cuentas; ninguna clave secreta en cliente ni datos financieros en logs/cachés innecesarias. | PASS de diseño; políticas, grants y pruebas son gates de implementación. |
| Exactitud y transparencia | `numeric` exacto; ARS/USD separados; transferencias excluidas; devoluciones y saldos siguen FR-009, FR-011 y FR-026. | PASS condicionado a decidir escala/rechazo de precisión antes de implementar y validar cálculos. |
| Integridad offline | Outbox asociada a la cuenta, estado visible, reintentos idempotentes, conflictos preservados y sync rechazado al vencer eliminación. | PASS de diseño; faltan pruebas de reintentos, conflictos, logout y vencimiento. |
| Accesibilidad y multidispositivo | Phone-first sin degradar desktop; teclado, foco visible, WCAG 2.2 AA y Safari de iPhone real. | PASS de diseño; verificación en dispositivos y tecnologías de asistencia pendiente. |
| Manual-first y alcance | Carga manual completa; no añadir bancos, scraping, pagos, custodia ni recomendaciones. | PASS; sin ampliaciones fuera de alcance. |
| Calidad y simplicidad | Pruebas de reglas, RLS, sync, exportación/restauración y recuperación; justificar dependencias. | PASS de diseño; scripts, cobertura y restauración son gates previos a testers. |

**Gate global**: PASS para el diseño. No se detectan violaciones constitucionales
ni se solicitan excepciones. La aprobación no equivale a implementación: los
gates de exactitud, seguridad, restauración, accesibilidad y operación deben
pasar antes de invitar testers o declarar listo el lanzamiento.

## Project Structure

### Documentation (this feature)

```text
specs/001-personal-finance-tracker/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── supabase-data-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (planned; not created in this phase)

```text
src/
├── app/
├── features/
│   ├── auth/
│   ├── accounts/
│   ├── categories/
│   ├── movements/
│   ├── summaries/
│   ├── goals/
│   └── sync/
└── lib/
    ├── storage/
    └── supabase/
public/
supabase/
├── migrations/
├── functions/
│   └── process-expired-account-deletions/
└── tests/
    └── database/
tests/
├── unit/
├── integration/
└── e2e/
```

**Structure Decision**: una SPA TypeScript en un único proyecto, organizada por
flujos funcionales. `supabase/migrations` contiene el esquema, RLS y RPC;
`supabase/functions` contiene solo el worker de eliminación programada, no una
API general. Las pruebas de base de datos quedan junto a Supabase y las de
cliente bajo `tests/`. Setup ya materializa el shell de React, las herramientas
compartidas y la configuración local de Supabase; las funciones, migraciones y
pruebas de dominio se incorporan en fases posteriores.

## Complexity Tracking

No hay violaciones constitucionales que justificar. La función Edge programada
resuelve el borrado que requiere privilegios administrativos y no introduce un
servidor de aplicación general.
