import React from "react";
import { getPublicAssetUrl } from "@/api/apiConfig";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { parseDateLima } from "@/lib/dateUtils";

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = parseDateLima(String(value).slice(0, 10));
  return parsed ? format(parsed, "dd/MM/yyyy") : String(value);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : format(date, "dd/MM/yyyy HH:mm");
};

const money = (value) => `S/ ${(Number(value) || 0).toFixed(2)}`;

const Field = ({ label, value, wide = false, mono = false }) => (
  <div className={wide ? "sm:col-span-2" : ""}>
    <p className="text-xs text-slate-500">{label}</p>
    <p className={`text-sm text-slate-900 ${mono ? "font-mono font-semibold" : "font-medium"} break-words`}>
      {value === null || value === undefined || value === "" ? "—" : value}
    </p>
  </div>
);

const Section = ({ title, children }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">{title}</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{children}</div>
  </div>
);

export default function ContractVariablesGrid({ contract, employee, template }) {
  const signatureLabel = contract.is_digitally_signed
    ? `Firmado · ${formatDateTime(contract.digital_signature_date)}`
    : "Pendiente de firma";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-slate-100 text-slate-700 border-slate-200">Solo lectura</Badge>
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">{signatureLabel}</Badge>
        <span className="text-xs text-slate-500">
          Valores guardados del contrato firmado. No se pueden modificar desde esta vista.
        </span>
      </div>

      <Section title="Identificación del contrato">
        <Field label="N° de contrato" value={contract.contract_number || "S/N"} mono />
        <Field label="Tipo de contrato" value={contract.contract_type} />
        <Field label="Plantilla usada" value={template?.template_name || "Plantilla no disponible"} />
        <Field label="Estado" value={contract.status} />
        <Field label="Fecha de inicio" value={formatDate(contract.start_date)} />
        <Field label="Fecha de fin" value={contract.end_date ? formatDate(contract.end_date) : "Indeterminado"} />
        <Field label="Fecha de firma" value={formatDate(contract.signed_date)} />
        <Field label="Renovable" value={contract.renewable ? "Sí" : "No"} />
        <Field label="Período de prueba (días)" value={contract.trial_period_days ?? 90} />
        <Field label="Horas semanales" value={contract.weekly_hours ?? 48} />
      </Section>

      <Section title="Puesto y condiciones">
        <Field label="Cargo" value={contract.position} />
        <Field label="Área de trabajo" value={contract.area_trabajo || contract.department} />
        <Field label="Unidad de trabajo" value={contract.unidad_trabajo} />
        <Field label="Departamento" value={contract.department} />
        <Field label="Sede / lugar de trabajo" value={contract.work_location || employee?.site} />
        <Field label="Horario de trabajo" value={contract.work_schedule} wide />
      </Section>

      <Section title="Remuneración y conceptos">
        <Field label="Remuneración mensual" value={money(contract.salary)} />
        <Field label="Costo de actividad" value={money(contract.activity_cost)} />
        <Field label="Costo de alimento" value={money(contract.food_cost)} />
        <Field label="Costo de movilidad" value={money(contract.transport_cost)} />
      </Section>

      <Section title="Trabajador">
        <Field label="Código de empleado" value={employee?.employee_code} mono />
        <Field label="Nombres y apellidos" value={employee ? `${employee.first_name} ${employee.last_name}` : ""} />
        <Field label="Documento" value={employee ? `${employee.document_type || "DNI"} ${employee.document_number || ""}` : ""} />
        <Field label="Email corporativo" value={employee?.work_email} />
      </Section>

      <Section title="Contenido editado del contrato">
        <Field label="Funciones y responsabilidades" value={contract.functions} wide />
        <Field label="Beneficios adicionales" value={contract.benefits} wide />
        <Field label="Notas" value={contract.notes} wide />
      </Section>

      <Section title="Firma digital">
        <Field label="Firmado digitalmente" value={contract.is_digitally_signed ? "Sí" : "No"} />
        <Field label="Firmante" value={contract.digital_signature_name} />
        <Field label="Usuario firmante" value={contract.digital_signature_by} />
        <Field label="Fecha y hora de firma" value={formatDateTime(contract.digital_signature_date)} />
        {contract.digital_signature_image_url && (
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500 mb-1">Imagen de la firma</p>
            <img
              src={getPublicAssetUrl(contract.digital_signature_image_url)}
              alt="Firma digital"
              className="h-16 object-contain bg-white border border-slate-200 rounded px-2"
            />
          </div>
        )}
      </Section>

      <Section title="Trazabilidad">
        <Field label="Identificador del registro" value={contract.id} mono />
        <Field label="Registrado" value={formatDateTime(contract.created_date)} />
        <Field label="Última actualización" value={formatDateTime(contract.updated_date)} />
        <Field label="PDF almacenado" value={contract.pdf_url} wide />
      </Section>
    </div>
  );
}