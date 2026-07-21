import test from 'node:test';
import assert from 'node:assert/strict';
import { getAFPChangeType } from '../controllers/employeeController.js';
import { SCHEDULE_PERMISSION_GROUPS } from '../config/permissions.js';
import {
  escapeHtml,
  mergeContractRecipients,
  pendingContractsForRecipient,
} from '../services/contractNotificationService.js';

test('clasifica correctamente los cambios AFP', () => {
  assert.equal(
    getAFPChangeType({ pension_system: 'ONP' }, { pension_system: 'AFP' }),
    'Cambio de Sistema de Pensiones'
  );
  assert.equal(
    getAFPChangeType({ pension_system: 'AFP', afp_id: 'a' }, { pension_system: 'AFP', afp_id: 'b' }),
    'Cambio de AFP'
  );
  assert.equal(
    getAFPChangeType(
      { pension_system: 'AFP', afp_id: 'a', afp_commission_type: 'Flujo' },
      { pension_system: 'AFP', afp_id: 'a', afp_commission_type: 'Mixta' }
    ),
    'Cambio de Comisión'
  );
});

test('permite consultar horarios a los perfiles que revisan asistencia', () => {
  const attendanceReadPermissions = [
    'attendance.view_all',
    'attendance.view_department',
    'attendance.manage',
    'attendance.approve_edits',
    'attendance.approve_incidents',
  ];

  for (const permission of attendanceReadPermissions) {
    assert.ok(SCHEDULE_PERMISSION_GROUPS.view.includes(permission));
    assert.ok(!SCHEDULE_PERMISSION_GROUPS.create.includes(permission));
    assert.ok(!SCHEDULE_PERMISSION_GROUPS.update.includes(permission));
    assert.ok(!SCHEDULE_PERMISSION_GROUPS.delete.includes(permission));
  }
});

test('filtra preferencias y evita destinatarios duplicados', () => {
  const recipients = mergeContractRecipients(
    [
      { email: 'ADMIN@EMPRESA.COM', contract_expiring: true, is_external: false },
      { email: 'omitido@empresa.com', contract_expiring: false, is_external: false },
    ],
    [
      { email: 'admin@empresa.com', is_external: true },
      { email: 'externo@empresa.com', is_external: true },
    ]
  );

  assert.deepEqual(recipients.map(recipient => recipient.email), [
    'admin@empresa.com',
    'externo@empresa.com',
  ]);
  assert.equal(recipients[0].is_external, false);
});

test('deduplica contratos por destinatario y día', () => {
  const contracts = [{ contract_id: 'c1' }, { contract_id: 'c2' }];
  const delivered = new Set(['c1:admin@empresa.com']);
  assert.deepEqual(
    pendingContractsForRecipient(contracts, 'ADMIN@EMPRESA.COM', delivered),
    [{ contract_id: 'c2' }]
  );
});

test('escapa datos variables antes de generar HTML de correo', () => {
  assert.equal(escapeHtml('<script>"x" & y</script>'), '&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;');
});
