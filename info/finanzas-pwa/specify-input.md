# Descripción de feature para `/speckit-specify`

Quiero especificar Mave, una aplicación web instalable de finanzas personales, en español, pensada primero para uso individual en Argentina. La necesito para registrar manualmente ingresos y gastos desde un iPhone y una computadora, entender mis movimientos y organizar mejor mis ahorros. La carga manual debe ser el flujo principal: no depender de Mercado Pago ni de una conexión bancaria.

## Necesidad y usuarios

La primera persona usuaria maneja su propio dinero y quiere registrar un movimiento en pocos pasos. Cada persona debe tener un espacio privado. Más adelante podría haber espacios compartidos de hogar, pero la primera versión no debe permitir que varias personas compartan o vean datos entre sí.

La misma cuenta debe poder usarse desde el teléfono y desde la computadora. La experiencia debe poder añadirse a la pantalla de inicio desde Safari en iPhone y abrirse desde navegadores de escritorio compatibles.

## Experiencias principales

1. Una persona crea una cuenta, inicia y cierra sesión y puede acceder a sus propios movimientos desde otro dispositivo. Ninguna cuenta puede ver o modificar datos de otra.
2. Una persona registra un ingreso o gasto con importe, tipo, categoría y fecha; la fecha actual se propone automáticamente. La cuenta y la nota son opcionales para mantener rápida la captura. Puede revisar, editar y borrar movimientos propios.
3. Una persona con sesión iniciada previamente puede crear movimientos sin conexión. La app los muestra como pendientes, los conserva tras recargar mientras el almacenamiento local siga disponible y los sincroniza cuando vuelve a abrir la app con Internet. Los reintentos no crean duplicados. La app informa si hay datos sin sincronizar y no promete sincronización con la app cerrada en iOS.
4. Una persona consulta el historial y un resumen por período, con ingresos, gastos, diferencia neta y agrupación por categoría. Las transferencias entre cuentas propias no cuentan como ingresos ni gastos.
5. Una persona crea cuentas para efectivo, banco, billetera digital u otra fuente, con moneda y saldo inicial opcional. Puede registrar transferencias entre sus propias cuentas si usan la misma moneda.
6. Una persona crea una meta de ahorro con nombre, importe objetivo, moneda y fecha opcional; puede anotar aportes manuales de seguimiento. Un aporte no debe duplicar un movimiento ni cambiar el saldo de una cuenta por sí mismo.
7. Una persona puede exportar sus datos y solicitar que se eliminen su cuenta y sus datos asociados.
8. Una persona elige apariencia oscura, clara o del sistema. La interfaz funciona en pantalla angosta y amplia, es navegable con teclado y tecnologías de asistencia, y no expresa estados únicamente con colores.

## Reglas iniciales de producto

- El primer mercado es Argentina; usar español y ARS como moneda por defecto.
- La propuesta es aceptar ARS y USD, mostrar totales separados y no convertirlos automáticamente.
- Los importes deben ser positivos. La fecha se propone con la fecha local y puede corregirse.
- Una transferencia requiere cuenta de origen y destino propias de la misma moneda; no altera los totales de ingresos o gastos.
- El progreso de una meta es seguimiento manual y no modifica por sí solo movimientos ni saldos.
- Una compra con tarjeta puede anotarse como gasto, pero la deuda de tarjeta, el cierre, el vencimiento y la conciliación de resúmenes no forman parte de esta primera versión.
- Los datos locales pendientes no son un backup y pueden desaparecer si se borran los datos del navegador; advertirlo de forma clara.

## Alcance y exclusiones

Incluir cuentas privadas, movimientos manuales, historial, resumen mensual, categorías, cuentas, metas sencillas, trabajo offline con sincronización posterior y preferencias visuales.

Dejar fuera de esta feature los espacios compartidos, la importación automática de bancos o Mercado Pago, OAuth, scraping, pagos, custodia de fondos, consejos de inversión, notificaciones push, recurrencias, presupuestos avanzados y aplicación nativa.

## Criterios de éxito esperados

- Al menos 4 de 5 personas de prueba registran su primer gasto en menos de 30 segundos sin ayuda.
- Un movimiento creado sin conexión permanece visible tras recargar en los dispositivos de prueba donde no se borró el almacenamiento y se sincroniza una sola vez al volver la conexión y abrir la app.
- Los totales de un conjunto de movimientos de prueba coinciden con el cálculo manual, separados por moneda y excluyendo transferencias.
- En pruebas con dos cuentas, ninguna puede leer, modificar o borrar los datos de la otra.
- Al menos 4 de 5 personas de prueba encuentran el resumen del mes y entienden si sus movimientos están sincronizados.

## Supuestos por confirmar

- ARS y USD se incluyen desde el inicio, sin conversión automática.
- Las metas sencillas y el registro manual de aportes forman parte del alcance, después de los flujos P1.
- La cuenta exige conexión al crearse; el modo offline funciona para alguien que ya inició sesión previamente.
- El nombre del producto es Mave; el logo y la identidad visual final quedan pendientes.
- El método de autenticación y los detalles de confirmación/recuperación de cuenta se definen en la planificación.

Usá esta descripción para producir únicamente la especificación formal de la feature y su checklist de calidad según la plantilla activa de Spec Kit. Enfocate en qué necesita la persona y por qué; no elijas framework, proveedor, estructura de código ni despliegue, y no implementes la aplicación. Si detectás una decisión que cambia de forma importante el alcance o la seguridad y no tiene un default razonable, marcala para aclararla en lugar de inventarla.
