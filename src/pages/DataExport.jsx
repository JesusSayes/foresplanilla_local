import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Database, FileJson, FileCode, Loader2, FileType } from "lucide-react";
import { toast } from "sonner";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

// Esquemas completos de todas las entidades (incluyendo campos built-in)
const ENTITY_SCHEMAS = {
  User: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP",
    full_name: "TEXT", email: "TEXT", role: "TEXT"
  },
  UserInvitation: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", email: "TEXT", invited_by: "TEXT", invited_at: "TIMESTAMP", status: "TEXT"
  },
  UserRole: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", role_id: "TEXT", assigned_by: "TEXT", assigned_date: "DATE"
  },
  Employee: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_code: "TEXT", document_type: "TEXT", document_number: "TEXT",
    first_name: "TEXT", last_name: "TEXT", birth_date: "DATE", gender: "TEXT",
    personal_email: "TEXT", work_email: "TEXT", phone: "TEXT", mobile: "TEXT",
    address: "TEXT", district: "TEXT", province: "TEXT", department: "TEXT",
    company: "TEXT", position: "TEXT", position_level: "TEXT", profession: "TEXT",
    department_name: "TEXT", area_trabajo: "TEXT", unidad_trabajo: "TEXT", work_unit: "TEXT", site: "TEXT",
    hire_date: "DATE", termination_date: "DATE", contract_type: "TEXT",
    base_salary: "DECIMAL(18,2)", activity_cost: "DECIMAL(18,2)", food_cost: "DECIMAL(18,2)", transport_cost: "DECIMAL(18,2)",
    bank_name: "TEXT", bank_account: "TEXT",
    cci_account: "TEXT", cts_bank: "TEXT", cts_account_number: "TEXT", cts_currency: "TEXT",
    pension_system: "TEXT", afp_id: "TEXT", afp_affiliation_date: "DATE", cuspp: "TEXT",
    worker_type: "TEXT", tax_residence: "TEXT", photo_url: "TEXT", status: "TEXT", role: "TEXT",
    managed_team_ids: "JSON", supervisor_id: "TEXT", supervisor_name: "TEXT",
    emergency_contact_name: "TEXT", emergency_contact_phone: "TEXT", emergency_contact_relationship: "TEXT",
    attendance_method: "TEXT"
  },
  EmployeeChangeLog: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", field_changed: "TEXT", old_value: "TEXT", new_value: "TEXT",
    change_type: "TEXT", changed_by: "TEXT", change_date: "TIMESTAMP", notes: "TEXT"
  },
  Derechohabiente: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", document_type: "TEXT", document_number: "TEXT",
    first_name: "TEXT", last_name: "TEXT", gender: "TEXT", birth_date: "DATE",
    relationship: "TEXT", registration_date: "DATE", deregistration_date: "DATE", is_active: "BOOLEAN"
  },
  Contract: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", contract_number: "TEXT", contract_type: "TEXT", template_id: "TEXT",
    start_date: "DATE", end_date: "DATE", position: "TEXT", area_trabajo: "TEXT", unidad_trabajo: "TEXT", department: "TEXT",
    work_location: "TEXT", salary: "DECIMAL(18,2)", activity_cost: "DECIMAL(18,2)",
    food_cost: "DECIMAL(18,2)", transport_cost: "DECIMAL(18,2)",
    work_schedule: "TEXT", weekly_hours: "INTEGER", functions: "TEXT", benefits: "TEXT",
    trial_period_days: "INTEGER", renewable: "BOOLEAN", status: "TEXT",
    signed_date: "DATE", pdf_url: "TEXT",
    is_digitally_signed: "BOOLEAN", digital_signature_date: "TIMESTAMP",
    digital_signature_by: "TEXT", digital_signature_name: "TEXT",
    digital_signature_image_url: "TEXT", notes: "TEXT"
  },
  ContractTemplate: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    template_name: "TEXT", description: "TEXT", is_default: "BOOLEAN", is_active: "BOOLEAN",
    contract_types: "JSON", company_name: "TEXT", company_ruc: "TEXT", company_address: "TEXT",
    company_representative: "TEXT", company_representative_doc: "TEXT",
    contract_title: "TEXT", contract_subtitle: "TEXT",
    employer_section_title: "TEXT", employer_section_text: "TEXT",
    worker_section_title: "TEXT", worker_section_text: "TEXT",
    introduction_text: "TEXT", section_object_title: "TEXT", contract_object_text: "TEXT",
    section_functions_title: "TEXT", functions_intro_text: "TEXT",
    section_duration_title: "TEXT", duration_indeterminate_text: "TEXT",
    duration_fixed_text: "TEXT", trial_period_text: "TEXT",
    section_salary_title: "TEXT", salary_text: "TEXT",
    section_schedule_title: "TEXT", schedule_text: "TEXT", work_location_text: "TEXT",
    section_obligations_title: "TEXT", obligations_text: "TEXT",
    section_benefits_title: "TEXT", benefits_text: "TEXT",
    section_termination_title: "TEXT", termination_text: "TEXT",
    section_domicile_title: "TEXT", domicile_text: "TEXT"
  },
  ContractClause: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    title: "TEXT", content: "TEXT", type: "TEXT", contract_types: "JSON",
    order: "INTEGER", is_active: "BOOLEAN", category: "TEXT"
  },
  ContractRenewalRule: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", is_active: "BOOLEAN", days_before_expiration: "INTEGER",
    contract_types: "JSON", send_notification: "BOOLEAN", notification_emails: "JSON",
    auto_create_draft: "BOOLEAN", only_renewable: "BOOLEAN", draft_extension_months: "INTEGER"
  },
  AttendanceRecord: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", date: "DATE", clock_in: "TEXT", clock_out: "TEXT",
    scheduled_start: "TEXT", scheduled_end: "TEXT", worked_hours: "DECIMAL(18,2)",
    regular_hours: "DECIMAL(18,2)", overtime_hours_25: "DECIMAL(18,2)", overtime_hours_35: "DECIMAL(18,2)",
    overtime_authorized: "BOOLEAN", is_late: "BOOLEAN", late_minutes: "INTEGER",
    is_absent: "BOOLEAN", status: "TEXT", notes: "TEXT",
    manually_protected_fields: "JSON", last_approved_edit_id: "TEXT",
    manually_modified_by: "TEXT", manually_modified_at: "TIMESTAMP"
  },
  AttendanceEditRequest: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    attendance_record_id: "TEXT", employee_id: "TEXT", attendance_date: "DATE",
    original_values: "JSON", requested_values: "JSON", edit_reason: "TEXT",
    status: "TEXT", requested_by_id: "TEXT", requested_by_name: "TEXT", requested_at: "TIMESTAMP",
    reviewed_by_id: "TEXT", reviewed_by_name: "TEXT", reviewed_at: "TIMESTAMP", review_comment: "TEXT"
  },
  AttendanceIncident: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", attendance_record_id: "TEXT", incident_date: "DATE",
    incident_type: "TEXT", justification: "TEXT", supporting_document_url: "TEXT",
    justified_time_start: "TEXT", justified_time_end: "TEXT",
    full_day_justification: "BOOLEAN", hours_to_adjust: "DECIMAL(18,2)",
    late_minutes_to_adjust: "INTEGER", status: "TEXT",
    reviewed_by: "TEXT", review_date: "DATE", review_comments: "TEXT"
  },
  OvertimeAlert: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", attendance_record_id: "TEXT", alert_date: "DATE",
    overtime_hours: "DECIMAL(18,2)", status: "TEXT",
    resolved_by: "TEXT", resolution_date: "DATE", resolution_notes: "TEXT"
  },
  WorkSchedule: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", department_name: "TEXT", departments: "JSON", schedule_name: "TEXT",
    monday_start: "TEXT", monday_end: "TEXT", tuesday_start: "TEXT", tuesday_end: "TEXT",
    wednesday_start: "TEXT", wednesday_end: "TEXT", thursday_start: "TEXT", thursday_end: "TEXT",
    friday_start: "TEXT", friday_end: "TEXT", saturday_start: "TEXT", saturday_end: "TEXT",
    sunday_start: "TEXT", sunday_end: "TEXT", break_duration_minutes: "INTEGER",
    tolerance_minutes: "INTEGER", exempt_from_clocking: "BOOLEAN",
    overtime_authorized: "BOOLEAN", is_active: "BOOLEAN"
  },
  AccessDevice: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    device_name: "TEXT", device_type: "TEXT", device_id: "TEXT", location: "TEXT",
    ip_address: "TEXT", mac_address: "TEXT", api_endpoint: "TEXT", api_key: "TEXT",
    event_types: "JSON", is_active: "BOOLEAN", last_heartbeat: "TIMESTAMP", configuration: "JSON"
  },
  EmployeeAccessMapping: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", identifier_type: "TEXT", identifier_value: "TEXT",
    device_id: "TEXT", is_active: "BOOLEAN", valid_from: "DATE", valid_until: "DATE", notes: "TEXT"
  },
  DeviceEvent: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    device_id: "TEXT", event_timestamp: "TIMESTAMP", identifier_value: "TEXT",
    identifier_type: "TEXT", event_type: "TEXT", employee_id: "TEXT",
    processing_status: "TEXT", attendance_record_id: "TEXT",
    error_message: "TEXT", raw_data: "JSON"
  },
  DatabaseConnection: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    connection_name: "TEXT", connection_type: "TEXT", host: "TEXT", port: "INTEGER",
    database_name: "TEXT", username: "TEXT", password: "TEXT",
    table_name: "TEXT", field_mapping: "JSON", query_template: "TEXT",
    is_active: "BOOLEAN", last_sync: "TIMESTAMP", sync_frequency: "TEXT", notes: "TEXT"
  },
  SyncLog: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    connection_id: "TEXT", sync_date: "TIMESTAMP", status: "TEXT",
    records_imported: "INTEGER", records_failed: "INTEGER",
    error_message: "TEXT", execution_time: "DECIMAL(18,2)", details: "JSON"
  },
  VacationRequest: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", request_type: "TEXT", start_date: "DATE", end_date: "DATE",
    total_days: "INTEGER", business_days: "INTEGER", reason: "TEXT",
    supporting_document_url: "TEXT", status: "TEXT",
    approved_by: "TEXT", approved_date: "DATE", rejection_reason: "TEXT", comments: "TEXT"
  },
  VacationBalance: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", period_start: "DATE", period_end: "DATE",
    total_entitled_days: "INTEGER", days_taken: "INTEGER",
    days_pending: "INTEGER", days_sold: "INTEGER", is_active: "BOOLEAN", deadline: "DATE"
  },
  Payslip: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", period: "TEXT", month: "INTEGER", year: "INTEGER", payroll_type: "TEXT",
    payroll_number: "TEXT", advance_payment_id: "TEXT",
    worked_days: "INTEGER", non_worked_days: "INTEGER", subsidized_days: "INTEGER",
    regular_hours: "DECIMAL(18,2)", overtime_hours: "DECIMAL(18,2)",
    base_salary: "DECIMAL(18,2)", family_allowance: "DECIMAL(18,2)",
    overtime_pay: "DECIMAL(18,2)", bonuses: "DECIMAL(18,2)",
    commissions: "DECIMAL(18,2)", other_income: "DECIMAL(18,2)", total_income: "DECIMAL(18,2)",
    pension_deduction: "DECIMAL(18,2)", health_insurance: "DECIMAL(18,2)",
    income_tax: "DECIMAL(18,2)", tardiness_discount: "DECIMAL(18,2)",
    absence_discount: "DECIMAL(18,2)", loan_deduction: "DECIMAL(18,2)",
    advance_deduction: "DECIMAL(18,2)", other_deductions: "DECIMAL(18,2)",
    total_deductions: "DECIMAL(18,2)", net_pay: "DECIMAL(18,2)",
    payment_date: "DATE", pdf_url: "TEXT", status: "TEXT", notes: "TEXT"
  },
  PayrollConcept: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", concept_type: "TEXT", concept_category: "TEXT",
    concept_name: "TEXT", concept_code: "TEXT", description: "TEXT",
    amount: "DECIMAL(18,2)", is_dynamic: "BOOLEAN", calculation_formula: "TEXT",
    period: "TEXT", month: "INTEGER", year: "INTEGER",
    is_recurring: "BOOLEAN", is_mandatory: "BOOLEAN",
    applies_to_payroll_types: "JSON", is_applied: "BOOLEAN", payslip_id: "TEXT", notes: "TEXT"
  },
  LoanType: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", description: "TEXT", is_active: "BOOLEAN"
  },
  Loan: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", loan_type_id: "TEXT", amount: "DECIMAL(18,2)",
    total_installments: "INTEGER", installments_paid: "INTEGER",
    monthly_amount: "DECIMAL(18,2)", start_date: "DATE", end_date: "DATE",
    status: "TEXT", notes: "TEXT", approved_by: "TEXT", approval_date: "DATE"
  },
  LoanInstallment: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    loan_id: "TEXT", month: "INTEGER", year: "INTEGER", amount: "DECIMAL(18,2)",
    status: "TEXT", payslip_id: "TEXT", applied_date: "DATE"
  },
  CostCenter: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    code: "TEXT", name: "TEXT", category_id: "TEXT", is_active: "BOOLEAN"
  },
  CostCenterAssignment: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    cost_center_id: "TEXT", assignment_type: "TEXT", employee_id: "TEXT",
    department_name: "TEXT", percentage: "DECIMAL(18,2)",
    start_date: "DATE", end_date: "DATE", is_active: "BOOLEAN", notes: "TEXT"
  },
  CostCenterChangeLog: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    cost_center_id: "TEXT", assignment_id: "TEXT", change_type: "TEXT",
    entity_type: "TEXT", entity_id: "TEXT", field_changed: "TEXT",
    old_value: "TEXT", new_value: "TEXT", changed_by: "TEXT", change_date: "TIMESTAMP", notes: "TEXT"
  },
  CostCenterCategory: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    code: "TEXT", name: "TEXT", description: "TEXT", is_active: "BOOLEAN"
  },
  AccountingAccount: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    elemento: "TEXT", cuenta: "TEXT", nombre: "TEXT", is_active: "BOOLEAN"
  },
  CuentaContable: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    cuenta: "TEXT", descripcion: "TEXT", tipo: "TEXT", is_active: "BOOLEAN"
  },
  AreaUnidadCargo: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    area: "TEXT", unidad: "TEXT", cargo: "TEXT", is_active: "BOOLEAN"
  },
  PayrollConfig: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    config_type: "TEXT", quincenal_percentage: "DECIMAL(18,2)", quincenal_cutoff_day: "INTEGER",
    is_active: "BOOLEAN", notes: "TEXT"
  },
  Holiday: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", date: "DATE", type: "TEXT", is_mandatory: "BOOLEAN", description: "TEXT"
  },
  Position: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", department: "TEXT", level: "TEXT", is_active: "BOOLEAN", description: "TEXT"
  },
  Department: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", code: "TEXT", description: "TEXT", is_active: "BOOLEAN"
  },
  Bank: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", code: "TEXT", is_active: "BOOLEAN"
  },
  Site: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", code: "TEXT", address: "TEXT", is_active: "BOOLEAN"
  },
  AFP: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", code: "TEXT", commission_percentage: "DECIMAL(18,2)",
    obligatory_contribution_percentage: "DECIMAL(18,2)",
    insurance_percentage: "DECIMAL(18,2)", is_active: "BOOLEAN", notes: "TEXT"
  },
  Profession: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", category: "TEXT", is_active: "BOOLEAN"
  },
  Ubigeo: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    codigo_ubigeo: "TEXT", departamento: "TEXT", provincia: "TEXT",
    distrito: "TEXT", codigo_departamento: "TEXT", codigo_provincia: "TEXT"
  },
  RMV: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    amount: "DECIMAL(18,2)", effective_date: "DATE", is_active: "BOOLEAN", notes: "TEXT"
  },
  UIT: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    year: "INTEGER", amount: "DECIMAL(18,2)", is_active: "BOOLEAN"
  },
  SeguroVidaLey: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    age_range_start: "INTEGER", age_range_end: "INTEGER",
    commercial_rate: "DECIMAL(18,2)", is_active: "BOOLEAN"
  },
  Role: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", description: "TEXT", permissions: "JSON",
    is_system_role: "BOOLEAN", department_restricted: "BOOLEAN",
    team_restricted: "BOOLEAN", site_restricted: "BOOLEAN",
    allowed_sites: "JSON", priority: "INTEGER"
  },
  Certificate: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    employee_id: "TEXT", certificate_type: "TEXT", issue_date: "DATE",
    description: "TEXT", pdf_url: "TEXT",
    requested_by_employee: "BOOLEAN", status: "TEXT"
  },
  AsientoContable: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    annomes: "TEXT", subdiario: "TEXT", comprobante: "TEXT", cuenta: "TEXT", cuenta_id: "TEXT",
    fecha_doc: "DATE", tipo_anexo: "TEXT", cod_anexo: "TEXT", tipo_doc: "TEXT", nro_doc: "TEXT",
    fecha_vencimiento: "DATE", moneda: "TEXT", importe: "DECIMAL(18,2)", conversion_tc: "TEXT",
    tc: "DECIMAL(18,6)", importe_soles: "DECIMAL(18,2)", glosa: "TEXT", glosa_mov: "TEXT",
    debe_haber: "TEXT", centro_costos: "TEXT", centro_costos_id: "TEXT", medio_pago: "TEXT",
    fecha_registro: "DATE", anulado: "BOOLEAN", motivo_anulacion: "TEXT", origen: "TEXT",
    payslip_id: "TEXT", employee_id: "TEXT", payroll_period: "TEXT", payroll_type: "TEXT",
    migrado: "BOOLEAN", fecha_migracion: "TIMESTAMP", sistema_destino: "TEXT",
    codigo_migracion: "TEXT", migrado_por: "TEXT", error_migracion: "TEXT", estado_migracion: "TEXT"
  },
  CompanyInfo: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    company_name: "TEXT", ruc: "TEXT", address: "TEXT", phone: "TEXT", email: "TEXT",
    logo_url: "TEXT", legal_representative: "TEXT", legal_representative_dni: "TEXT",
    legal_representative_position: "TEXT", legal_representative_signature_url: "TEXT",
    website: "TEXT", is_active: "BOOLEAN", firmante_gg: "TEXT", firmante_delegado: "TEXT"
  },
  PayslipTemplate: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    template_name: "TEXT", is_active: "BOOLEAN", show_company_logo: "BOOLEAN",
    show_employee_photo: "BOOLEAN", header_fields: "JSON", employee_info_fields: "JSON",
    work_period_fields: "JSON", income_section: "JSON", discount_section: "JSON",
    employer_contribution_section: "JSON", footer_fields: "JSON",
    show_signatures: "BOOLEAN", custom_notes: "TEXT", color_scheme: "TEXT"
  },
  ReportConfiguration: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    report_name: "TEXT", report_type: "TEXT", description: "TEXT",
    filters: "JSON", columns: "JSON", sort_by: "TEXT", sort_order: "TEXT",
    is_shared: "BOOLEAN", is_favorite: "BOOLEAN"
  },
  Notification: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    user_email: "TEXT", employee_id: "TEXT", type: "TEXT",
    title: "TEXT", message: "TEXT", link: "TEXT", link_page: "TEXT",
    is_read: "BOOLEAN", priority: "TEXT",
    related_entity_id: "TEXT", related_entity_type: "TEXT"
  },
  NotificationPreference: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    user_email: "TEXT", employee_id: "TEXT",
    incident_pending: "BOOLEAN", incident_approved: "BOOLEAN", incident_rejected: "BOOLEAN",
    vacation_pending: "BOOLEAN", vacation_approved: "BOOLEAN", vacation_rejected: "BOOLEAN",
    contract_expiring: "BOOLEAN", payslip_ready: "BOOLEAN",
    attendance_alert: "BOOLEAN", system: "BOOLEAN", email_notifications: "BOOLEAN"
  },
  IncidentType: {
    id: "VARCHAR(255) PRIMARY KEY", created_date: "TIMESTAMP", updated_date: "TIMESTAMP", created_by: "TEXT",
    name: "TEXT", affectation: "TEXT", is_active: "BOOLEAN"
  },
};

