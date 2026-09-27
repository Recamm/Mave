# Operación de correo de Auth

**Revisado:** 2026-09-27
**Estado de T057:** Bloqueado para la prueba de correo. El 2026-09-27 se configuró un proyecto Supabase remoto de pruebas: migraciones `0002`–`0009` aplicadas, Edge Function desplegada y cron activo cada 15 minutos. Los secretos del worker están configurados en Edge/Vault. Brevo fue indicado como proveedor SMTP, pero su integración en Supabase Auth y el remitente/dominio aún no están verificados; no se envió ningún correo.

## Evidencia disponible

La configuración local de `supabase/config.toml` usa `http://127.0.0.1:5173` como `site_url` y redirect local. No existe una URL de despliegue autorizada. La configuración E2E usa valores ficticios y no valida el flujo de correo.

Auth remoto tiene email habilitado, registro permitido y confirmación por correo obligatoria. Para esta sesión se acordó usar `http://127.0.0.1:5179`; falta configurar ese `site_url` y permitir `http://127.0.0.1:5179/**` en el dashboard. El puerto puede cambiar en otra sesión.

La guía vigente de Supabase indica que el SMTP predeterminado solo envía a direcciones autorizadas del equipo, tiene actualmente un límite de 2 mensajes por hora y no ofrece SLA de entrega o disponibilidad. Al habilitar SMTP propio, Supabase documenta inicialmente un límite bajo de 30 mensajes por hora, configurable desde Auth. Estos límites deben volver a verificarse en el dashboard al seleccionar un proyecto.

## Configuración y prueba pendientes

| Control                              | Evidencia requerida                                                                        | Estado     |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ---------- |
| Proyecto/plan Supabase y responsable | Proyecto de pruebas provisionado; plan y responsable aún no registrados                    | Parcial    |
| Proveedor SMTP y remitente           | Brevo indicado por el usuario; falta cargar credenciales y verificar el remitente/dominio  | Parcial    |
| SPF, DKIM y DMARC                    | Verificación DNS del dominio de envío                                                      | Pendiente  |
| Confirmación de registro             | Mensaje recibido en buzón controlado y enlace de vuelta a la URL correcta                  | No probado |
| Recuperación de contraseña           | Mensaje y enlace probados con cuenta descartable                                           | No probado |
| Redirect URLs                        | Origen local `http://127.0.0.1:5179` acordado; falta cargarlo en Auth y probar los enlaces | Pendiente  |
| Límites, rebotes y monitoreo         | Valor de rate limit del dashboard y responsable de revisar fallos                          | Pendiente  |

Al completar la prueba, usar únicamente cuentas y buzones controlados en un proyecto descartable; verificar nombre/dirección del remitente, URL de destino, expiración del enlace, límites y recuperación. Guardar fechas y resultados sin correos personales, tokens ni contenido de mensajes. Mantener usuario/contraseña SMTP solo en el gestor de secretos o dashboard del proveedor, nunca en Git, `VITE_*` ni este reporte.

T057 permanece incompleta hasta configurar el servicio y observar confirmación y recuperación reales. No invitar testers con el SMTP predeterminado.

## Fuente oficial

- [Supabase Auth: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), consultada el 2026-09-27. Los límites y el comportamiento pueden cambiar.
