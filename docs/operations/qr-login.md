# Acceso web con QR

El inicio con QR crea una solicitud válida durante tres minutos. El QR contiene únicamente el secreto de aprobación; el secreto para consultar y consumir la sesión se mantiene en memoria en el navegador del PC. El celular debe iniciar sesión, desbloquear su PIN local si está configurado y confirmar el host y la cuenta antes de autorizar.

La Edge Function genera un magic link mediante Supabase Auth, guarda su hash en una tabla sin acceso para `anon` ni `authenticated` y permite consumirlo una sola vez desde el PC. El hash de sesión nunca se incluye en el QR. No se envía un correo.

## Despliegue

Antes de habilitar el flujo en un proyecto Supabase:

1. Revisa el estado remoto y aplica las migraciones pendientes, incluida `0012_web_login_challenges.sql`.
2. Despliega `supabase/functions/web-login`.
3. Confirma que la función mantenga `verify_jwt = false`; valida el JWT del celular explícitamente para la acción de aprobación.
4. Prueba desde el origen HTTPS real: generar QR, inspeccionar el host en el celular, aprobar, canjear en el PC y confirmar que una segunda consulta no entrega otra sesión.

Comandos habituales con Supabase CLI, después de vincular el proyecto correcto:

```powershell
supabase db push --dry-run
supabase db push
supabase functions deploy web-login
```

La función utiliza las variables administradas por Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, con compatibilidad para `SUPABASE_SECRET_KEYS`). No copies claves de servicio al frontend.

## Estado de despliegue

Revisado el 2026-09-27: las migraciones `0002`–`0012` figuran aplicadas en el proyecto Supabase Mave. La Edge Function `web-login` está activa con `verify_jwt = false`; la aprobación valida explícitamente la sesión del celular. Una prueba real desde la app confirmó que `start` devuelve `201`, que el QR se muestra y que `poll` pendiente devuelve `200`.

La aprobación con una sesión real del celular aún no se probó. El dominio Vercel informado ya publica una versión anterior de Mave, pero todavía no contiene estos cambios de PIN/QR. Para actualizarlo, los cambios deben llegar al branch conectado a Vercel y el despliegue debe terminar correctamente. Configura también `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en las variables del proyecto de Vercel; el archivo `.env` local no se publica. No uses `127.0.0.1` como dirección para el teléfono.
