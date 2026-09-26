# Modelo de datos

## Alcance y reglas comunes

Este es un modelo lógico de diseño, no un esquema SQL ni una migración. Postgres es la fuente canónica; IndexedDB conserva operaciones locales pendientes. Los nombres son descriptivos y pueden ajustarse durante la implementación sin cambiar las reglas funcionales.

- `auth.users.id` identifica a la persona. No se duplican contraseña ni credenciales de Auth en tablas de Mave.
- Cada entidad privada tiene `user_id` no nulo. La identidad se obtiene de la sesión verificada, no de un `user_id` confiado al payload del navegador.
- Las referencias entre entidades privadas deben validar también el mismo `user_id`, idealmente mediante claves foráneas compuestas, además de RLS.
- Las monedas admitidas son `ARS` y `USD`. Cada importe se conserva en su moneda y nunca se convierte automáticamente.
- Los importes canónicos usan PostgreSQL `numeric`, nunca `real`, `double precision` ni aritmética de dinero con `Number` de JavaScript. El cliente envía y recibe importes como texto decimal para no perder precisión durante la serialización.
- La escala máxima aceptada y la política para decimales adicionales (rechazar o redondear) quedan como decisión previa a implementar; no declarar una escala que la spec no fijó. La exportación JSON conserva importes como texto decimal y CSV como texto decimal de planilla.
- Las fechas financieras son fechas civiles (`date`, `YYYY-MM-DD`) en el calendario local, no timestamps convertidos por zona horaria. Las marcas de auditoría y sync usan timestamps del servidor con zona horaria.
- Los resúmenes son proyecciones derivadas de los registros; no guardar totales acumulados como una segunda fuente de verdad sin una estrategia de reconciliación.

## Entidades

### Identidad y ciclo de vida de la cuenta

**Identidad Auth**: fila administrada por Supabase Auth, identificada por `user_id`. No se expone el esquema Auth a la Data API.

**Ciclo de vida Mave**: una fila por `user_id`, vinculada a la identidad Auth.

| Campo lógico | Significado |
|---|---|
| `user_id` | Identidad propietaria y clave primaria |
| `deletion_requested_at` | Momento de recepción de la solicitud, null si no hay solicitud activa |
| `deletion_due_at` | Vencimiento calculado en el servidor a 30 días calendario; null si no hay solicitud activa |
| `deletion_canceled_at` | Momento de cancelación, si la solicitud se canceló |
| `deletion_started_at` | Momento en que el worker inició el proceso final, para reintentos idempotentes |

El estado visible se deriva: activa si no hay solicitud pendiente; eliminación solicitada mientras el vencimiento no haya llegado; en proceso si el worker ya inició; eliminada cuando se eliminó la identidad Auth. Al pedir una nueva eliminación, la solicitud activa debe tener vencimiento propio y cancelable durante la ventana indicada por FR-016. Las políticas de sync comprueban `deletion_due_at` en el servidor, incluso si Cron todavía no ejecutó el borrado.

### Cuenta financiera

Fuente de dinero de la persona, distinta de su cuenta de acceso.

| Campo lógico | Regla |
|---|---|
| `id`, `user_id` | Identificador y propietario |
| `name` | Nombre legible, por ejemplo efectivo, banco o billetera |
| `kind` | Tipo elegido por la persona; admite otras fuentes |
| `currency` | `ARS` o `USD` |
| `opening_balance` | Importe exacto opcional; null se interpreta como cero |
| `created_at` | Auditoría del servidor |

El saldo no se modifica como efecto secundario de cada operación; se deriva del saldo inicial y los movimientos válidos. No se define en la spec el flujo de editar/borrar una cuenta financiera; no asumirlo en la primera interfaz.

### Categoría

| Campo lógico | Regla |
|---|---|
| `id`, `user_id` | Identificador y propietario |
| `name` | Nombre presentado en español |
| `source` | `default` para una categoría inicial creada en el espacio de esa persona; `custom` para una creada por ella |
| `archived_at` | Null si puede asignarse a movimientos nuevos; fecha de archivo en caso contrario |
| `created_at`, `updated_at` | Auditoría |

