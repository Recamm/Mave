# Feature Specification: Mave - Finanzas personales

**Feature Branch**: No creada (no hay hook `before_specify` configurado)

**Created**: 2026-09-26

**Status**: Draft

**Input**: User description: Aplicación web instalable de finanzas personales, manual-first, en español y para uso individual en Argentina.

## Clarifications

### Session 2026-09-26

- Q: ¿Cuántos días debe durar el período de gracia antes de borrar definitivamente la cuenta y sus datos? (FR-016) → A: 30 días calendario.
- Q: ¿Cómo debe registrarse una devolución de una compra en Mave? (FR-003) → A: vinculada al gasto original; reduce los gastos del período en que se recibe y no cuenta como ingreso.
- Q: ¿Qué debería hacer Mave cuando dos dispositivos cambian el mismo movimiento de forma incompatible? (FR-021) → A: mostrar ambas versiones y sus diferencias, pedir una elección y no duplicar el movimiento en los totales mientras el conflicto siga abierto.
- Q: ¿La primera versión debe permitir que cada persona gestione categorías propias además de las predeterminadas? (FR-003) → A: sí; puede crear, renombrar y archivar categorías, conservando las asignaciones históricas.
- Q: ¿En qué formato(s) debe poder exportar la persona sus datos? (FR-015) → A: CSV organizado para planillas y JSON que conserva las relaciones entre los datos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar movimientos propios rápidamente (Priority: P1)

Una persona crea su cuenta y registra ingresos y gastos propios desde el teléfono o la computadora. La captura manual es el flujo principal y debe poder completarse en pocos pasos.

**Why this priority**: Registrar movimientos privados es el valor central de Mave; sin este flujo no hay datos para consultar ni organizar.

**Independent Test**: Con conexión, crear una cuenta y registrar un gasto positivo con categoría sin informar cuenta ni nota. Comprobar que se propone la fecha local, que la persona puede volver a acceder al movimiento y que otra cuenta no puede leerlo, editarlo ni borrarlo.

**Acceptance Scenarios**:

1. **Given** una persona sin cuenta y con conexión, **When** crea su cuenta e ingresa un gasto con importe y categoría, **Then** el movimiento queda asociado solo a su espacio privado y usa la fecha local propuesta si no la corrige.
2. **Given** una persona que inició sesión en un dispositivo, **When** inicia sesión con la misma cuenta en otro dispositivo, **Then** puede consultar sus movimientos y no puede acceder a los de otra persona.
3. **Given** un movimiento propio, **When** la persona lo edita o lo borra, **Then** el cambio afecta únicamente ese movimiento y ninguna otra cuenta puede realizar esas acciones.
4. **Given** una compra hecha con tarjeta, **When** la persona la registra, **Then** queda como un gasto común, sin crear una deuda ni un estado de resumen de tarjeta.
5. **Given** una categoría propia, **When** la persona la renombra o archiva, **Then** los movimientos históricos conservan su asociación y la categoría archivada ya no se ofrece para nuevos movimientos.

**Requirements**: FR-001 a FR-007, FR-027.

### User Story 2 - Entender los movimientos de un período (Priority: P1)

Una persona consulta su historial y compara ingresos, gastos y diferencia neta por período y categoría para entender cómo se movió su dinero.

**Why this priority**: El registro es útil cuando permite comprender los movimientos sin mezclar monedas ni contar transferencias como consumo o ingreso.

**Independent Test**: Cargar un conjunto conocido de ingresos, gastos, devoluciones y transferencias en ARS y USD; consultar un mes y comparar cada total y agrupación con un cálculo manual.

**Acceptance Scenarios**:

1. **Given** movimientos de varias categorías, monedas y cuentas en un período, **When** la persona abre el resumen, **Then** ve ingresos, gastos y diferencia neta agrupados por moneda y categoría, sin sumar monedas distintas ni contar transferencias como ingresos o gastos.
2. **Given** un período sin movimientos, **When** la persona lo consulta, **Then** ve un estado vacío claro y no se muestran totales derivados de datos inexistentes.
3. **Given** un gasto propio con categoría y cuenta asociada, **When** la persona registra una devolución parcial en la fecha de recepción, **Then** la devolución queda vinculada al gasto, acredita esa cuenta, reduce los gastos del período de recepción y no cuenta como ingreso; no se acepta un importe mayor al saldo aún no devuelto.

