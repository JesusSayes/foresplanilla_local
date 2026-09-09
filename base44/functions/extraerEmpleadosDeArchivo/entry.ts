import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Extrae datos de empleados de un archivo CSV/Excel subido.
 * Migrado desde el cliente (ImportEmployees) para proteger créditos de integración.
 * UploadFile permanece en el cliente; esta función recibe el file_url ya subido.
 */
const EMPLOYEE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      employee_code: { type: "string" },
      document_type: { type: "string" },
      document_number: { type: "string" },
      first_name: { type: "string" },
      last_name: { type: "string" },
      birth_date: { type: "string" },
      gender: { type: "string" },
      personal_email: { type: "string" },
      work_email: { type: "string" },
      mobile: { type: "string" },
      phone: { type: "string" },
      address: { type: "string" },
      district: { type: "string" },
      province: { type: "string" },
      department: { type: "string" },
      company: { type: "string" },
      position: { type: "string" },
      position_level: { type: "string" },
      profession: { type: "string" },
      department_name: { type: "string" },
      work_unit: { type: "string" },
      site: { type: "string" },
      hire_date: { type: "string" },
      termination_date: { type: "string" },
      contract_type: { type: "string" },
      base_salary: { type: "number" },
      pension_system: { type: "string" },
      afp_id: { type: "string" },
      afp_affiliation_date: { type: "string" },
      cuspp: { type: "string" },
      worker_type: { type: "string" },
      tax_residence: { type: "string" },
      bank_name: { type: "string" },
      bank_account: { type: "string" },
      cci_account: { type: "string" },
      cts_bank: { type: "string" },
      cts_account_number: { type: "string" },
      cts_currency: { type: "string" },
      status: { type: "string" },
      role: { type: "string" },
      supervisor_name: { type: "string" },
      emergency_contact_name: { type: "string" },
      emergency_contact_phone: { type: "string" },
      emergency_contact_relationship: { type: "string" },
    },
    required: ["employee_code", "document_number", "first_name", "last_name"]
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { file_url } = body;

    if (!file_url) {
      return Response.json({ error: 'file_url es requerido' }, { status: 400 });
    }

    const result = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: EMPLOYEE_SCHEMA,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});