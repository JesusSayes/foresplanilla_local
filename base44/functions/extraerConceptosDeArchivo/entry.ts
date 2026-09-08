import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Extrae conceptos de planilla de un archivo CSV subido (carga masiva).
 * Migrado desde el cliente (PayrollConcepts) para proteger créditos de integración.
 * UploadFile permanece en el cliente; esta función recibe el file_url ya subido.
 */
const CONCEPTS_SCHEMA = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          document_number: { type: "string" },
          concept_type: { type: "string" },
          concept_category: { type: "string" },
          concept_name: { type: "string" },
          concept_code: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          is_dynamic: { type: "boolean" },
          calculation_formula: { type: "string" },
          system_logic_type: { type: "string" },
          is_recurring: { type: "boolean" },
          is_mandatory: { type: "boolean" },
          applies_to_payroll_types: { type: "string" },
          notes: { type: "string" },
        }
      }
    }
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
      json_schema: CONCEPTS_SCHEMA,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});