# Contrato de datos SPA-Supabase

**Estado**: contrato lógico para planificación; los nombres y tipos SQL definitivos se materializan durante la implementación. Mave no ofrece una API pública propia. La SPA consume Supabase Auth, la Data API de Postgres y funciones RPC para operaciones que requieren una transacción.

## Autenticación y autorización

- El navegador usa únicamente la URL del proyecto y una publishable key. La publishable key no reemplaza autorización: cada petición de datos lleva la sesión Auth y queda sujeta a grants mínimos y RLS.
- El servidor deriva al propietario de `auth.uid()` de la sesión verificada. El cliente no puede elegir ni cambiar el `user_id` propietario enviándolo en el payload.
- Toda tabla privada expuesta tiene RLS habilitado y políticas por operación. Las referencias entre filas validan que propietario y entidad relacionada coincidan.
- Funciones invocables por una sesión normal operan con privilegios del invocador (`SECURITY INVOKER`) cuando sea posible, y conservan RLS. Cualquier excepción `SECURITY DEFINER` necesita justificación, `search_path` seguro, validación explícita de propietario y permisos `EXECUTE` restringidos.
- La clave `service_role` o cualquier clave secreta/administrativa solo existe en el entorno confiable de la función programada; nunca en el bundle, almacenamiento del navegador ni logs.

## Operaciones de lectura

La SPA puede consultar movimientos, recurrencias y sus pagos, categorías, cuentas, transferencias, devoluciones, metas y aportes propios mediante consultas o vistas con RLS. La lectura de resúmenes y exportaciones se deriva de movimientos y demás registros contables, no de reglas recurrentes sin confirmar, y devuelve únicamente filas visibles para la cuenta autenticada.

Los importes viajan como texto decimal y las fechas financieras como fechas civiles. Las consultas y exportaciones no suman ARS con USD. CSV organiza las entidades para planillas; JSON conserva IDs y referencias entre entidades.

## Operaciones transaccionales

Las siguientes operaciones son contratos de comportamiento, no una exigencia de REST ni de una API de aplicación separada:

| Operación lógica | Entrada relevante | Resultado y garantías |
|---|---|---|
| `apply_movement_change` | ID idempotente de operación, ID del movimiento si existe, acción, versión esperada y campos del movimiento | Crea, edita o marca borrado dentro de una transacción. Repetir el mismo ID de operación no duplica el efecto. Una versión inesperada produce un conflicto explícito, preserva las versiones necesarias y no sobrescribe en silencio. |
| `record_transfer` | ID idempotente, origen, destino, importe y fecha | Inserta una sola transferencia si ambas cuentas pertenecen a la sesión, son distintas y tienen la misma moneda. Un error no deja un débito sin crédito. |
| `record_refund` | ID idempotente, gasto, importe, fecha de recepción y acción | Verifica que el padre sea un gasto propio y que la suma de devoluciones activas no supere el importe no devuelto. Serializa cambios por gasto. Moneda, categoría y cuenta se heredan del gasto. |
| `mark_recurring_movement_paid` | Regla propia, índice de ocurrencia esperado, fecha real de pago/cobro e ID idempotente | En una transacción crea un solo movimiento contable, conserva vencimiento y pago, y avanza el calendario. Los reintentos o confirmaciones concurrentes no duplican movimientos; las reglas pausadas y las cuentas vencidas no se aplican. |
| `claim_due_recurring_movement_reminders` | Hora del servidor; solo `service_role` | Reclama recurrencias activas dentro de la ventana de aviso local y devuelve únicamente suscripciones Push propias para entrega. La fecha reclamada limita la frecuencia elegida (una vez al inicio o diaria) y los avisos finalizan en el vencimiento. |
| `resolve_movement_conflict` | Conflicto propio y revisión conservada elegida | En una transacción aplica como máximo una revisión al movimiento canónico, incrementa su versión y cierra el conflicto. Los reintentos no vuelven a aplicar la resolución. |
| `account_sync_allowed` | Sin parámetros de propietario | Consulta el ciclo propio con el reloj del servidor; permite purgar una outbox compuesta solo por conflictos sin confiar en la hora del dispositivo. |
| `request_account_deletion` | Solicitud autenticada | Registra la fecha autoritativa del servidor, estado y vencimiento a 30 días calendario; no borra datos durante la gracia. La misma solicitud repetida no crea ventanas superpuestas. |
| `cancel_account_deletion` | Solicitud propia aún dentro de la gracia | Cancela la solicitud antes del vencimiento y restaura el estado activo. Una solicitud vencida no puede cancelarse para reabrir sync. |

