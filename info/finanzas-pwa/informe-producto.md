# Informe de arranque: Mave, PWA de finanzas personales

**Fecha de investigación**: 2026-09-26  
**Estado**: nombre Mave definido; stack e identidad visual final pendientes  
**Insumos para Spec Kit**: [constitution-input.md](constitution-input.md) y [specify-input.md](specify-input.md)

## Resumen ejecutivo

Construir Mave como una PWA instalable, en español y enfocada en finanzas personales, para registrar manualmente ingresos y gastos desde iPhone y PC. La app debe servir sin conexión para cargar movimientos, mostrar claramente cuáles están pendientes y sincronizarlos cuando vuelva a abrirse con Internet. Cada persona tendrá una cuenta privada; los espacios compartidos quedan para después.

La recomendación de datos es **Supabase (Postgres + Auth + políticas de acceso por usuario)**. Para un prototipo estrictamente personal y no comercial, **Vercel Hobby + Supabase Free** puede costar USD 0 si se aceptan sus condiciones. No usaría Vercel Hobby como supuesto de hosting para un producto abierto al público. La elección definitiva de host se debe revalidar antes de invitar usuarios, porque Cloudflare Free contiene una cláusula específica sobre datos de tarjetas y los planes gratuitos pueden pausar servicios al alcanzar límites.

La PWA no necesita App Store ni dominio propio para probarse: un subdominio HTTPS del proveedor permite instalarla desde Safari en iPhone y abrirla como app desde el escritorio. El nombre del producto es Mave; faltan diseñar el logo y definir la identidad visual final.

## Problema y público

- **Público inicial**: personas en Argentina que quieren anotar movimientos personales y comprender sus gastos y ahorros, sin dar permisos bancarios ni cargar credenciales de billeteras.
- **Dolor a resolver**: el registro financiero se abandona cuando exige muchos campos, depende de una integración incompleta o no ayuda a ver el resultado de los gastos.
- **Propuesta**: captura manual rápida, historial confiable, resumen mensual legible y metas de ahorro sencillas.
- **Criterio de confianza**: los datos financieros pertenecen a la persona, quedan privados por defecto y no se monetizan ni se comparten como parte de esta primera versión.

## Alcance propuesto

### MVP

- Registro, inicio y cierre de sesión para una cuenta personal privada.
- Ingresos, gastos y transferencias manuales, con historial y filtros por período.
- Registro de importe, tipo, moneda, fecha y categoría; cuenta y nota son opcionales para no frenar la captura.
- Resumen de ingresos, egresos y diferencia neta, separado por moneda y con agrupación por categoría.
- Cuentas iniciales de efectivo, banco, billetera digital y otra cuenta; saldo inicial opcional.
- Metas de ahorro sencillas, con objetivo y aportes manuales de seguimiento.
- Uso instalable desde iPhone y PC, modo offline para movimientos pendientes y sincronización al volver a abrir la app con conexión.
- Tema oscuro inicial y selector claro/oscuro/sistema; diseño accesible, responsive y de lectura rápida.
- Exportación de datos y flujo para pedir su eliminación.

### Fuera del MVP

- OAuth, scraping o lectura automática de transacciones de Mercado Pago o bancos. La documentación pública de Mercado Pago consultada se centra en recursos de vendedores y conciliación; no confirma cobertura completa de compras personales. No pedir ni almacenar credenciales bancarias.
- Pagos, custodia de fondos, asesoramiento financiero o recomendaciones de inversión.
- Espacios compartidos, permisos de hogar y roles entre usuarios.
- Sincronización en segundo plano con la PWA cerrada en iOS; Safari no permite prometer ese comportamiento.
- Conversión automática de moneda, cotizaciones, recurrencias, presupuestos avanzados, conciliación de tarjetas o resúmenes de tarjeta.
- App nativa mientras la PWA cubra el flujo validado.

## Reglas de producto que evitan errores de cálculo