**Requirements**: FR-008 a FR-009, FR-026.

### User Story 3 - Capturar sin conexión y sincronizar al volver (Priority: P1)

Una persona que ya inició sesión puede anotar movimientos sin conexión, conservarlos localmente mientras el almacenamiento siga disponible y sincronizarlos al volver a abrir Mave con Internet.

**Why this priority**: La captura debe seguir siendo confiable cuando la persona no tiene conectividad, sin insinuar que sus datos ya están respaldados o sincronizados.

**Independent Test**: Iniciar sesión con conexión, desconectarse, crear un movimiento, recargar, recuperar conexión y volver a abrir Mave. Comprobar que el movimiento se conserva mientras no se borre el almacenamiento y aparece una sola vez tras sincronizar.

**Acceptance Scenarios**:

1. **Given** una persona con una sesión iniciada previamente y sin conexión, **When** crea un movimiento, **Then** lo ve como dato local o pendiente y sigue visible después de recargar mientras el almacenamiento local esté disponible.
2. **Given** movimientos pendientes y conexión restablecida, **When** la persona vuelve a abrir Mave, **Then** los movimientos se sincronizan una sola vez aunque haya reintentos.
3. **Given** que Mave está cerrada en iOS, **When** la conexión vuelve, **Then** la persona no recibe una promesa de sincronización en segundo plano con la app cerrada.
4. **Given** cambios incompatibles del mismo movimiento desde dos dispositivos, **When** Mave detecta el conflicto, **Then** muestra ambas versiones y sus diferencias, pide a la persona que elija cuál conservar y no duplica el movimiento en los totales mientras el conflicto siga abierto.
5. **Given** movimientos pendientes al cerrar sesión, **When** otra persona usa el dispositivo, **Then** esos datos no se muestran ni se sincronizan bajo la cuenta de esa otra persona y la persona recibe una advertencia antes de salir.

**Requirements**: FR-017 a FR-022.

### User Story 4 - Organizar cuentas y transferencias (Priority: P2)

Una persona organiza fuentes de dinero como efectivo, banco o billetera, y registra transferencias entre sus propias cuentas cuando tienen la misma moneda.

**Why this priority**: Las cuentas ayudan a interpretar saldos y movimientos sin alterar los totales de ingresos y gastos al mover dinero propio.

**Independent Test**: Crear dos cuentas propias de la misma moneda, registrar un movimiento asociado y transferir un importe entre ellas; revisar los saldos y el resumen del período.

**Acceptance Scenarios**:

1. **Given** una persona con su espacio privado, **When** crea una cuenta de efectivo, banco, billetera digital u otra fuente, **Then** puede asignarle moneda y, opcionalmente, saldo inicial.
2. **Given** dos cuentas propias de la misma moneda, **When** la persona registra una transferencia, **Then** se debita el origen, se acredita el destino y no cambian los totales de ingresos ni gastos.
3. **Given** cuentas con monedas diferentes o una cuenta que no pertenece a la persona, **When** intenta transferir entre ellas, **Then** la operación se rechaza sin conversión automática ni acceso a cuentas ajenas.

**Requirements**: FR-010 a FR-012.

### User Story 5 - Seguir una meta de ahorro (Priority: P2)

Después de los flujos principales, una persona crea una meta sencilla y anota aportes manuales para seguir su avance.

**Why this priority**: Las metas ayudan a organizar ahorros sin convertir el seguimiento en una operación financiera que modifique movimientos o saldos.

**Independent Test**: Crear una meta con nombre, importe y moneda, agregar un aporte manual y comprobar que aumenta el seguimiento de la meta sin crear un movimiento ni cambiar una cuenta.

