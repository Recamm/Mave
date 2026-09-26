# Mave

Mave es una PWA de finanzas personales en etapa de definición. La idea es registrar ingresos y gastos manualmente desde iPhone y PC, entender los movimientos y hacer seguimiento de ahorros, con datos privados por persona y captura disponible sin conexión.

> **Estado:** todavía no hay una aplicación ejecutable. Este repositorio contiene investigación de producto y materiales de preparación para Spec Kit. No usarlo para almacenar movimientos financieros reales.

## Objetivos del producto

- Hacer que anotar un gasto o ingreso sea rápido y útil, sin depender de una integración bancaria.
- Permitir que una misma cuenta acceda a sus datos privados desde iPhone y computadora.
- Conservar temporalmente movimientos offline y sincronizarlos cuando se vuelva a abrir la app con conexión. En iOS no se promete sincronización con la app cerrada.
- Mostrar resúmenes claros y ayudar a seguir metas de ahorro sencillas.
- Mantener abierta la posibilidad de espacios compartidos en el futuro, sin mezclar cuentas personales en la primera versión.

## Estado actual

- **Producto:** alcance y decisiones iniciales documentados.
- **Spec Kit:** estructura inicializada para GitHub Copilot; los comandos de constitución y especificación quedan para ejecutarlos después de revisar los insumos.
- **Aplicación y stack:** aún no implementados ni seleccionados.
- **Hosting:** opciones evaluadas; la recomendación es provisional y está sujeta a términos, límites y necesidades de backup.
- **Marca:** nombre definido: Mave. Logo e identidad visual final pendientes.
- **Licencia:** pendiente de decisión. No asumir que este repositorio tiene una licencia open source.

## Documentación

- [Informe de producto, alcance y hosting](info/finanzas-pwa/informe-producto.md)
- [Insumo para la constitución de Spec Kit](info/finanzas-pwa/constitution-input.md)
- [Descripción para `/speckit-specify`](info/finanzas-pwa/specify-input.md)
- [Prompts para logo e icono PWA](info/finanzas-pwa/prompts-para-assets.md)
- [Cómo usar los insumos](info/finanzas-pwa/README.md)
- [Guía de Spec Kit](how-to-use-speckit.md)

## Alcance inicial propuesto

La primera versión buscaría incluir:

- Cuenta personal privada y acceso desde más de un dispositivo.
- Registro manual de ingresos, gastos y transferencias entre cuentas propias.
- Historial y resumen por período, categoría y moneda.
- ARS y USD mostrados por separado; sin conversión automática.
- Cuentas personales y metas sencillas con seguimiento manual.
- Captura offline con estado pendiente y sincronización al volver a abrir la app.
- Interfaz instalable desde Safari en iPhone y utilizable en escritorio, con modos claro, oscuro y sistema.

La integración automática con Mercado Pago o bancos, los espacios compartidos, los pagos, la custodia de fondos y las recomendaciones de inversión no forman parte del MVP propuesto.

## Empezar con Spec Kit

Los siguientes pasos son manuales; **este README no ejecuta comandos**. Abrí los insumos indicados y usalos en Copilot Chat:

1. Revisá [constitution-input.md](info/finanzas-pwa/constitution-input.md) y ejecutá `/speckit-constitution` con su contenido.
2. Después de revisar la constitución, usá [specify-input.md](info/finanzas-pwa/specify-input.md) como descripción para `/speckit-specify`.
3. Revisá los archivos que genere Spec Kit y ejecutá `/speckit-clarify` para resolver las decisiones pendientes.
4. Usá el [informe de producto](info/finanzas-pwa/informe-producto.md) como contexto para `/speckit-plan`; luego seguí con `/speckit-tasks` y `/speckit-analyze` antes de implementar.

Los comandos de Spec Kit se lanzan desde Copilot Chat. Si la integración no permite adjuntar el archivo como argumento, copiá su contenido en el chat. La carpeta `specs/`, el número de feature y `.specify/feature.json` deben aparecer como resultado de `/speckit-specify`, no como parte de estos documentos de preparación.

Para instalación/configuración de Spec Kit, consultá la [guía del repositorio](how-to-use-speckit.md). La PWA todavía no tiene comandos de instalación o ejecución.

## Hosting y datos

La investigación recomienda evaluar Supabase para autenticación y datos, y mantener el frontend como PWA estática y portable. Vercel Hobby puede servir para un prototipo estrictamente personal sujeto a sus términos, pero no debe asumirse como hosting comercial. Cloudflare Free tiene una restricción específica relacionada con información de tarjetas; Firebase y Netlify también tienen límites que pueden afectar disponibilidad. Consultá la [comparación completa](info/finanzas-pwa/informe-producto.md) y verificá términos y precios antes de desplegar.

No cargues ni publiques en GitHub:

- Movimientos financieros reales, datos personales o capturas con información identificable.
- Contraseñas, tokens, claves privadas, archivos `.env` ni credenciales bancarias.
- Claves secretas de backend en código cliente. La futura aplicación deberá autorizar cada dato por usuario y probar ese aislamiento.

## Contribuciones y licencia

El proyecto está en fase de definición y todavía no tiene proceso de contribución ni licencia elegida. Antes de aceptar contribuciones o distribuir el código, definir una licencia y agregar el archivo `LICENSE` correspondiente.
