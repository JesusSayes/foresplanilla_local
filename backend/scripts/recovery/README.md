# Recuperación puntual del 23/09/2026

Desplegar primero el merge que corrige la generación automática. Esta herramienta
se limita a los 39 IDs no exonerados identificados en el CSV de diagnóstico.
No requiere cambios de esquema, SQL manual ni modificaciones de Prisma.

Desde `backend`, con su `.env` configurado:

```bash
node scripts/recuperarMarcacionesAutomaticas.js
```

Es un diagnóstico sin escrituras en la base de datos. Consulta PostgreSQL local,
Biotime mediante `BIOTIME_DATABASE_URL` y la API externa según el método de cada
trabajador. No confirma ni elimina registros de la API externa.

Revisar la tabla de entrada/salida propuestas, especialmente la conversión horaria
de Biotime (usa la misma configuración de `pg` que el sincronizador existente).
Para aplicar, volver a consultar las fuentes y guardar los candidatos actuales:

```bash
node scripts/recuperarMarcacionesAutomaticas.js --apply
```

Antes de escribir se guarda un JSON con cada registro original, propuesta y logs
que se importarán en `backend/logs/recovery`. Su ruta se imprime en terminal.
Cada registro se actualiza en una transacción independiente, que vuelve a comprobar
los datos locales. Si cambiaron después del diagnóstico de esa ejecución, se omite.
Conservar el respaldo y la salida de la ejecución para identificar lo aplicado.

La opción `--apply` **sí modifica la base de datos**, aunque no exige ejecutar SQL
manualmente. Importa las marcaciones Biotime recuperadas a `attendance_logs` y
recalcula solo los registros elegibles. No ejecuta la sincronización general.

Se omiten registros cambiados desde el CSV, protegidos, con solicitudes de edición,
incidencias, alertas HE, compensaciones, segmentos adicionales o exoneración vigente.
Los turnos nocturnos y fuentes ambiguas requieren revisión aparte. Sin evidencia
de marcaciones reales, el registro queda intacto y se informa como pendiente.
Una sola entrada real puede producir `Incompleto`, sin inventar una salida.

El conteo cero del CSV no prueba que Biotime no tenga los datos: puede faltar la
importación local. Si tampoco están en Biotime, hay que revisar dispositivo,
sincronización y zona horaria. La API puede no devolver registros históricos ya
confirmados: en ese caso se necesita recuperarlos desde el sistema de origen.

Las siguientes ejecuciones omiten registros ya recuperados porque su nota y fecha
de modificación dejaron de coincidir con el CSV. No ampliar el manifiesto ni los
filtros para forzar que se recuperen los 39.