**Acceptance Scenarios**:

1. **Given** una persona con acceso a Mave, **When** crea una meta, **Then** puede definir nombre, importe objetivo, moneda y una fecha opcional.
2. **Given** una meta existente, **When** anota un aporte manual, **Then** el aporte queda asociado al seguimiento de esa meta, no duplica un movimiento y no cambia el saldo de ninguna cuenta.

**Requirements**: FR-013 a FR-014.

### User Story 6 - Exportar y solicitar la eliminación de datos (Priority: P2)

Una persona obtiene una copia de sus datos y puede solicitar que se eliminen su cuenta y los datos asociados.

**Why this priority**: La persona debe conservar control sobre sus datos financieros y poder abandonar el servicio.

**Independent Test**: Exportar los datos de una cuenta de prueba y comprobar que incluyen sus registros sin datos de otra cuenta; luego enviar una solicitud de eliminación y comprobar que Mave la reconoce y presenta su estado.

**Acceptance Scenarios**:

1. **Given** una persona con datos en Mave, **When** elige exportar en CSV o JSON, **Then** obtiene sus movimientos, cuentas, categorías, metas y aportes en el formato elegido, conservando importes, monedas, fechas y relaciones, sin datos de otras personas.
2. **Given** una persona que solicita eliminar su cuenta y los datos asociados, **When** envía la solicitud, **Then** Mave muestra su estado y fecha límite, permite cancelarla durante los 30 días calendario de gracia y conserva los datos hasta el vencimiento. Si la solicitud no se cancela, los datos se eliminan y los movimientos pendientes no se sincronizan después del vencimiento; un dispositivo offline los elimina al reconectarse.

**Requirements**: FR-015 a FR-016.

### User Story 7 - Usar Mave desde distintos dispositivos con preferencias accesibles (Priority: P2)

Una persona añade Mave a la pantalla de inicio de Safari en iPhone o la abre desde un navegador de escritorio compatible, elige una apariencia y usa los flujos principales con distintos tamaños de pantalla y tecnologías de asistencia.

**Why this priority**: El acceso desde los dispositivos habituales y una interfaz accesible hacen que el registro manual sea sostenible en el uso diario.

**Independent Test**: Recorrer los flujos principales en Safari de iPhone y en navegadores de escritorio actuales, probar los modos de apariencia y completar la navegación con teclado y tecnología de asistencia.

**Acceptance Scenarios**:

1. **Given** una persona en Safari de iPhone o un navegador de escritorio compatible, **When** añade o abre Mave, **Then** puede usar la aplicación desde ese dispositivo sin depender de una aplicación nativa.
2. **Given** una persona que cambia la apariencia, **When** elige oscura, clara o la del sistema, **Then** la interfaz refleja la preferencia elegida.
3. **Given** una persona que navega con teclado o tecnología de asistencia, **When** completa los flujos principales, **Then** encuentra foco visible, contraste WCAG 2.2 AA y estados que no dependen únicamente del color.

**Requirements**: FR-023 a FR-025.

### Edge Cases

