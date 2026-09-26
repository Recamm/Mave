# Investigación técnica

**Fecha de revisión**: 2026-09-26  
**Alcance**: investigación Phase 0 de `/speckit-plan`. Este documento registra decisiones de diseño y sus límites; no implementa la aplicación ni fija tareas.

## D-01: SPA estática para la PWA

**Decision**: usar React, TypeScript y Vite para una aplicación web estática instalable. El hosting sirve el shell de la app; no se agrega un servidor propio ni SSR.

**Rationale**: Mave es individual, manual-first y no requiere una API de negocio propia. La SPA permite mantener una salida estática portable y atender la captura local sin esperar a la red. Auth y persistencia canónica quedan en el servicio gestionado; el service worker se limita al shell y los assets de la interfaz.

**Alternatives considered**: Next.js con SSR o un backend propio. No hay requisito funcional que justifique operar esos componentes en esta versión. Una app nativa tampoco es necesaria para el alcance PWA de la spec.

**Consequences**: publicar solo por HTTPS; no cachear respuestas ni documentos financieros en el service worker. La sincronización se intenta al abrir o volver a primer plano, sin prometer ejecución con la PWA cerrada en iOS.

## D-02: Postgres como fuente canónica

**Decision**: usar Supabase Auth y Postgres como recomendación de arquitectura; conservar independencia del hosting de frontend. Los datos financieros canónicos residen en Postgres.

**Rationale**: movimientos, cuentas, categorías, transferencias, devoluciones, metas, aportes y conflictos tienen relaciones y restricciones que conviene expresar con claves foráneas, constraints y transacciones. PostgreSQL `numeric` es exacto para importes decimales; `real` y `double precision` son aproximados. La spec requiere resultados exactos, monedas separadas y resolución explícita de conflictos.

**Alternatives considered**: Firestore es una alternativa gestionada válida y sus Security Rules también se aplican en el servidor. Sin embargo, su documentación define last-write-wins para escrituras concurrentes al mismo documento, por lo que el requisito de conservar dos versiones y pedir elección exigiría más lógica de aplicación. La persistencia web de Firestore está deshabilitada por defecto; habilitarla también obliga a diseñar expresamente el comportamiento de caché y datos residuales entre sesiones. No se la descarta por falta de controles de seguridad.

**Consequences**: modelar relaciones y restricciones en Postgres, pero verificar el aislamiento por usuario con políticas y pruebas. No usar punto flotante binario para dinero. Antes de implementar, acordar escala aceptada y si los decimales adicionales se rechazan o redondean; `numeric(p,s)` puede redondear valores de entrada a la escala declarada. No se fija aquí una escala que la spec no decidió.

## D-03: Aislamiento por grants y RLS

**Decision**: habilitar Row Level Security en cada tabla expuesta con datos privados y definir grants mínimos además de políticas específicas por operación. Cada entidad propiedad de una persona llevará una clave de propietario vinculada al identificador de Auth; las referencias entre filas deben impedir asociaciones cruzadas entre propietarios.

**Rationale**: RLS filtra filas en el servidor, pero no sustituye los privilegios SQL. La documentación de Supabase recomienda probar ambos controles y advierte que las claves administrativas omiten RLS.

**Alternatives considered**: confiar en filtros del cliente o en que la SPA solo solicite filas propias. Se descarta porque un cliente manipulado puede omitir esos filtros.

**Consequences**: las lecturas, inserciones, actualizaciones y borrados tendrán políticas explícitas; se deniega por defecto. Probar acceso permitido y denegado con dos cuentas distintas. Ninguna clave secreta, `service_role` ni equivalente administrativo puede llegar al bundle, al navegador o a logs. La app no expondrá tablas de Auth directamente.

## D-04: Captura offline con IndexedDB y outbox

**Decision**: usar IndexedDB para movimientos pendientes y estado mínimo de sincronización, separado por cuenta autenticada. Postgres continúa siendo la fuente canónica una vez confirmado el sync.

**Rationale**: la spec exige captura tras una autenticación previa, persistencia local después de recargar y sincronización al volver a abrir con Internet, pero reconoce que los datos locales pueden perderse y no son un backup. Un outbox explícito permite reintentos idempotentes y mantener el estado visible.

