<!--
Sync Impact Report
Version change: unratified -> 1.0.0
Modified principles: none (initial ratification)
Added sections: six principles; Restricciones del producto; Flujo de desarrollo y calidad
Removed sections: template examples and unresolved placeholders
Follow-up TODOs: none
-->

# Constitución del Proyecto de Finanzas Personales

## Principios fundamentales

### I. Privacidad y propiedad de los datos

Cada persona es dueña de sus datos financieros y solo puede acceder a los propios.
Un espacio compartido requiere aprobación explícita. El producto DEBE recolectar
únicamente los datos necesarios y NO DEBE solicitar contraseñas bancarias,
credenciales de billeteras, números ni códigos de tarjetas. Las claves secretas
NO DEBEN exponerse en el cliente; la información financiera NO DEBE registrarse
en logs ni guardarse en cachés que no la necesiten. Las pruebas DEBEN verificar
el aislamiento entre personas.

### II. Exactitud y transparencia financiera

El producto DEBE definir y probar reglas consistentes para importes, monedas,
transferencias, devoluciones y saldos. NO DEBE sumar importes de monedas distintas
ni convertir monedas sin una decisión visible y una cotización explícita. Las
transferencias entre cuentas propias NO DEBEN mostrarse como ingresos ni gastos.

### III. Integridad offline y sincronización

El sistema NO DEBE perder, duplicar ni atribuir silenciosamente a otra persona un
movimiento pendiente. La interfaz DEBE distinguir con claridad los datos solo en
el dispositivo, pendientes, sincronizados y que requieren atención. El producto
NO DEBE prometer sincronización en segundo plano con la app cerrada cuando el
navegador no la garantice.

### IV. Accesibilidad y uso multidispositivo

El diseño DEBE priorizar el teléfono sin degradar la experiencia de escritorio.
Los flujos principales DEBEN permitir navegación por teclado, mostrar foco
visible, cumplir los criterios de contraste WCAG 2.2 AA y comunicar estados sin
depender solo del color. Los flujos principales DEBEN probarse en Safari de
iPhone y en navegadores de escritorio actuales.

## Restricciones del producto

### V. Manual-first y alcance deliberado

La carga manual DEBE seguir siendo completa y útil aunque no exista ninguna
integración externa. El producto NO DEBE incorporar pagos, custodia,
recomendaciones de inversión, scraping ni acceso bancario por conveniencia. Una
integración externa solo puede evaluarse después de verificar su cobertura,
seguridad, consentimiento, términos aplicables y costo.

## Flujo de desarrollo y calidad

### VI. Calidad y simplicidad

Cada cambio de producto DEBE tener criterios de aceptación comprobables y pruebas
de cálculos financieros, aislamiento entre cuentas, sincronización y restauración
de datos cuando corresponda. Se DEBE elegir la solución más simple que preserve
la privacidad, la exactitud y la posibilidad de crecer; toda complejidad y
dependencia nueva DEBE justificarse. Una función NO DEBE considerarse terminada
sin validar sus estados de error y recuperación, además del caso exitoso.

Antes de implementar una función, la revisión DEBE comprobar que sus criterios de
aceptación y pruebas cubren seguridad, privacidad, accesibilidad y manejo de
datos cuando corresponda.

## Gobernanza

Esta constitución guía las especificaciones, los planes, las tareas y las
revisiones. Toda decisión que contradiga sus principios DEBE documentarse y
resolverse explícitamente antes de implementar; un conflicto sin resolver no
autoriza la implementación.

Toda modificación de estos principios DEBE documentarse y acompañarse de una
revisión de impacto. La versión se incrementa según versionado semántico:
**MAJOR** para cambios incompatibles, eliminaciones o redefiniciones de
principios o gobernanza; **MINOR** para principios o secciones nuevos, o una
ampliación material de la guía; **PATCH** para aclaraciones y cambios editoriales
sin efecto semántico.

Las revisiones DEBEN comprobar el cumplimiento de los principios aplicables y que
los criterios de aceptación y las pruebas cubran seguridad, privacidad,
accesibilidad y manejo de datos cuando corresponda.

**Version**: 1.0.0 | **Ratified**: 2026-09-26 | **Last Amended**: 2026-09-26
