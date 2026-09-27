# Inicio de sesión con código y notificaciones push

El acceso desde PC puede autorizarse con un código de seis dígitos desde un teléfono que ya tenga una sesión abierta. El código vence a los tres minutos, permite hasta cinco intentos y nunca se incluye en una notificación push. Si Mave está abierta, la solicitud aparece en el popup de aprobación; si no hay una ventana de Mave, el teléfono recibe una notificación genérica que abre la bandeja.

## Preparar secretos

Genera un pepper aleatorio de al menos 32 bytes con Node.js:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Genera el par VAPID una sola vez con `web-push` y conserva ambos valores para los despliegues siguientes:

```powershell
npm exec --yes --package=web-push -- web-push generate-vapid-keys --json
```

Configura en los secretos del proyecto Supabase:

- `WEB_LOGIN_CODE_PEPPER`: pepper aleatorio; solo Edge Function.
- `WEB_PUSH_VAPID_PUBLIC_KEY`: clave pública del par; Edge Function.
- `WEB_PUSH_VAPID_PRIVATE_KEY`: clave privada del par; solo Edge Function.
- `WEB_PUSH_VAPID_SUBJECT`: URI `mailto:` real o URI HTTPS pública de contacto.

Configura `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` con la misma clave pública en el entorno de build del frontend. Para desarrollo local, usa `.env.local`, nunca `VITE_*` para secretos. No guardes el pepper ni la clave VAPID privada en Git, artefactos de build, logs o variables disponibles al navegador. No uses un `mailto:...@localhost` como subject.

## Aplicar y desplegar

Revisa el SQL antes de aplicarlo. La migración `0013_web_login_codes_and_push.sql` crea el registro privado de suscripciones y las funciones de servidor para limitar solicitudes, validar intentos y vincular cada aprobación a una cuenta. Después de configurar los secretos:

```powershell
npx supabase db push
npx supabase functions deploy web-login
```

Vuelve a generar el build del frontend después de configurar `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`. El origen público debe usar HTTPS para Service Workers, cámara y Web Push; `localhost` se admite para desarrollo. Para validar la base local se requiere Docker en ejecución:

```powershell
npx supabase start
npx supabase test db
```

## Validación operativa

Prueba con dos dispositivos y una cuenta de prueba confirmada: solicita acceso en PC, confirma el popup con Mave abierta, rechaza otra solicitud, cierra Mave y confirma la notificación genérica y su apertura. Verifica también que un correo desconocido no revele si hay una cuenta, que un código incorrecto consuma un intento y que el sexto intento no sea posible. No incluyas códigos, tokens ni endpoints push en capturas o reportes.

La suscripción pertenece a la cuenta autenticada y solo el rol de servicio puede leerla o modificarla. El endpoint debe ser HTTPS y de un proveedor push admitido. La entrega push depende de los permisos del navegador y del sistema operativo; la bandeja autenticada sigue consultando solicitudes mientras Mave está abierta.

## Referencia

- [web-push: VAPID keys and Web Push API](https://github.com/web-push-libs/web-push), consultado el 2026-09-27.
- [Supabase Edge Functions: secrets](https://supabase.com/docs/guides/functions/secrets), consultado el 2026-09-27.