**Alternatives considered**: depender de Background Sync o guardar respuestas financieras en caché del service worker. No se eligen como garantía: iOS no asegura sincronización con la app cerrada y el caché del shell no debe convertirse en una copia financiera inadvertida.

**Consequences**: cada operación pendiente necesita identidad estable para que reintentar no duplique movimientos. Al cerrar sesión, ocultar y aislar la cola de su propietario; no permitir que otra cuenta la lea o envíe. Al reconectar después del vencimiento de una solicitud de eliminación, descartar datos locales de esa cuenta y rechazar el sync. La UI debe distinguir local, pendiente, sincronizado y requiere atención.

## D-05: Contrato de conflictos

**Decision**: conservar las versiones incompatibles del mismo movimiento y solicitar una elección explícita; solo una versión elegida afecta saldos y resúmenes.

**Rationale**: FR-021 prohíbe sobrescrituras silenciosas y doble conteo. La resolución automática last-write-wins no expresa esa regla de producto.

**Alternatives considered**: aplicar siempre la versión más reciente o duplicar el movimiento al importar el cambio. Ambas opciones pierden cambios o inflan totales en contra de la spec.

**Consequences**: el modelo deberá identificar la entidad lógica, cada versión, el estado abierto/resuelto y la elección; los reintentos y cambios de distintos dispositivos deben ser idempotentes. La estrategia de concurrencia y las transacciones que cierran un conflicto se detallan en Phase 1, no en este registro de investigación.

## D-06: Auth por email y contraseña

**Decision**: recomendar Supabase Auth con email y contraseña, confirmación de email y recuperación de contraseña; no guardar contraseñas en las tablas de Mave.

**Rationale**: cubre creación de cuenta, sesión, recuperación y uso offline posterior a autenticación sin incorporar proveedor social al alcance.

**Alternatives considered**: magic link/OTP y proveedores OAuth. No son necesarios para el MVP y todos requieren evaluar entrega de correo o configuración externa.

**Consequences**: el SMTP predeterminado de Supabase es limitado para pruebas controladas: solo envía a destinatarios autorizados y tiene un límite documentado de 2 mensajes por hora, sujeto a cambios. Antes de habilitar altas de testers o público, configurar y probar un SMTP propio, remitente, confirmación, recuperación, límites y URLs de redirección. Revalidar estos límites al implementar; no tratar el servicio predeterminado como canal de producción.

## D-07: Solicitud y borrado programado

**Decision**: registrar en datos propios de la aplicación la solicitud de eliminación, su fecha de recepción, vencimiento y estado de cancelación. En el vencimiento, un proceso confiable del servidor elimina los datos de Mave y la cuenta Auth. Supabase Cron más una Edge Function es la opción recomendada para orquestar esa operación, pendiente de comprobar disponibilidad y límites del plan elegido.

**Rationale**: FR-016 requiere un período cancelable de 30 días calendario y borrado aun cuando la persona no vuelva a abrir la app. La API administrativa de Auth requiere una clave secreta y debe ejecutarse en un servidor de confianza. Supabase Cron puede ejecutar SQL o invocar Edge Functions; Vault permite almacenar credenciales usadas por jobs.

**Alternatives considered**: borrar únicamente desde el cliente cuando vuelva a conectarse o confiar en una tarea ejecutada manualmente. Ninguna garantiza el vencimiento si la persona no vuelve a usar Mave.

**Consequences**: las políticas de sync deben denegar escrituras a partir del vencimiento, aunque el job programado se retrase; no depender solo de la puntualidad del cron. Durante la gracia, la sincronización sigue permitida y cancelar revoca el borrado pendiente. Una función programada debe seleccionar solicitudes vencidas en el servidor y no aceptar un `user_id` arbitrario del navegador. Los JWT ya emitidos pueden seguir válidos hasta su expiración, incluso después de borrar el usuario Auth; limitar esa ventana y comprobar el estado de la solicitud en rutas sensibles. La clave administrativa nunca se entrega al cliente. La app no necesita Storage para su alcance actual; si agrega objetos en el futuro, debe borrarlos o reasignarlos antes de borrar al usuario Auth.

