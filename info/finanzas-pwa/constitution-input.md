# Principios propuestos para `/speckit-constitution`

Redactá la constitución inicial del proyecto de finanzas personales a partir de los siguientes principios de gobernanza. Este documento es una propuesta para revisar; no inventes una fecha de ratificación ni una marca comercial. Si falta la fecha o versión inicial, preguntame antes de fijarlas. Actualizá solo `.specify/memory/constitution.md` según el flujo de Spec Kit; no crees la spec de la app ni modifiques código, plantillas u otros archivos.

## Principios

1. **Privacidad y propiedad de los datos**
   - Cada persona es dueña de sus datos financieros y solo puede acceder a los propios, salvo que en el futuro apruebe explícitamente un espacio compartido.
   - Minimizar los datos recolectados y no pedir contraseñas bancarias, credenciales de billeteras ni números o códigos de tarjetas.
   - No exponer claves secretas en el cliente ni registrar información financiera en logs o cachés que no la necesiten.

2. **Exactitud y transparencia financiera**
   - Los importes, monedas, transferencias, devoluciones y saldos deben tener reglas explícitas y pruebas de consistencia.
   - Nunca sumar monedas distintas ni convertirlas sin una decisión visible y una cotización explícita.
   - Las transferencias entre cuentas propias no deben presentarse como ingresos o gastos.

3. **Integridad offline y sincronización**
   - No perder, duplicar ni asignar a otra persona un movimiento pendiente en silencio.
   - Informar claramente cuándo un dato está solo en el dispositivo, pendiente, sincronizado o requiere atención.
   - No prometer sincronización en segundo plano con la app cerrada cuando el navegador no la garantiza.

4. **Accesibilidad y uso multidispositivo**
   - Diseñar primero para teléfono sin degradar la experiencia de escritorio.
   - Mantener navegación por teclado, foco visible, contraste WCAG 2.2 AA y estados que no dependan solo del color.
   - Probar flujos principales en Safari de iPhone y navegadores de escritorio actuales.

5. **Manual-first y alcance deliberado**
   - La carga manual debe seguir siendo completa y útil aunque ninguna integración externa exista.
   - No agregar pagos, custodia, recomendaciones de inversión, scraping ni acceso bancario por conveniencia.
   - Evaluar una integración solo si su cobertura, seguridad, consentimiento, términos y costo fueron verificados.

6. **Calidad y simplicidad**
   - Cada cambio de producto debe tener criterios de aceptación comprobables; probar cálculos financieros, aislamiento entre cuentas, sincronización y restauración de datos.
   - Elegir la solución más simple que preserve privacidad, exactitud y posibilidad de crecer; justificar complejidad y dependencias nuevas.
   - No considerar una función terminada sin validar sus estados de error y recuperación, además del caso exitoso.

## Gobernanza propuesta

- La constitución guía las specs, los planes, las tareas y las revisiones; una decisión que la contradiga debe resolverse explícitamente antes de implementar.
- Las modificaciones a estos principios requieren una actualización documentada y una revisión de impacto; usar versionado semántico según el cambio.
- Antes de implementar una feature, revisar que sus criterios de aceptación y pruebas cubran seguridad, privacidad, accesibilidad y manejo de datos cuando correspondan.