Al crear el espacio se siembra una copia propia del catálogo inicial. Así, incluso las categorías predeterminadas pertenecen a una persona y quedan detrás de la misma política de aislamiento. Renombrar o archivar una categoría no cambia las referencias históricas; una categoría archivada no se ofrece en nuevos movimientos.

### Movimiento

Registro financiero de tipo ingreso o gasto.

| Campo lógico | Regla |
|---|---|
| `id`, `user_id` | Identificador y propietario |
| `kind` | `income` o `expense` |
| `amount` | `numeric` estrictamente mayor que cero |
| `currency` | `ARS` o `USD` |
| `category_id` | Categoría del mismo propietario |
| `occurred_on` | Fecha local propuesta al crear, editable por la persona |
| `financial_account_id` | Cuenta financiera propia opcional |
| `note` | Nota opcional |
| `version` | Revisión canónica monotónica para concurrencia optimista |
| `client_operation_id` | Identidad estable de mutación para deduplicar reintentos |
| `deleted_at` | Tombstone lógico para propagar borrados a dispositivos que vuelvan más tarde |
| `created_at`, `updated_at` | Auditoría del servidor |

Un movimiento sin cuenta afecta resúmenes generales, pero no el saldo de una cuenta. El tombstone no se presenta como movimiento activo ni entra en totales. La retención de tombstones debe impedir que un cliente offline antiguo resucite un movimiento borrado; definir el período de retención antes de purgarlos.

### Devolución

Importe parcial o total recibido por un gasto propio.

| Campo lógico | Regla |
|---|---|
| `id`, `user_id` | Identificador y propietario |
| `expense_id` | Referencia al movimiento de tipo gasto del mismo propietario |
| `amount` | `numeric` mayor que cero |
| `received_on` | Fecha de recepción; determina el período que reduce |
| `client_operation_id`, `version`, `deleted_at` | Idempotencia, concurrencia y propagación de borrado |

Moneda, categoría y cuenta se derivan del gasto original: una devolución no puede cambiarlas ni apuntar a otra cuenta. Si el gasto no tiene cuenta, la devolución solo afecta el resumen general. La suma de devoluciones activas no puede superar el importe del gasto. Como es una regla entre filas, crear, editar o borrar una devolución debe serializarse por gasto en una transacción (por ejemplo, bloqueando la fila del gasto y recalculando el total devuelto).

### Transferencia

Movimiento de dinero propio entre dos cuentas financieras.

| Campo lógico | Regla |
|---|---|
| `id`, `user_id` | Identificador y propietario |
| `source_account_id` | Cuenta de origen propia |
| `destination_account_id` | Cuenta de destino propia y distinta del origen |
| `amount` | `numeric` mayor que cero |
| `occurred_on` | Fecha de la transferencia |
| `client_operation_id` | Identidad estable para deduplicar reintentos |
| `created_at` | Auditoría del servidor |

Ambas cuentas deben pertenecer a la persona y tener la misma moneda; la moneda se deriva de las cuentas. La operación se registra en una sola transacción. No crea ingreso ni gasto.

### Meta de ahorro y aporte

**Meta**: `id`, `user_id`, `name`, `target_amount` (`numeric` mayor que cero), `currency` (`ARS` o `USD`), fecha objetivo opcional y marcas de auditoría.

**Aporte manual**: `id`, `user_id`, `goal_id`, `amount` (`numeric` mayor que cero), fecha del aporte y marca de creación. Su moneda se hereda de la meta. El progreso se calcula como la suma de aportes activos; no crea movimiento financiero ni modifica saldo de cuenta.

### Revisión y conflicto de sincronización

**Conflicto**: `id`, `user_id`, `movement_id`, estado (`open` o `resolved`), marcas de apertura/resolución y `chosen_revision_id` al resolverse.

**Versión en conflicto**: `id`, `conflict_id`, origen, revisión/base conocida, snapshot inmutable de los campos del movimiento y marca temporal. Conserva todas las versiones necesarias para comparar y elegir; cada snapshot sigue bajo el mismo `user_id` del movimiento.