1. Un movimiento es ingreso, gasto o transferencia. Una transferencia entre cuentas propias no se suma a los ingresos ni a los gastos.
2. En la primera versión se aceptan ARS y USD. Se muestran totales separados; no se aplica una cotización implícita.
3. Una transferencia requiere dos cuentas propias de la misma moneda. Las transferencias entre monedas quedan fuera del MVP.
4. Una cuenta puede tener saldo inicial opcional. Los totales de cuenta solo reflejan lo que la persona cargó; no se importan saldos reales de bancos.
5. Los aportes a una meta solo actualizan el progreso de la meta. No crean otro ingreso, gasto o transferencia.
6. Una compra con tarjeta puede cargarse como gasto manual, pero la deuda, el cierre, el vencimiento y la conciliación del resumen de tarjeta no se calculan en la primera versión.
7. La app conserva un movimiento local como **pendiente** hasta que la sincronización haya sido confirmada. Un registro pendiente no es un backup.

## Experiencia y dirección visual

- Mobile-first, con captura rápida y navegación previsible; los importes son la información visual principal.
- Oscuro por defecto, en una base tinta/ciruela con acento violeta/lavanda. Ofrecer claro, oscuro y sistema; la selección explícita persiste.
- Verde/menta puede indicar ahorro positivo, coral egresos/alertas y ámbar advertencias, siempre junto con etiqueta, forma o icono: nunca depender solo del color.
- Validar WCAG 2.2 AA: contraste de texto común 4.5:1; texto grande y elementos gráficos necesarios 3:1; foco visible y navegación por teclado.
- Evitar una pantalla tipo marketing, ilustraciones decorativas, demasiadas tarjetas o gráficos que oculten los números. El logo y el icono de la PWA alcanzan como assets iniciales; usar una librería de iconos consistente para acciones.
- Brubank sirve únicamente como referencia de identidad violeta; Naranja X como referencia de claridad financiera. No copiar marcas, logos, geometrías ni paletas exactas.

## Comportamiento offline y sincronización

- La primera autenticación requiere conexión; una persona con sesión iniciada previamente puede seguir registrando movimientos sin red.
- En iPhone, sincronizar al volver a abrir o traer la PWA a primer plano y cuando haya conexión. No esperar que sincronice con la app cerrada.
- Mostrar estados visibles: pendiente, sincronizado o requiere atención. Reintentar un envío no puede duplicar el movimiento.
- El almacenamiento del navegador es best-effort; solicitar persistencia si el navegador lo ofrece, pero explicar que la persona puede borrar esos datos. Avisar antes de cerrar sesión/cambiar de cuenta si quedan registros pendientes.
- Cachear la interfaz, no las respuestas financieras. Resolver conflictos sin sobrescribir cambios locales o remotos en silencio.

## Arquitectura recomendada

### Backend

- **Supabase Free** para Postgres, Auth y acceso seguro por fila. Mantener un `user_id` propietario en cada dato privado y probar las reglas de aislamiento de cada tabla expuesta.
- La PWA puede conectarse directamente al servicio con la clave publicable; **nunca** incluir una clave `service_role`/secreta en el navegador.
- Elegir São Paulo si aparece disponible para el proyecto Free; confirmar la disponibilidad al crear el proyecto. La ubicación ayuda con latencia, pero no garantiza por sí sola cumplimiento legal.
- En Free, el SMTP predeterminado está limitado a direcciones autorizadas y 2 emails por hora. Configurar SMTP propio antes de habilitar altas abiertas.
- Free puede pausar proyectos tras una semana de inactividad y no incluye backups automáticos descargables. Antes de movimientos reales, automatizar o documentar una exportación cifrada fuera del proveedor y probar la restauración.

### Hosting web