El contrato no fija aún el formato SQL final de parámetros, vistas o códigos de error. Las RPC se documentan y prueban al definir las migraciones en Phase 2. CRUD sencillo de categorías y cuentas puede usar la Data API bajo RLS; cambios que afecten invariantes financieras se enrutan por la operación transaccional correspondiente.

## Sincronización e idempotencia

- Cada mutación local tiene un UUID estable. La deduplicación se limita al propietario autenticado y a ese ID; un reintento idéntico devuelve el resultado previo, no crea otra fila.
- La SPA envía la revisión canónica que observó. Si el servidor detecta cambios incompatibles, responde con estado que requiere atención y ambas versiones comparables; no transforma un conflicto en un éxito silencioso.
- Mientras el conflicto está abierto, solo la fila canónica contribuye una vez a saldos y resúmenes. Los snapshots pendientes no se agregan como movimientos adicionales.
- Toda petición de sync comprueba en servidor el estado de eliminación y su vencimiento. Una outbox de otra cuenta o posterior al vencimiento se rechaza y no altera datos canónicos.
- La cola se sincroniza al abrir o volver a primer plano con conexión. Ningún contrato promete ejecución en segundo plano con la PWA cerrada en iOS.

## Borrado programado

El worker administrado consulta solicitudes vencidas en el servidor, procesa lotes idempotentes y elimina primero cualquier objeto de Storage si el producto llegara a utilizarlo. Después elimina la identidad mediante Auth Admin y confirma que los datos asociados hayan quedado eliminados según las claves foráneas configuradas. El worker no acepta IDs arbitrarios del navegador y no es una RPC autorizada para `authenticated`.

Las políticas de datos bloquean nuevas sincronizaciones desde el instante de vencimiento, aunque Cron o la función Edge se ejecuten más tarde. Como los JWT ya emitidos pueden permanecer válidos hasta expirar, se debe configurar una expiración acotada y verificar el estado de ciclo de vida en las operaciones sensibles.

## Errores observables

La UI distingue al menos: sin sesión/conexión, validación financiera, operación ya aplicada, conflicto que requiere elección, cuenta ajena/no visible, solicitud de borrado vencida y error reintentable del servicio. Los errores no incluyen notas, importes ni payloads financieros en logs de diagnóstico. Ningún error parcial debe comunicar éxito si la transacción no confirmó.

## Criterios de aceptación del contrato

- Dos usuarios de prueba no pueden consultar ni mutar filas del otro, incluso omitiendo filtros del cliente o alterando IDs de referencia.
- Repetir una operación con el mismo UUID no duplica movimientos, transferencias ni devoluciones.
- Una ocurrencia recurrente pagada crea un único movimiento y avanza su ciclo en la misma transacción; el acceso a una regla o pago de otro propietario queda denegado.
- Una transferencia de distinta moneda, entre cuentas ajenas o a la misma cuenta falla sin cambios parciales.
- Devoluciones concurrentes que excederían el gasto no pueden confirmarse ambas.
- Un conflicto conserva versiones, cuenta el movimiento una sola vez y aplica únicamente la revisión elegida.
- Al vencer una solicitud, el sync se rechaza aun si el worker de borrado está demorado; la clave administrativa nunca aparece en el cliente.
