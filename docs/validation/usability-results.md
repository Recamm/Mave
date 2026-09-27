# Validación de usabilidad

**Estado de T060:** No ejecutada. No se reclutaron participantes ni se registraron observaciones. Las filas de abajo son una plantilla vacía, no resultados.

## Protocolo

- Reclutar cinco personas que no hayan usado Mave; registrar solo códigos `P01` a `P05`, sin nombre, email ni datos financieros reales.
- Usar una versión y viewport comunes, una cuenta/proyecto descartable y movimientos sintéticos. Consentir la prueba y explicar que se mide la interfaz, no a la persona.
- Dar la consigna de crear un gasto ficticio. Iniciar cronómetro al terminar de leer la consigna y detenerlo cuando la interfaz confirme un estado entendible (sincronizado o pendiente). No dar ayuda durante el primer intento; registrar segundos y si necesitó ayuda.
- Luego pedir que encuentre el resumen del mes y explique si el movimiento de prueba está sincronizado. Preparar un estado sincronizado y otro pendiente para verificar ambos mensajes; no sugerir dónde aparecen.
- Registrar errores de interpretación literalmente pero sin información personal. Borrar las cuentas y datos sintéticos al terminar.

## Criterios

- **SC-001:** al menos 4/5 registran el primer gasto en menos de 30 segundos y sin ayuda.
- **SC-005:** al menos 4/5 encuentran el resumen mensual y comprenden correctamente si sus movimientos están sincronizados.
- No contar un acierto si hubo indicaciones, si la persona confundió pendiente con sincronizado o si el registro de prueba no quedó en el estado indicado.

## Registro pendiente

| Código | Tiempo del primer gasto (s) | Sin ayuda | Encuentra resumen | Interpreta sync correctamente | Observaciones anonimizadas |
| ------ | --------------------------: | --------- | ----------------- | ----------------------------- | -------------------------- |
| P01    |                           — | —         | —                 | —                             | —                          |
| P02    |                           — | —         | —                 | —                             | —                          |
| P03    |                           — | —         | —                 | —                             | —                          |
| P04    |                           — | —         | —                 | —                             | —                          |
| P05    |                           — | —         | —                 | —                             | —                          |

**Resultado SC-001:** No medido.  
**Resultado SC-005:** No medido.  
**Conclusión:** T060 permanece pendiente hasta realizar y documentar las cinco sesiones reales. No inferir aprobación a partir de Playwright ni completar datos ficticios.
