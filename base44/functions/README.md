# Referencias históricas de Base44

Conservar los archivos de esta carpeta como referencia histórica al integrar
cambios de `main`, incluso cuando exista una implementación equivalente local.
No eliminar estas referencias por el solo hecho de haber migrado su funcionalidad.

Los imports del SDK y las llamadas de Base44 en estos archivos forman parte del
código histórico. No deben incorporarse al flujo activo de la aplicación local.

Se restauraron sin alterar su contenido desde el commit
`3c03309b71a0c97fe0eb228344eb4b4b6b8eb0fc`:

- `corregirVacacionesFinDeSemana/entry.ts`: implementación activa en
  `backend/controllers/attendance/vacationWeekendController.js`, expuesta mediante
  `POST /api/attendance/records/corregir-vacaciones-fin-de-semana`.
  La pantalla de Gestión de Asistencia la llama desde el botón
  **Actualizar Alertas y Vacaciones**, después de actualizar las alertas de HE,
  utilizando la fecha o rango seleccionado.
- `notificarVencimientoContratos/entry.ts`: implementación activa en
  `backend/services/contractNotificationService.js`, con rutas en
  `backend/routes/contractNotifications.js` y programación en `backend/server.js`.

Restaurar estos archivos no ejecuta las funciones ni cambia las rutas locales.