const ENTITY_GROUPS = [
  { label: "Usuarios y Empleados", entities: ["User", "UserInvitation", "UserRole", "Employee", "EmployeeChangeLog", "Derechohabiente"] },
  { label: "Contratos", entities: ["Contract", "ContractTemplate", "ContractClause", "ContractRenewalRule"] },
  { label: "Asistencia", entities: ["AttendanceRecord", "AttendanceEditRequest", "AttendanceIncident", "OvertimeAlert", "WorkSchedule", "AccessDevice", "EmployeeAccessMapping", "DeviceEvent", "DatabaseConnection", "SyncLog"] },
  { label: "Vacaciones", entities: ["VacationRequest", "VacationBalance"] },
  { label: "Centros de Costo", entities: ["CostCenter", "CostCenterAssignment", "CostCenterChangeLog", "CostCenterCategory", "AccountingAccount"] },
  { label: "Contabilidad", entities: ["AsientoContable", "CuentaContable"] },
  { label: "Datos Maestros", entities: ["Holiday", "Position", "Department", "Bank", "Site", "AFP", "Profession", "Ubigeo", "RMV", "UIT", "SeguroVidaLey", "AreaUnidadCargo", "IncidentType"] },
  { label: "Planillas y Remuneración", entities: ["Payslip", "PayrollConcept", "LoanType", "Loan", "LoanInstallment", "PayrollConfig"] },
  { label: "Roles y Permisos", entities: ["Role"] },
  { label: "Certificados", entities: ["Certificate"] },
  { label: "Configuración de Empresa", entities: ["CompanyInfo", "PayslipTemplate", "ReportConfiguration"] },
  { label: "Notificaciones", entities: ["Notification", "NotificationPreference"] },
];

