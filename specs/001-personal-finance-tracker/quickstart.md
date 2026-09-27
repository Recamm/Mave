# Guía de validación de Mave

## Estado actual

La SPA React/Vite, los flujos de producto, las migraciones `0002` a `0009` y las pruebas de cliente están en el repositorio. Esta guía separa la validación local de cliente de la validación del backend: las pruebas Playwright usan configuración de prueba y no certifican un proyecto Supabase remoto, su SMTP ni sus backups.

Los escenarios de escritorio y las pruebas automatizadas no sustituyen la validación manual en Safari de iPhone/VoiceOver ni una restauración real. No usar datos financieros reales en proyectos de prueba.

## Requisitos previos de implementación

- Node.js `>=22.12.0` y npm según `package-lock.json`; CI usa Node 24.
- Supabase CLI y Docker para levantar el stack local y ejecutar migraciones/pgTAP.
- Chromium para Playwright; Safari en un iPhone real para validar instalación, persistencia y uso offline.
- Proyecto Supabase de prueba aislado del proyecto de producción si se prueban Auth, SMTP, datos remotos o restauración.
- Cuenta SMTP controlada si se ejercitan confirmación y recuperación; el SMTP predeterminado de Supabase no es canal para testers abiertos.

## Configuración y ejecución local

Los scripts npm están definidos en `package.json`. Para validar la aplicación y los flujos de cliente:

```powershell
npm ci
npx playwright install chromium
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run dev
```

La configuración de Playwright usa una URL y una publishable key ficticias; no son credenciales ni prueban Auth/SMTP remoto. Los escenarios pgTAP y el comportamiento real de Supabase deben validarse por separado.

Con Docker y Supabase CLI disponibles, los comandos de base de datos son:

```powershell
supabase start
supabase db reset
supabase test db
```

`supabase db reset` reconstruye la base local y aplica las migraciones. Ejecutarlo únicamente contra el stack local descartable; nunca usarlo contra datos reales. La suite pgTAP se encuentra en `supabase/tests/database/`.