- La creación de una cuenta sin conexión se rechaza con una explicación; el uso offline requiere una sesión iniciada previamente.
- Un importe cero o negativo no se acepta como movimiento; las monedas admitidas son ARS y USD.
- Una devolución debe corresponder a un gasto propio, usar su moneda y categoría, y no superar el importe aún no devuelto; si el gasto no tiene cuenta asociada, la devolución solo afecta los totales generales.
- Un período sin movimientos muestra un estado vacío, no un resumen engañoso.
- Una categoría archivada no puede asignarse a movimientos nuevos, pero permanece asociada a los movimientos históricos.
- Una transferencia entre cuentas de monedas distintas no se convierte automáticamente y debe rechazarse con una explicación.
- Si se borra el almacenamiento del navegador, los movimientos que aún no se sincronizaron pueden desaparecer; Mave debe advertirlo claramente y no presentarlos como backup.
- Si hay cambios incompatibles del mismo movimiento desde dos dispositivos, Mave conserva ambas versiones para compararlas, no duplica el movimiento en los totales y espera una elección explícita de la persona.
- Al cerrar sesión con movimientos pendientes, estos siguen asociados a la cuenta original y no se revelan a otra persona.
- Durante los 30 días calendario de gracia, los movimientos pendientes pueden sincronizarse; después del vencimiento no se aceptan sincronizaciones tardías y el dispositivo elimina esos datos al reconectarse. Un dispositivo que no vuelva a conectarse puede conservar datos locales hasta que se borren sus datos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Mave MUST permitir crear una cuenta, iniciar sesión y cerrar sesión. Crear una cuenta requiere conexión a Internet. El método de autenticación, confirmación y recuperación de cuenta se define en planificación.
- **FR-002**: Cada persona MUST acceder únicamente a sus propios movimientos, cuentas, metas, aportes y exportaciones. La primera versión MUST NOT ofrecer espacios compartidos ni permitir que una cuenta lea, modifique o borre datos de otra.
- **FR-003**: Cada movimiento MUST registrar tipo (ingreso o gasto), importe positivo, moneda, categoría y fecha.
- **FR-004**: La fecha local actual MUST proponerse al crear un movimiento y MUST poder corregirse.
- **FR-005**: La cuenta financiera asociada y la nota MUST ser opcionales al registrar un movimiento.
- **FR-006**: La persona MUST poder crear, consultar, editar y borrar sus movimientos y devoluciones propias. Una compra con tarjeta puede registrarse como gasto común, sin crear una deuda de tarjeta.
- **FR-007**: La interfaz MUST estar en español para Argentina. MUST aceptar ARS y USD, proponer ARS por defecto y mantener separados los importes de cada moneda, sin sumarlos ni convertirlos automáticamente.
- **FR-008**: La persona MUST poder consultar el historial por período y revisar sus movimientos por fecha. Un período sin movimientos MUST mostrar un estado vacío claro.
- **FR-009**: El resumen de un período MUST mostrar ingresos, gastos netos de devoluciones, diferencia neta e importes agrupados por categoría, con totales separados por moneda. Las devoluciones reducen los gastos del período de recepción y MUST NOT contar como ingresos. MUST excluir las transferencias entre cuentas propias de los ingresos y gastos.
- **FR-010**: La persona MUST poder crear cuentas financieras para efectivo, banco, billetera digital u otra fuente, indicando moneda y, de forma opcional, saldo inicial.
- **FR-011**: El saldo de una cuenta financiera MUST reflejar su saldo inicial opcional más ingresos asociados y devoluciones acreditadas a esa cuenta, menos gastos asociados, más transferencias recibidas y menos transferencias enviadas. Un movimiento sin cuenta asociada MUST afectar el resumen general, pero no el saldo de una cuenta específica.
- **FR-012**: Una transferencia MUST tener cuentas de origen y destino distintas, propias y de la misma moneda. MUST actualizar los saldos correspondientes y MUST NOT contar como ingreso ni gasto. No se permite conversión automática.
- **FR-013**: La persona MUST poder crear una meta con nombre, importe objetivo, moneda y fecha opcional.
- **FR-014**: La persona MUST poder anotar aportes manuales para el seguimiento de una meta. Un aporte MUST NOT crear otro movimiento ni cambiar por sí mismo el saldo de una cuenta.
- **FR-015**: La persona MUST poder elegir exportar sus movimientos, cuentas, categorías, metas y aportes en CSV o JSON. Ambos formatos MUST conservar importes, monedas, fechas y relaciones entre registros; el CSV MUST estar organizado para su consulta en planillas y el JSON MUST conservar las relaciones de forma estructurada. La exportación MUST incluir solo datos de la cuenta solicitante.
- **FR-016**: La persona MUST poder solicitar la eliminación de su cuenta y los datos asociados. Mave MUST confirmar la recepción, mostrar el estado y la fecha límite, y permitir cancelar durante los 30 días calendario desde la recepción de la solicitud. Durante ese plazo se conservan los datos y los movimientos offline pendientes pueden sincronizarse. Si la solicitud no se cancela, Mave MUST eliminar los datos asociados al cumplirse los 30 días y MUST NOT aceptar sincronizaciones pendientes después del vencimiento. Un dispositivo que siga offline MUST eliminar sus datos pendientes la próxima vez que se conecte a Mave; antes de confirmar la solicitud, la interfaz MUST advertir que un dispositivo que no vuelva a conectarse puede conservar datos locales hasta que se borren sus datos.
- **FR-017**: Una persona con una sesión iniciada previamente MUST poder crear movimientos sin conexión. El uso offline no requiere crear una cuenta sin conexión.
- **FR-018**: Los movimientos creados sin conexión MUST seguir visibles después de recargar mientras el almacenamiento local siga disponible. Mave MUST advertir que los datos no sincronizados no son un backup y pueden desaparecer si se borran los datos del navegador.
- **FR-019**: Mave MUST informar claramente si los datos están solo en el dispositivo, pendientes, sincronizados o requieren atención. El estado MUST comunicarse sin depender únicamente del color.
- **FR-020**: Al volver a abrir Mave con conexión, los movimientos pendientes MUST sincronizarse sin duplicarse, incluso si hay reintentos. Mave MUST NOT prometer sincronización en segundo plano con la aplicación cerrada cuando el navegador no la garantiza, especialmente en iOS.
- **FR-021**: Si hay cambios incompatibles del mismo movimiento desde varios dispositivos, Mave MUST informar que requiere atención, mostrar ambas versiones con sus diferencias y pedir a la persona que elija cuál conservar. MUST preservar ambas versiones hasta la elección y MUST NOT contar el movimiento más de una vez en los totales mientras el conflicto siga abierto. Después de la elección, la versión elegida MUST ser la que afecte los resúmenes y saldos; Mave MUST NOT sobrescribir ni descartar cambios en silencio.
- **FR-022**: Si una persona cierra sesión con movimientos pendientes, Mave MUST advertirlo, mantenerlos asociados a la cuenta original y MUST NOT mostrarlos ni sincronizarlos bajo otra cuenta.
- **FR-023**: Mave MUST poder añadirse a la pantalla de inicio desde Safari en iPhone y abrirse desde navegadores de escritorio compatibles.
- **FR-024**: La persona MUST poder elegir apariencia oscura, clara o la del sistema.
- **FR-025**: La experiencia MUST adaptarse a pantallas angostas y amplias, permitir navegación por teclado y tecnologías de asistencia, mantener foco visible, cumplir contraste WCAG 2.2 AA y expresar estados sin depender únicamente del color.
- **FR-026**: La persona MUST poder registrar, consultar, editar y borrar devoluciones parciales o totales vinculadas a un gasto propio. La devolución MUST tener importe positivo, moneda y categoría iguales a las del gasto, y fecha de recepción; su importe MUST NOT superar el importe del gasto aún no devuelto. La devolución MUST reducir los gastos del período en que se recibe y MUST NOT contarse como ingreso. Si el gasto tiene cuenta financiera asociada, la devolución MUST acreditarse a esa misma cuenta; si no, MUST afectar solo los totales generales.
- **FR-027**: Mave MUST ofrecer un catálogo inicial de categorías y permitir que cada persona cree, renombre y archive categorías en su espacio privado. Una categoría archivada MUST NOT ofrecerse para movimientos nuevos; los movimientos existentes MUST conservar su asociación y mostrarla en el historial y los resúmenes. Las categorías de una persona MUST NOT ser visibles ni asignables por otra.