const ALL_ENTITIES = ENTITY_GROUPS.flatMap(g => g.entities);

function buildCreateTable(entityName) {
  const schema = ENTITY_SCHEMAS[entityName];
  if (!schema) return `CREATE TABLE IF NOT EXISTS ${entityName} (\n  id VARCHAR(255) PRIMARY KEY,\n  created_date TIMESTAMP,\n  updated_date TIMESTAMP,\n  created_by TEXT\n);\n\n`;
  const cols = Object.entries(schema).map(([col, type]) => `  ${col} ${type}`);
  return `CREATE TABLE IF NOT EXISTS ${entityName} (\n${cols.join(',\n')}\n);\n\n`;
}

function buildCreateTableFromRecord(entityName, record) {
  const schema = ENTITY_SCHEMAS[entityName] || {};
  const merged = { ...schema };
  Object.keys(record).forEach(col => {
    if (!merged[col]) {
      const val = record[col];
      if (col === 'id') merged[col] = 'VARCHAR(255) PRIMARY KEY';
      else if (typeof val === 'number') merged[col] = Number.isInteger(val) ? 'INTEGER' : 'DECIMAL(18,2)';
      else if (typeof val === 'boolean') merged[col] = 'BOOLEAN';
      else if (typeof val === 'object' && val !== null) merged[col] = 'JSON';
      else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) merged[col] = 'TIMESTAMP';
      else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) merged[col] = 'DATE';
      else merged[col] = 'TEXT';
    }
  });
  const cols = Object.entries(merged).map(([col, type]) => `  ${col} ${type}`);
  return `CREATE TABLE IF NOT EXISTS ${entityName} (\n${cols.join(',\n')}\n);\n\n`;
}