Configurar el entorno local con la URL Supabase y la publishable key, por ejemplo `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Son valores destinados al cliente y solo son seguros junto con RLS y grants correctos. No agregar `service_role`, claves secretas ni credenciales SMTP a variables `VITE_*`, al bundle o al repositorio. Las credenciales administrativas de la función programada se configuran como secretos del entorno server-side de Supabase. Mantener `.env.local` fuera del control de versiones.

Para probar el job programado de `0008_schedule_account_deletion.sql`, preparar valores descartables en el entorno de prueba: `ACCOUNT_DELETION_CRON_SECRET` para la función Edge y `account_deletion_project_url`, `account_deletion_publishable_key` y `account_deletion_cron_secret` en Vault. El secreto de Vault debe coincidir con el de la función. La función usa la clave administrativa solo desde el entorno confiable de Edge. No reutilizar valores de producción ni copiarlos al repositorio, al SQL de la migración o a variables `VITE_*`. Si no se ejecuta el job, registrar el scheduler como no validado.

## Escenarios de validación

### 1. Auth y aislamiento

1. Registrar dos usuarios de prueba con correo confirmado, iniciar sesión en ambos en contextos separados y completar recuperación de contraseña con el SMTP de prueba.
2. Crear movimientos, cuentas, categorías, metas y aportes bajo el primer usuario.
3. Desde el segundo usuario, intentar consultas, cambios y referencias directas usando los IDs del primero, no solo filtros normales de UI.
4. Resultado esperado: ninguna fila privada se filtra o modifica; las referencias cruzadas fallan; la exportación del segundo usuario no contiene datos del primero. Repetir pruebas con rol anónimo y rol autenticado donde corresponda.

### 2. Exactitud y reglas financieras

Los importes ARS/USD aceptan como máximo 2 posiciones decimales. Las entradas con más decimales se rechazan explícitamente; no se redondean.

Cargar un conjunto reproducible con fechas de un mismo período y verificarlo contra cálculo manual:

| Moneda | Ingresos del período | Gastos fechados en el período | Devoluciones recibidas en el período | Transferencias |
| ------ | -------------------: | ----------------------------: | -----------------------------------: | -------------: |
| ARS    |              1000.00 |                        300.00 |                               100.00 |         200.00 |
| USD    |                10.00 |                          3.00 |                                 0.00 |           0.00 |

Resultado esperado: ingresos ARS 1000.00, gastos netos ARS 200.00 y diferencia neta ARS 800.00; ingresos USD 10.00, gastos USD 3.00 y diferencia neta USD 7.00. Las transferencias no alteran esos totales y ninguna operación combina ARS con USD. Incluir una devolución ligada a un gasto de un período anterior para confirmar que reduce el período de recepción, no el del gasto original, y no se registra como ingreso.

Para saldos, partir de una cuenta ARS con saldo inicial 1000.00; asociar ingreso 500.00, gasto 300.00, devolución 100.00 y transferencia enviada 200.00. Resultado esperado: 1100.00 en origen y 200.00 acreditados al destino. Una devolución que excede lo aún no devuelto, transferencia entre monedas distintas, entre cuentas ajenas o a la misma cuenta debe rechazarse sin escrituras parciales. Registrar aporte a una meta y comprobar que no cambia ningún saldo.

Repetir con importes que ejerciten la escala de 2 decimales y valores con mayor precisión. El resultado debe ser exacto; las entradas con más de 2 decimales se rechazan explícitamente y no se redondean.

### 3. Offline, reintentos y logout

1. En Safari iPhone, iniciar sesión online y confirmar que la app ya se abrió al menos una vez.
2. Activar modo avión, crear un movimiento y confirmar su estado local/pendiente.
3. Recargar mientras el almacenamiento local sigue disponible; el movimiento debe seguir visible y advertirse que no es un backup.
4. Cerrar la app mientras quedan pendientes; volver a abrir con conexión. Confirmar que sincroniza al abrir y que repetir la solicitud no duplica el movimiento.
5. Repetir con cierre de sesión. La UI debe advertir sobre pendientes; la cola queda ligada al usuario original y no se muestra ni se envía con la segunda cuenta.

No usar el retorno de red con la PWA cerrada como criterio de éxito: iOS puede no ejecutar la sincronización en segundo plano. Probar también el comportamiento cuando el usuario borra los datos del navegador o el almacenamiento local no está disponible.

### 4. Conflicto entre dispositivos

1. Abrir el mismo movimiento en dos dispositivos o contextos autenticados como la misma persona.
2. Partir de la misma versión, realizar cambios incompatibles y sincronizar ambos.
3. Resultado esperado: se muestran ambas versiones y sus diferencias; el movimiento aporta una sola vez a los totales; hasta la elección no se descarta ningún cambio.
4. Elegir cada versión en ejecuciones separadas. Verificar que solo la elegida determina saldo/resumen, el conflicto queda resuelto y repetir la resolución no la aplica otra vez.

### 5. Categorías, metas y exportación

- Crear, renombrar y archivar una categoría. La categoría archivada no se ofrece para movimientos nuevos y los registros históricos conservan su etiqueta y resumen.
- Crear una meta y aporte. Confirmar que el progreso cambia pero ningún movimiento ni saldo de cuenta cambia.
- Exportar CSV y JSON de cada usuario. Comprobar importes exactos, moneda, fechas, IDs y relaciones; confirmar que no hay filas del otro usuario. CSV debe abrirse como columnas útiles en una planilla; JSON debe conservar claves y relaciones estructuradas.

### 6. Eliminación de cuenta y expiración

Usar reloj controlado en pruebas para no esperar 30 días reales.

1. Solicitar eliminación online; la confirmación presenta estado y vencimiento de servidor a 30 días calendario.
2. Cancelar antes del vencimiento; confirmar que la sesión vuelve a estado activo y el sync se permite.
3. Solicitar de nuevo y simular la hora límite. Desde ese instante el servidor/RLS rechaza nuevos sync aunque el job esté detenido.
4. Ejecutar dos veces el worker; la operación debe ser idempotente, borrar datos y Auth, y reportar/recuperar fallos parciales sin afirmar éxito prematuro.
5. Probar que la función no acepta un `user_id` arbitrario desde el navegador, que no se puede cancelar una solicitud vencida y que ninguna clave administrativa está en el build o logs.

En un dispositivo offline, los pendientes se purgan al volver a abrir Mave con esa identidad después de reconectar. Un dispositivo que nunca vuelve a conectarse conserva datos locales hasta que se borren sus datos; la interfaz debe advertirlo antes de enviar la solicitud.

### 7. PWA, accesibilidad y hosting

- Instalar desde Safari en iPhone y abrir la versión de escritorio responsive por HTTPS.
- Completar alta, captura, resumen, búsqueda/consulta, exportación y logout con teclado y VoiceOver; foco visible, contraste WCAG 2.2 AA y estados no expresados solo por color.
- Confirmar que el service worker sirve shell/assets offline pero no almacena respuestas financieras como caché compartida.
- Probar build estático y navegación directa/recarga en el hosting elegido.

## Gates antes de invitar testers

- Pruebas negativas de RLS y grants aprobadas para cada tabla expuesta y RPC.
- Pruebas de cálculos, escala decimal, idempotencia, conflictos y expiración aprobadas.
- SMTP real de prueba, recuperación y límites de Auth verificados.
- Backups cifrados, retención confirmada y restauración completa ensayada; guardar evidencia del resultado.
- Términos, límites, privacidad y cuotas actuales del proveedor de hosting y del plan Supabase revisados para el uso previsto. El informe de producto deja cuestiones que requieren confirmación, por lo que no asumir que un plan gratuito autoriza testers o uso comercial.
- Safari iPhone real validado; documentar limitaciones de background sync y pérdida del almacenamiento local.