- Mantener el frontend estático y portable. No hay necesidad demostrada de SSR ni de alojar funciones de servidor para el flujo manual.
- Para un prototipo estrictamente personal: Vercel Hobby es una opción simple si se aceptan sus condiciones. Sus términos restringen Hobby al uso personal/no comercial y contemplan el uso de contenido alojado/gestionado para mejora de modelos de IA, con una opción de exclusión que se debe revisar en la cuenta. Si los movimientos viajan directamente a Supabase, no pasan automáticamente por las funciones de Vercel, pero el código y los despliegues sí están bajo las condiciones de Vercel.
- No publicar un producto comercial o multiusuario sobre Vercel Hobby sin cambiar de plan y revisar los términos. Vercel Pro aparece desde USD 20/mes por miembro al momento de la investigación.
- Cloudflare Pages es interesante para sitios estáticos, pero sus términos de servicios Free prohíben procesar o recolectar información personal o empresarial de tarjetas de crédito en propiedades web que reciben dichos servicios. Como la app registra gastos que podrían provenir de tarjetas, pedir aclaración escrita antes de elegirlo para ese caso; no almacenar número, código de seguridad ni credenciales de tarjeta.
- Un subdominio del proveedor con HTTPS basta para instalar la PWA. El dominio propio puede agregarse luego y suele tener costo anual.

## Comparación de opciones de hosting y backend

Las cuotas siguientes fueron consultadas en documentación oficial el 2026-09-26. Son límites sujetos a cambios; no son una garantía de disponibilidad ni una estimación exacta de consumo para la app.

| Opción | Capacidad gratuita relevante | Ventajas | Riesgos y encaje |
|---|---|---|---|
| **Vercel Hobby + Supabase Free** | Vercel Hobby: 100 GB de transferencia, 1 M de Edge Requests y 1 M de invocaciones de Functions al mes. Supabase Free: 50.000 MAU, 500 MB Postgres, 5 GB egress + 5 GB cacheado, 1 GB Storage, 500.000 invocaciones Edge y 2 proyectos activos. | Fácil para un prototipo web; Supabase ofrece SQL, Auth y RLS. | Hobby es personal/no comercial. Supabase puede pausar por inactividad de 7 días; sin backups automáticos descargables; SMTP de prueba limitado. Adecuado para uso propio con backup probado, no como base pública permanente. |
| **Cloudflare Pages Free + Supabase Free** | Pages: 500 builds/mes, 20.000 archivos por sitio y 25 MB por archivo. Pages Functions comparten Workers Free: 100.000 requests/día y 10 ms CPU por invocación. | Hosting estático generoso y desacoplado del backend; Pages no necesita funciones para la PWA. | Restricción de Cloudflare Free sobre información de tarjetas; verificar interpretación antes de alojar movimientos de tarjeta. Supabase conserva los límites y riesgos del renglón anterior. |
| **Cloudflare Workers + D1** | Workers Free: 100.000 requests/día. D1 Free: 5 M filas leídas/día, 100.000 escritas/día, 5 GB; las consultas fallan al agotar límites. Time Travel automático: 7 días en Free, 30 en Workers Paid. Workers Paid tiene mínimo USD 5/mes. | Un solo proveedor y recuperación punto-en-tiempo automática. D1 no cobra egress. | D1 es SQLite. Auth, aislamiento, permisos y recuperación de cuenta quedan a cargo de la implementación; más código y superficie de seguridad que Supabase. Restaurar Time Travel sobrescribe la base y no sustituye una copia portable externa. Sigue aplicando el caveat de tarjetas de Cloudflare Free. |
| **Firebase Spark** | Firestore: 1 GiB, 50.000 lecturas/día, 20.000 escrituras y borrados/día, 10 GiB egress/mes. Hosting: 10 GB de almacenamiento y 10 GB de transferencia/mes. | Auth, hosting y datos dentro de un ecosistema; SDK con persistencia offline web opcional. São Paulo (`southamerica-east1`) está disponible. | Persistencia web desactivada por defecto y caché que continúa entre sesiones; conflictos en el mismo documento son last-write-wins. Backups/PITR requieren billing; la ubicación del Firestore no se cambia después de crear la base. Al superar cuota de Hosting, puede desactivarse hasta el siguiente mes. |
| **Netlify Free** | Para cuentas nuevas desde 2025-09-04: 300 créditos/mes; 15 por deploy productivo, 20 por GB de ancho de banda y 2 por cada 10.000 requests. | Conveniente para una demo estática. | Límite duro sin recarga automática: al agotarse créditos se pausan los proyectos hasta el siguiente ciclo. Menos apropiado si la app debe estar disponible de forma continua. |
| **Supabase Pro como evolución** | Desde USD 25/mes según precio consultado; incluye backups diarios por 7 días, evita la pausa por inactividad y sube cuotas. | Reduce los dos riesgos más sensibles para datos financieros: pausas y falta de backups gestionados. | No equivale a SLA de uptime ni elimina la necesidad de exportar y probar restauración. Revisar precio, impuestos, región y cuotas vigentes antes de contratar. |

