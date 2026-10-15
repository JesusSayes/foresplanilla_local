# Política de pago de horas extras por empleado

## Activación

1. Ejecutar manualmente `docs/sql/2026-10-15-politica-pago-he.sql` antes de desplegar el backend. La validación de boletas requiere esa columna.
2. Desplegar y reiniciar el backend (la lista de columnas de empleados se guarda en memoria).
3. Configurar los empleados confirmados por RRHH usando `PUT /api/employees/:id`:

```json
{"overtime_payment_mode":"compensation_only"}
```

La ruta conserva los permisos `employees.edit` / `system.admin` y el alcance de empleados del usuario. La creación de empleados también admite el campo. Los listados y consultas de empleados lo devuelven.

- `payment`: comportamiento existente, valor inicial para todos los empleados. No concede autorizaciones de HE por sí mismo.
- `compensation_only`: impide guardar, actualizar o aprobar boletas que incluyan horas o importes de HE, incluidos los conceptos identificables del resumen de cálculo.

No se clasifica automáticamente al personal por departamento, cargo o rol. La configuración es actual, no tiene vigencias históricas. Al cambiarla, se aplica también a las siguientes escrituras de boletas antiguas del empleado.

## Comportamiento

El rechazo devuelve HTTP 409 y un mensaje que indica que se debe recalcular sin HE. En operaciones masivas se valida todo el lote antes de borrar, insertar o actualizar; un rechazo no deja un lote parcial. Las aprobaciones que envían solamente el estado se validan usando la boleta almacenada.

No se modifican marcaciones, alertas, saldos para compensación ni boletas existentes automáticamente. Tampoco se restan importes de los totales al guardar: hacerlo sin recalcular los conceptos dependientes podría dejar deducciones y aportaciones inconsistentes.

## Adaptación pendiente en frontend

Agregar la selección de política al formulario de empleados. En el cálculo de planilla, para `compensation_only`, excluir HE automáticas y manuales de las variables y conceptos pagables antes de calcular ingresos, aportaciones y descuentos. Los campos de HE liquidadas de la boleta deben quedar en cero y el resumen no debe contener importes de HE. Conservar las horas en asistencia y en las pantallas de compensaciones.

El frontend debe mostrar el mensaje de rechazo de la API. Hasta adaptar el cálculo, la vista previa puede seguir incluyendo HE y su guardado será rechazado. No debe interpretarse la instalación del SQL como activación para todos los administrativos: es necesario configurar cada empleado.