export default function DataExport() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, entity: "" });
  const [selectedEntities, setSelectedEntities] = useState({});

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
    // Seleccionar todas las entidades por defecto
    const selected = {};
    ALL_ENTITIES.forEach(e => selected[e] = true);
    setSelectedEntities(selected);
    setLoading(false);
  }, [currentUser]);

  const toggleEntity = (entity) => setSelectedEntities(prev => ({ ...prev, [entity]: !prev[entity] }));

  const toggleGroup = (entities) => {
    const allSelected = entities.every(e => selectedEntities[e]);
    setSelectedEntities(prev => {
      const next = { ...prev };
      entities.forEach(e => next[e] = !allSelected);
      return next;
    });
  };

  const toggleAll = () => {
    const allSelected = ALL_ENTITIES.every(e => selectedEntities[e]);
    const newState = {};
    ALL_ENTITIES.forEach(e => newState[e] = !allSelected);
    setSelectedEntities(newState);
  };

  const selectedList = ALL_ENTITIES.filter(e => selectedEntities[e]);
  const selectedCount = selectedList.length;

  const exportToJSON = async () => {
    setExporting(true);
    setProgress({ current: 0, total: selectedList.length, entity: "" });
    try {
      const exportData = { exportDate: new Date().toISOString(), entities: {} };
      for (let i = 0; i < selectedList.length; i++) {
        const entityName = selectedList[i];
        setProgress({ current: i + 1, total: selectedList.length, entity: entityName });
        try {
          const data = await entitiesAPI[entityName].list();
          exportData.entities[entityName] = {
            schema: Object.keys(ENTITY_SCHEMAS[entityName] || {}),
            records: data
          };
          toast.success(`✓ ${entityName}: ${data.length} registros`);
        } catch (error) {
          exportData.entities[entityName] = {
            schema: Object.keys(ENTITY_SCHEMAS[entityName] || {}),
            records: [],
            error: error.message
          };
          toast.error(`✗ Error en ${entityName}`, { duration: 1500 });
        }
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // a.download = `base44_export_${new Date().toISOString().split('T')[0]}.json`;
      a.download = `LocalApi_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("✅ Exportación JSON completa");
    } catch (error) {
      toast.error("Error en la exportación"); console.error(error);
    } finally {
      setExporting(false); setProgress({ current: 0, total: 0, entity: "" });
    }
  };

  const exportToSQL = async () => {
    setExporting(true);
    setProgress({ current: 0, total: selectedList.length, entity: "" });
    try {
      let sqlScript = `-- Portal RRHH - Data Export\n-- Generated: ${new Date().toISOString()}\n-- Entities: ${selectedList.length}\n\n`;
      for (let i = 0; i < selectedList.length; i++) {
        const entityName = selectedList[i];
        setProgress({ current: i + 1, total: selectedList.length, entity: entityName });
        try {
          const data = await entitiesAPI[entityName].list();
          sqlScript += `-- ====================================\n-- Table: ${entityName}\n-- ====================================\n\n`;
          if (data.length > 0) {
            sqlScript += buildCreateTableFromRecord(entityName, data[0]);
            data.forEach(record => {
              const cols = Object.keys(record);
              const vals = cols.map(col => {
                const val = record[col];
                if (val === null || val === undefined) return 'NULL';
                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                return val;
              });
              sqlScript += `INSERT INTO ${entityName} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
            });
            sqlScript += `\n`;
            toast.success(`✓ ${entityName}: ${data.length} registros`, { duration: 1500 });
          } else {
            sqlScript += buildCreateTable(entityName);
            sqlScript += `-- Sin datos\n\n`;
            toast.success(`✓ ${entityName}: tabla creada (sin datos)`, { duration: 1500 });
          }
        } catch (error) {
          sqlScript += buildCreateTable(entityName);
          sqlScript += `-- ERROR al obtener datos: ${error.message}\n\n`;
          toast.error(`✗ Error en ${entityName}`, { duration: 1500 });
        }
      }
      const blob = new Blob([sqlScript], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LocalApi_export_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("✅ Exportación SQL completa");
    } catch (error) {
      toast.error("Error en la exportación"); console.error(error);
    } finally {
      setExporting(false); setProgress({ current: 0, total: 0, entity: "" });
    }
  };

  const exportSchemas = async (onlySelected = false) => {
    const list = onlySelected ? selectedList : ALL_ENTITIES;
    setExporting(true);
    setProgress({ current: 0, total: list.length, entity: "schemas" });
    try {
      const schemas = {};
      for (let i = 0; i < list.length; i++) {
        const entityName = list[i];
        setProgress({ current: i + 1, total: list.length, entity: entityName });
        const hardcoded = ENTITY_SCHEMAS[entityName];
        schemas[entityName] = {
          fields: hardcoded ? Object.entries(hardcoded).map(([field, type]) => ({ field, sql_type: type })) : [],
          field_count: hardcoded ? Object.keys(hardcoded).length : 0
        };
        try {
          const sample = await entitiesAPI[entityName].list("", 1);
          schemas[entityName].has_data = !!(sample && sample.length > 0);
          if (sample && sample.length > 0) schemas[entityName].sample_record = sample[0];
        } catch (_) {
          schemas[entityName].has_data = false;
        }
        toast.success(`✓ ${entityName}`, { duration: 1000 });
      }
      const exportData = { exportDate: new Date().toISOString(), totalEntities: list.length, schemas };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hrportal_schemas_${onlySelected ? 'selected_' : ''}${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("✅ Exportación de esquemas completa");
    } catch (error) {
      toast.error("Error exportando esquemas"); console.error(error);
    } finally {
      setExporting(false); setProgress({ current: 0, total: 0, entity: "" });
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-indigo-600" /></div>;
  }

  if (!employee || (employee.role !== "admin" && employee.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md"><CardContent className="p-8 text-center">
          <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
          <p className="text-slate-600">Solo administradores pueden exportar datos</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Exportación de Datos</h1>
          <p className="text-slate-600 text-lg">Descarga toda tu información para migración o respaldo</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <CardTitle>Entidades ({selectedCount}/{ALL_ENTITIES.length})</CardTitle>
                <Button onClick={toggleAll} variant="outline" size="sm">
                  {ALL_ENTITIES.every(e => selectedEntities[e]) ? "Deseleccionar Todo" : "Seleccionar Todo"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 max-h-[700px] overflow-y-auto space-y-5">
              {ENTITY_GROUPS.map(group => {
                const groupSelected = group.entities.every(e => selectedEntities[e]);
                return (
                  <div key={group.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => toggleGroup(group.entities)}
                        className={`text-xs font-bold px-2 py-0.5 rounded border transition-colors ${groupSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-indigo-50'}`}
                      >
                        {groupSelected ? '✓' : '○'}
                      </button>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{group.label}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {group.entities.map(entity => (
                        <div key={entity} className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-slate-50 cursor-pointer" onClick={() => toggleEntity(entity)}>
                          <Checkbox
                            id={entity}
                            checked={selectedEntities[entity] || false}
                            onCheckedChange={() => toggleEntity(entity)}
                          />
                          <Label htmlFor={entity} className="cursor-pointer text-xs flex-1 leading-tight">{entity}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-indigo-50/50">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="w-5 h-5 text-indigo-600" />Exportar Datos
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                <Button onClick={exportToJSON} disabled={exporting || selectedCount === 0} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {exporting && progress.entity !== "schemas" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exportando...</> : <><FileJson className="w-4 h-4 mr-2" />Descargar JSON</>}
                </Button>
                <Button onClick={exportToSQL} disabled={exporting || selectedCount === 0} variant="outline" className="w-full">
                  {exporting && progress.entity !== "schemas" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando SQL...</> : <><FileCode className="w-4 h-4 mr-2" />Descargar SQL</>}
                </Button>
                <p className="text-xs text-slate-500 text-center">SQL incluye CREATE TABLE con esquema completo + datos</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-green-50/50">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileType className="w-5 h-5 text-green-600" />Exportar Esquemas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                <Button onClick={() => exportSchemas(false)} disabled={exporting} className="w-full bg-green-600 hover:bg-green-700">
                  {exporting && progress.entity === "schemas" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exportando...</> : <><FileType className="w-4 h-4 mr-2" />Todas las Tablas</>}
                </Button>
                <Button onClick={() => exportSchemas(true)} disabled={exporting || selectedCount === 0} variant="outline" className="w-full">
                  <FileType className="w-4 h-4 mr-2" />Tablas Seleccionadas
                </Button>
                <p className="text-xs text-slate-500 text-center">Esquemas hardcodeados — precisos aunque no haya datos</p>
              </CardContent>
            </Card>

            {exporting && (
              <Card className="border-0 shadow-lg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span className="text-sm font-medium text-blue-900 truncate">Exportando {progress.entity}</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                  </div>
                  <p className="text-xs text-blue-700 mt-1">{progress.current} de {progress.total}</p>
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-lg bg-amber-50">
              <CardContent className="p-5">
                <h3 className="font-bold text-amber-900 mb-2">ℹ️ Información</h3>
                <ul className="text-sm text-amber-800 space-y-1.5">
                  <li>• <strong>JSON:</strong> Registros + listado de campos por entidad</li>
                  <li>• <strong>SQL:</strong> CREATE TABLE completo + INSERT (con datos)</li>
                  <li>• <strong>Esquemas:</strong> Todos los campos definidos, con o sin datos</li>
                  <li>• {ALL_ENTITIES.length} entidades disponibles</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