Mientras el conflicto está abierto, los snapshots alternativos no se agregan a los resúmenes. El registro canónico se cuenta una sola vez. Resolver es una operación atómica que aplica la revisión elegida, incrementa `version`, marca el conflicto resuelto y conserva su historial de decisión; elegir la versión canónica no debe reescribirla sin necesidad.

### Operación pendiente local

Solo existe en IndexedDB y no es una fila canónica de Postgres.

| Campo lógico | Significado |
|---|---|
| `owner_id` | Cuenta a la que está ligada la operación; nunca se reasigna al usuario siguiente del dispositivo |
| `operation_id` | UUID estable para deduplicación |
| `entity_id`, `operation_kind` | Entidad y crear/editar/borrar |
| `payload` | Cambio pendiente, con importes como texto decimal |
| `expected_version` | Revisión base para detectar concurrencia al sincronizar |
| `status` | `pending`, `sending`, `retry`, `conflict` o `blocked` |
| `created_at`, `last_error_code` | Orden/reintentos y diagnóstico no sensible |

La garantía offline mínima es crear movimientos después de una sesión previa. Los estados locales no se presentan como backup. El logout advierte si queda una outbox; otra cuenta no puede verla ni sincronizarla. Una vez vencida una solicitud de eliminación, el servidor bloquea esas operaciones y la app elimina los pendientes al reconectar con esa identidad.

## Relaciones y restricciones

- Auth 1:1 ciclo de vida Mave; Auth 1:N movimientos, cuentas financieras, categorías, metas y aportes.
- Categoría 1:N movimientos propios.
- Cuenta financiera 1:N movimientos propios y puede ser origen/destino de transferencias propias.
- Gasto 1:N devoluciones propias.
- Meta 1:N aportes propios.
- Movimiento 1:N conflictos/revisiones de sincronización.
- Los identificadores de propietario forman parte de claves únicas/foráneas para bloquear referencias a categorías, cuentas, metas o movimientos ajenos.
- La categoría archivada conserva sus referencias; las cuentas de una transferencia deben ser distintas, propias y de igual moneda.
- Cambiar o borrar un gasto no puede invalidar silenciosamente sus devoluciones; el cambio debe validar la suma devuelta en la misma transacción o rechazarse con explicación.
- Cada tabla expuesta aplica grants mínimos y RLS por operación. Las operaciones sensibles no dependen de filtros de cliente.

## Reglas derivadas para resúmenes y saldos

Para cada período y moneda, sin combinar ARS y USD:

- Ingresos: suma de movimientos `income` cuya fecha cae en el período.
- Gastos netos: suma de gastos del período menos devoluciones recibidas en ese período. Una devolución puede reducir los gastos de un período distinto al del gasto original y no se registra como ingreso.
- Diferencia neta: ingresos menos gastos netos. Transferencias y aportes de metas quedan excluidos.
- Saldo de cuenta: saldo inicial (o cero) + ingresos asociados + devoluciones acreditadas a esa cuenta - gastos asociados + transferencias recibidas - transferencias enviadas.
- Progreso de meta: suma de aportes activos de esa meta; no forma parte del saldo financiero.

Un gasto histórico conserva la categoría archivada con la que se registró. Los conflictos abiertos aportan una sola versión canónica a estos cálculos.

## Estados principales

| Flujo | Transiciones |
|---|---|
| Sync local | `pending` -> `sending` -> `synced` al confirmar el servidor; error reintentable -> `retry`; conflicto detectado -> `conflict`; vencimiento de eliminación -> `blocked` y purga local al reconectar |
| Conflicto | `open` con snapshots no agregables -> elección explícita -> `resolved` con una sola versión canónica aplicada |
| Eliminación | activa -> solicitada con `deletion_due_at` -> cancelada antes del vencimiento y activa, o vencida -> worker idempotente -> identidad/datos eliminados |

El vencimiento se calcula y valida con tiempo de servidor en una zona horaria acordada para Argentina; el instante se persiste para no depender del reloj de cada dispositivo. A partir del vencimiento, RLS bloquea sync aunque el worker esté demorado. Las solicitudes y el worker deben ser idempotentes ante reintentos.
