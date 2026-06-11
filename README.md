# Base44 App => Local API

Mailpit for develpment:

$ curl -sL https://raw.githubusercontent.com/axllent/mailpit/develop/install.sh | sudo bash

Run on another terminal:

$ mailpit

Emails are displayed in:

http://localhost:8025

Biotime synchronization:

$ npm run sync:biotime 2026-01-01 2026-02-25

Run console:

node -i -r ./backend/console.cjs

New synchronization:

debugListEmployee:
$ node scripts/debugListEmployee.js

changeUserPassword:
$ node scripts/changeUserPassword.js --user_id=<ID_USUARIO> --new_password=NuevaPass123 --admin_employee_id=<ID_ADMIN>

generarAsistenciaDiaria (only today):
$ node scripts/generarAsistenciaDiaria.js --mode=cron

generarAsistenciaDiaria:
$ node scripts/generarAsistenciaDiaria.js --mode=backfill --date_from=2025-01-01

recalcularAsistencia:
$ node scripts/recalcularAsistencia.js --employee_id=<ID> --date_from=2025-01-01 --date_to=2025-03-31

Consultar marcaciones directamente desde BioTime por número de documento:

```bash
cd backend
node scripts/getEmployeeAttendance.js --document_number=<NÚMERO_DOCUMENTO> --date=2026-06-10
```

Para consultar varios días:

```bash
cd backend
node scripts/getEmployeeAttendance.js --document_number=<NÚMERO_DOCUMENTO> --date_from=2026-06-01 --date_to=2026-06-10
```

backfillAsistenciaEmpleado:
$ node scripts/backfillAsistenciaEmpleado.js --employee_id=<ID> --date_from=2025-01-01

syncAttendanceCLI (external):
$ node backend/syncAttendanceCLI.js --help
$ node backend/syncAttendanceCLI.js --dry-run --limit 50

## Limpieza de asistencias posteriores al cese

Para revisar las asistencias existentes posteriores a la fecha de cese, sin modificar datos:

```bash
cd backend
npm run attendance:clean-post-termination
```

Para respaldarlas en `attendance_record_backup` y eliminarlas:

```bash
cd backend
npm run attendance:clean-post-termination:apply
```

El comando con `:apply` es destructivo: primero crea el respaldo y luego elimina las asistencias posteriores a la fecha de cese.