### Recomendación práctica por etapa

1. **Prueba personal a USD 0**: Vercel Hobby + Supabase Free puede servir si el uso sigue siendo personal/no comercial y se aceptan los términos de privacidad. La app debe enviar los movimientos directamente a Supabase, probar RLS y mantener una copia cifrada externa.
2. **Antes de invitar a testers o abrir registros**: revisar el alcance de uso permitido por Vercel Hobby; elegir hosting apto para el uso previsto; resolver el caveat de Cloudflare si se consideran movimientos de tarjeta; configurar SMTP propio y ensayar exportación/restauración.
3. **Cuando la disponibilidad y recuperación importan**: presupuestar Supabase Pro (USD 25/mes al momento de la investigación) y el plan de hosting que permitan los términos. Si se usa Vercel Pro, considerar USD 20/mes por miembro como referencia. Impuestos, cambios de precio y uso adicional pueden modificar el total.
4. **Si el usuario prioriza offline integrado por encima de SQL**: hacer un prototipo técnico de Firebase con persistencia y cierre de sesión cuidadosamente probado antes de decidir migrar el modelo de datos.
5. **No elegir Cloudflare Workers + D1 solo porque parece “todo gratis”**: la cuota gratuita es atractiva y tiene recuperación PITR, pero trasladaría una parte crítica de Auth y seguridad al código propio.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación antes de confiar datos reales |
|---|---|---|
| Pérdida/evicción de datos offline | Un movimiento aún no sincronizado desaparece si se borran datos del navegador. | Estado pendiente muy visible, persistencia solicitada cuando exista, exportación/backup tras sincronizar y advertencia antes de cambiar cuenta. |
| No hay sincronización con app cerrada en iOS | La persona espera ver el mismo dato inmediatamente en PC. | Sincronizar al primer plano/retorno de conexión y explicar el estado; no vender Background Sync como garantía. |
| Proyecto Free se pausa o alcanza una cuota | La app puede dejar de responder o de guardar en backend. | Supervisar cuotas, exportar datos; subir de plan antes de abrir a usuarios o depender del servicio. |
| Sin backup recuperable en Free | Un borrado o fallo puede perder el historial central. | Probar exportación cifrada y restauración; adoptar backups diarios gestionados al dar el salto a Pro. |
| Error de privacidad entre usuarios | Exposición de movimientos financieros. | Propietario explícito por registro, política de acceso probada con dos cuentas, pruebas negativas, nunca publicar claves secretas. |
| Email de confirmación/recuperación limitado | Personas no pueden completar acceso. | SMTP transaccional propio antes de altas abiertas; validar recupero de cuenta. |
| Cláusula de tarjeta en Cloudflare Free | Uso de una opción de hosting no permitido por sus términos. | Confirmar por escrito alcance antes de desplegar una app que guarde datos de compras con tarjeta; no guardar PAN/CVV/credenciales. |
| Cobertura insuficiente de Mercado Pago | Integración aporta pocos movimientos y crea falsa sensación de completitud. | Manual como flujo principal; analizar solo importación documentada y probar cobertura antes de construir OAuth. |
| Manejo ambiguo de monedas y tarjetas | Totales engañosos o deuda duplicada. | Aplicar las reglas explícitas de la spec y resolver estas decisiones en `/speckit-clarify`. |