**Límite del requisito**: un dispositivo que nunca vuelve a conectarse no puede recibir la orden de purgar su almacenamiento local. La spec ya lo explicita; se advertirá que esos datos pueden permanecer en el dispositivo hasta que se borren sus datos.

## D-08: Hosting estático portable, proveedor pendiente

**Decision**: desplegar el frontend como archivos estáticos detrás de HTTPS y mantener la configuración independiente del proveedor. No se fija todavía el proveedor para testers o producción.

**Rationale**: la arquitectura no requiere cómputo de servidor propio para servir la interfaz, y la portabilidad permite cambiar de hosting sin migrar los datos canónicos.

**Alternatives considered**: Vercel Hobby y Cloudflare Free, según el informe de producto. El informe condiciona Vercel Hobby a uso personal/no comercial y pide aclarar por escrito la cláusula de Cloudflare Free relacionada con información de tarjetas. Ninguna conclusión contractual se presume aquí.

**Consequences**: antes de invitar testers o habilitar uso no personal, revisar términos vigentes, límites, privacidad, región y condiciones de uso con datos financieros; solicitar confirmación escrita cuando el informe lo requiera. Revalidar precios y cuotas al decidir el despliegue. Esta investigación no constituye asesoramiento legal ni certifica un plan gratuito para producción.

## D-09: Backups y restauración como gate de lanzamiento

**Decision**: no considerar el backup del proveedor ni la exportación de usuario como suficientes por sí solos. Antes de testers, definir retención y cifrado de backups y ejecutar una restauración de prueba.

**Rationale**: el informe de producto identifica backups, restauración, límites y términos como condiciones para pasar del prototipo. La exportación FR-015 sirve a la persona y no demuestra recuperación operativa del servicio.

**Alternatives considered**: confiar únicamente en copias automáticas gestionadas o en exportaciones manuales. No prueban una restauración recuperable ni cubren el mismo objetivo.

**Consequences**: verificar opciones reales y retención del plan Supabase elegido; documentar responsable, procedimiento, RPO/RTO esperado y evidencia de una restauración antes de abrir testers. No afirmar que el nivel gratuito cumple hasta comprobarlo en la cuenta y fecha de despliegue.

## Fuentes revisadas

- [Informe de producto y hosting](../../info/finanzas-pwa/informe-producto.md), contexto provisto para esta planificación.
- [PostgreSQL: Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html), exactitud y escala de `numeric`.
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), RLS y políticas en Postgres.
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api), privilegios y seguridad de la Data API.
- [Supabase: User Management](https://supabase.com/docs/guides/auth/managing-user-data), referencias y eliminación de usuarios; los JWT ya emitidos pueden seguir válidos hasta expirar.
- [Supabase JS: Admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), requisito de clave secreta y ejecución server-side.
- [Supabase: Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) y [Cron](https://supabase.com/docs/guides/cron), programación y monitoreo de jobs.
- [Supabase: SMTP](https://supabase.com/docs/guides/auth/auth-smtp), restricciones de correo predeterminado; confirmar cuota vigente antes de operar.
- [Firebase: Security Rules](https://firebase.google.com/docs/firestore/security/get-started) y [offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline), controles server-side, persistencia web y comportamiento de concurrencia comparados para la alternativa Firestore.

## Pendientes que bloquean testers o implementación

- Validar mediante pruebas que los importes ARS/USD acepten hasta 2 decimales y rechacen entradas más precisas, sin redondeo ni punto flotante.
- Probar grants y RLS por tabla y operación con pruebas negativas entre dos cuentas.
- Probar reintentos idempotentes, conflictos abiertos/resueltos y logout con una outbox no vacía.
- Definir y probar la expiración de solicitudes, denegación de sync al vencimiento y borrado Auth/data con credenciales solo server-side.
- Confirmar SMTP, términos del hosting, cuotas y backups/restauración en los planes y fechas efectivamente elegidos.
- Verificar la PWA y persistencia local en Safari real de iPhone, incluyendo el comportamiento al cerrar sesión y al borrar datos del navegador.