### Out of Scope

- Espacios compartidos de hogar.
- Importación automática de bancos o Mercado Pago, conexión bancaria, OAuth y scraping.
- Pagos, custodia de fondos y recomendaciones de inversión.
- Deuda de tarjeta, cierres, vencimientos y conciliación de resúmenes; una compra puede anotarse como gasto común.
- Notificaciones push, movimientos recurrentes, presupuestos avanzados y aplicación nativa.

### Key Entities *(include if feature involves data)*

- **Cuenta de acceso**: identidad privada de una persona y límite de acceso a sus datos.
- **Movimiento**: ingreso o gasto propio con importe, moneda, categoría, fecha, cuenta financiera opcional, nota opcional y estado de sincronización.
- **Cuenta financiera**: fuente de dinero propia, con tipo, moneda y saldo inicial opcional.
- **Transferencia**: movimiento entre dos cuentas financieras propias de la misma moneda.
- **Devolución**: importe devuelto, parcial o totalmente, ligado a un gasto propio y registrado en su fecha de recepción; reduce gastos, no ingresos.
- **Conflicto de sincronización**: dos versiones incompatibles del mismo movimiento, conservadas y presentadas para que la persona elija antes de resolver cuál afecta sus totales.
- **Categoría**: clasificación predeterminada o propia de una persona, asignada a sus movimientos y usada en el resumen; puede archivarse sin perder las asociaciones históricas.
- **Meta de ahorro**: objetivo con nombre, importe, moneda y fecha opcional.
- **Aporte manual**: registro de seguimiento asociado a una meta, sin efecto sobre movimientos o saldos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Al menos 4 de 5 personas de prueba registran su primer gasto en menos de 30 segundos y sin ayuda.
- **SC-002**: En todos los casos de prueba donde no se borra el almacenamiento local, un movimiento creado offline permanece visible tras recargar y se sincroniza una sola vez al volver la conexión y abrir Mave.
- **SC-003**: Los totales de un conjunto conocido de ingresos, gastos, devoluciones y transferencias coinciden con el cálculo manual, se presentan separados por moneda, las devoluciones reducen gastos sin contarse como ingresos y las transferencias quedan excluidas.
- **SC-004**: En pruebas con dos cuentas, ninguna puede leer, modificar o borrar datos de la otra.
- **SC-005**: Al menos 4 de 5 personas de prueba encuentran el resumen mensual y comprenden si sus movimientos están sincronizados.
- **SC-006**: Los flujos principales se pueden completar con teclado y tecnologías de asistencia, y cumplen los criterios de contraste WCAG 2.2 AA.
- **SC-007**: Mave se puede añadir a la pantalla de inicio desde Safari en iPhone y abrir desde navegadores de escritorio compatibles.
- **SC-008**: En todas las pruebas, las exportaciones CSV y JSON contienen los datos de la cuenta solicitante, ninguno de otra cuenta, y conservan las relaciones entre registros; cada solicitud de eliminación muestra su estado y una fecha límite a 30 días calendario, puede cancelarse hasta ese momento y, al vencer, impide sincronizar movimientos offline pendientes.
- **SC-009**: En todos los casos de cambios incompatibles, la persona puede comparar ambas versiones y elegir cuál conservar; antes de la elección, el movimiento aparece una sola vez en los totales.
- **SC-010**: En las pruebas, una persona puede crear, renombrar y archivar una categoría; los movimientos existentes conservan su asociación y la categoría archivada no está disponible para movimientos nuevos.

## Assumptions

- La primera versión es para una persona por cuenta; no existen espacios compartidos.
- Argentina es el mercado inicial, el idioma es español y las únicas monedas iniciales son ARS y USD. ARS es la moneda propuesta por defecto y no hay conversión automática.
- Crear una cuenta requiere Internet; el uso offline se habilita para una persona que inició sesión previamente.
- El método de autenticación, confirmación y recuperación de cuenta se decide durante la planificación, tal como indica la descripción de entrada.
- El resumen abre inicialmente el mes calendario actual y permite consultar otros períodos.
- Los saldos de cuentas se calculan con la regla declarada en FR-011; los movimientos sin cuenta solo afectan los resúmenes generales.
- Las metas sencillas y sus aportes manuales se abordan después de los flujos P1.
- Los datos locales pendientes no son un backup y pueden desaparecer si se borran los datos del navegador.
- Las solicitudes de eliminación tienen un período de gracia de 30 días calendario, durante el cual se conservan los datos y la solicitud puede cancelarse.