## Decisiones pendientes antes del plan técnico

El archivo de entrada para `/speckit-specify` propone supuestos razonables para avanzar; confirmar estos puntos con `/speckit-clarify` después de que Spec Kit genere la spec:

- **Monedas**: se propone ARS + USD en la primera versión, sin conversión automática.
- **Metas**: se propone progreso manual independiente del libro de movimientos.
- **Tarjetas**: se propone registrar el gasto, pero no conciliar deuda, cierre o vencimiento.
- **Inicio de sesión**: se requiere una cuenta y acceso privado, pero el método (contraseña o enlace) queda por decidir junto con el correo transaccional.
- **Nombre e identidad**: el nombre del producto es Mave. El logo, la tipografía y la identidad visual final están pendientes; la disponibilidad legal/comercial del nombre todavía no se verificó.
- **Host público**: queda por elegir tras revisar términos y condiciones del uso previsto; el modo $0 es para empezar, no un compromiso de permanecer gratis.

## Cómo usar estos materiales con Spec Kit

Los documentos de `info/finanzas-pwa/` son entradas para tus comandos. No se ejecutó `/speckit-constitution` ni `/speckit-specify`, y este paquete no debe dejar una spec o feature activo por adelantado. El archivo `.specify/memory/constitution.md` del proyecto sigue siendo la plantilla inicial.

1. Abrí `constitution-input.md`, ejecutá `/speckit-constitution` y adjuntá el archivo como contexto o pegá su contenido. Revisá los principios y confirmá la fecha de ratificación cuando el comando te la pida.
2. Cuando la constitución esté aprobada, abrí `specify-input.md` y ejecutá `/speckit-specify` usando ese texto como descripción de la feature. Si el archivo no se incorpora automáticamente como argumento, pegá su contenido después del comando.
3. Revisá `spec.md` y el checklist que el comando genere en la nueva carpeta `specs/NNN-finanzas-pwa/`; la numeración y `.specify/feature.json` corresponden a la salida del comando.
4. Ejecutá `/speckit-clarify` sobre la spec generada y resolvé moneda, metas, tarjetas y método de acceso.
5. Ejecutá `/speckit-plan` usando este informe como contexto. Prompt sugerido:

   > Planificá la feature recién especificada y usa `info/finanzas-pwa/informe-producto.md` como investigación de producto y hosting. Compará una PWA estática con Supabase Auth/Postgres/RLS y Firebase solo si aporta una ventaja real para el uso offline. Conservá portabilidad del frontend. Para el prototipo estrictamente personal evaluá Vercel Hobby + Supabase Free sujeto a términos; no lo consideres hosting comercial. Verificá la cláusula de tarjetas de Cloudflare antes de recomendar Cloudflare Free. Incluí sincronización al reabrir en iOS, aislamiento entre usuarios, exportación/restauración cifrada y costos de evolución. No implementes todavía.

6. Revisá el plan y los artefactos de investigación/modelo que produzca Spec Kit; después ejecutá `/speckit-tasks` y `/speckit-analyze`. Implementá recién cuando apruebes alcance, seguridad, backups y tareas.

## Fuentes consultadas

Cuotas y términos son una fotografía a 2026-09-26; comprobarlos de nuevo antes de un lanzamiento o de agregar una tarjeta de pago.

- [Vercel Pricing](https://vercel.com/pricing) y [Vercel Terms](https://vercel.com/legal/terms)
- [Supabase Pricing](https://supabase.com/pricing), [Regions](https://supabase.com/docs/guides/platform/regions), [Backups](https://supabase.com/docs/guides/platform/backups), [Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Cloudflare Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Firebase Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing), [Firestore pricing](https://firebase.google.com/docs/firestore/pricing), [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline), [Firestore locations](https://firebase.google.com/docs/firestore/locations)
- [Netlify pricing](https://www.netlify.com/pricing/) y [credit-plan FAQ](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/)
- [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/es/docs)
- [WCAG 2.2: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) y [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
