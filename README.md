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

backfillAsistenciaEmpleado:
$ node scripts/backfillAsistenciaEmpleado.js --employee_id=<ID> --date_from=2025-01-01

