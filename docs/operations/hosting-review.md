# Revisión de hosting estático

**Revisado:** 2026-09-27
**Estado de T056:** Pendiente. No se eligieron proveedor, cuenta, plan ni dominio; no se hizo despliegue ni revisión de una configuración de cuenta.

## Alcance verificado

El plan define una SPA estática portable. El cliente de Supabase se inicializa en el navegador con `VITE_SUPABASE_URL` y una publishable key; la arquitectura no requiere una API de negocio del hosting. Esto describe el diseño, no es una captura de tráfico de un despliegue. No hay `.env.local` ni configuración de hosting en el repositorio.

El público previsto en el informe de producto son personas en Argentina. La app guarda registros de ingresos y gastos y permite describir compras con tarjeta, pero no solicita PAN, CVV ni credenciales de tarjeta. No se concluye que esa distinción resuelva por sí sola la interpretación contractual de cada proveedor.

## Candidatos revisados

| Candidato             | Evidencia oficial consultada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Consecuencia para Mave                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby          | Los términos, actualizados el 2026-06-01, limitan Hobby a uso personal o no comercial. También permiten usar el contenido de Hobby para entrenamiento de IA y compartirlo con terceros para mejorar modelos; los términos describen una opción de exclusión en la configuración del equipo. La cuenta no existe o no fue inspeccionada, así que esa opción no está verificada. La página de precios publica 1 M de Edge Requests y 100 GB de transferencia por mes; la guía de límites publica 100 despliegues diarios y 100 MB de archivos fuente subidos por CLI en Hobby. | Solo considerar si el uso y la audiencia cumplen las condiciones vigentes, se revisa la opción de entrenamiento y se confirma qué contenido llega al hosting. No dirigir payloads financieros al hosting. Hobby no queda aprobado para testers por esta revisión. |
| Cloudflare Pages Free | Los términos prohíben procesar o recolectar información personal o empresarial de tarjetas de crédito en una propiedad web que recibe servicios gratuitos. La guía de Pages, actualizada el 2026-09-05, publica 500 builds por mes, una build concurrente, 20.000 archivos por sitio y 25 MiB por archivo.                                                                                                                                                                                                                                                                   | El alcance de “información de tarjetas” respecto de registros de gastos requiere aclaración escrita antes de seleccionar este plan. La app no guarda números ni códigos de tarjeta, pero esta revisión no sustituye la respuesta del proveedor.                   |

Los dos candidatos entregan archivos estáticos mediante redes globales; no se seleccionó una región para el frontend ni se verificó en cuenta el tratamiento de logs, privacidad, cuotas efectivas o redirects. El plan Supabase tampoco está elegido. Supabase publica São Paulo (`sa-east-1`) como región disponible; la disponibilidad publicada no demuestra que sea la región de un proyecto existente ni una certificación legal.

## Decisión y gate

No se elige proveedor por inferencia. Antes de desplegar con testers, decidir audiencia y uso (personal, prueba no comercial o lanzamiento), proveedor/plan, región de datos y dominio; volver a confirmar términos, privacidad y cuotas en la cuenta; y probar que los requests con datos financieros van directamente a Supabase y no aparecen en logs o analítica del hosting. Hasta entonces, T056 sigue incompleta y no se deben invitar testers externos.

Esta nota registra una revisión técnica, no es asesoramiento legal ni una aceptación de términos en nombre de la persona responsable del producto.

## Fuentes oficiales

- [Vercel Terms of Service](https://vercel.com/legal/terms), actualización indicada: 2026-06-01.
- [Vercel Pricing](https://vercel.com/pricing) y [Vercel Limits](https://vercel.com/docs/limits/overview), consultados el 2026-09-27.
- [Vercel Data Processing Addendum](https://vercel.com/legal/dpa) y [Privacy Notice](https://vercel.com/legal/privacy-policy), consultados el 2026-09-27. El DPA publicado describe su alcance para clientes Pro y Enterprise; no asumir que se aplica a Hobby.
- [Cloudflare Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/), actualización indicada: 2025-09-12, sección 2.2.1(h).
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), actualización indicada: 2026-09-05.
- [Supabase available regions](https://supabase.com/docs/guides/platform/regions) y [Supabase security](https://supabase.com/security), consultados el 2026-09-27.
