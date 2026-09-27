# Backup y restauración

**Revisado:** 2026-09-27
**Estado de T058:** Bloqueado. No se eligió plan Supabase ni existe acceso a un proyecto de prueba/producción para inspeccionar backups o ejecutar una restauración. No se restauraron datos.

## Evidencia publicada por el proveedor

La página de seguridad de Supabase declara cifrado de datos en reposo con AES-256 y en tránsito con TLS. La página de backups indica backups diarios automáticos en planes pagos: Pro conserva 7 días, Team 14 y Enterprise hasta 30. Free no incluye backups automáticos descargables; Supabase recomienda exportaciones lógicas regulares con CLI/`pg_dump`. La documentación de PITR publica USD 100 por mes por cada 7 días de retención y requiere compute Small como mínimo. Al habilitar PITR, Supabase deja de tomar backups diarios. Son condiciones publicadas, no la configuración ni el costo verificados de una cuenta Mave.

Estos datos describen documentación del proveedor, no prueban el plan, la región, la configuración, la retención efectiva ni los controles de un proyecto de Mave. La documentación también aclara que los backups de Postgres no contienen objetos de Storage; el producto actualmente no define Storage para datos financieros.

## Registro del proyecto

| Dato                            | Estado                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Proyecto y plan exactos         | No seleccionados                                                                 |
| Región efectiva                 | No verificada; São Paulo (`sa-east-1`) figura como opción publicada              |
| Cifrado/configuración de cuenta | No inspeccionados en dashboard; solo consta la declaración general del proveedor |
| Retención configurada           | Desconocida                                                                      |
| Responsable operativo           | No asignado                                                                      |
| RPO/RTO objetivo                | No acordados ni medidos                                                          |
| Restauración de prueba          | No ejecutada                                                                     |

## Procedimiento requerido antes de cerrar T058

1. Acordar plan, responsable y RPO/RTO objetivo; confirmar en el dashboard la retención y el tipo de backup disponibles.
2. Crear una fuente y destino de prueba aislados. Nunca restaurar sobre producción para esta validación.
3. Tomar un backup con el procedimiento disponible para el plan, registrar el instante UTC y almacenarlo fuera del repositorio con acceso restringido y cifrado adecuado.
4. Restaurar en el proyecto descartable. Registrar inicio/fin UTC, errores, intervención requerida y pérdida temporal de servicio.
5. Verificar esquema/migraciones, conteos por entidad con datos sintéticos y un recorrido de lectura; no copiar filas, emails, secretos ni payloads financieros al reporte.
6. Calcular RPO observado a partir de la última escritura sintética recuperada y RTO desde el inicio hasta la verificación funcional. No presentar valores teóricos del proveedor como resultado medido.

`supabase` CLI, Docker y `psql` no están disponibles en el entorno revisado; tampoco hay proyecto ni credenciales de prueba. Por eso esta nota no atribuye un resultado, RPO/RTO ni responsable ficticio. T058 sigue pendiente.

## Fuentes oficiales

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups), consultada el 2026-09-27.
- [Supabase Pricing](https://supabase.com/pricing), consultada el 2026-09-27.
- [Supabase Security](https://supabase.com/security), consultada el 2026-09-27.
