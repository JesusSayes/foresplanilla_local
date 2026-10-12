-- Ejecutar manualmente antes de desplegar las nuevas rutas. No modifica tablas existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.adelantogratificacion (
  id varchar(255) PRIMARY KEY,
  created_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "employee_id" text NOT NULL,
  "amount" numeric(18, 2) NOT NULL CHECK ("amount" >= 0),
  "advance_date" date NOT NULL,
  "gratification_period" text NOT NULL CHECK ("gratification_period" IN ('Julio', 'Diciembre')),
  "gratification_year" integer NOT NULL CHECK ("gratification_year" >= 0),
  "apply_to_gratification" boolean DEFAULT true,
  "status" text DEFAULT 'Pendiente' CHECK ("status" IN ('Pendiente', 'Aprobado', 'Aplicado', 'Pagado', 'Revertido')),
  "approved_by" text,
  "approved_date" timestamptz,
  "payment_reference" text,
  "payment_date" date,
  "applied_amount" numeric(18, 2) DEFAULT 0 CHECK ("applied_amount" >= 0),
  "remaining_balance" numeric(18, 2) DEFAULT 0 CHECK ("remaining_balance" >= 0),
  "applied_to_payslip_id" text,
  "reverted_by" text,
  "reverted_date" timestamptz,
  "revert_reason" text,
  "reason" text,
  "notes" text,
  "created_by" text
);

CREATE INDEX IF NOT EXISTS adelantogratificacion_employee_idx ON public.adelantogratificacion (employee_id);

CREATE TABLE IF NOT EXISTS public.horasextrasmanual (
  id varchar(255) PRIMARY KEY,
  created_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "employee_id" text NOT NULL,
  "payslip_id" text,
  "month" integer NOT NULL CHECK ("month" >= 0) CHECK ("month" BETWEEN 1 AND 12),
  "year" integer NOT NULL CHECK ("year" >= 0),
  "payroll_type" text NOT NULL CHECK ("payroll_type" IN ('Quincenal', 'Mensual', 'Adicional', 'SNP')),
  "overtime_hours_25" numeric(18, 2) DEFAULT 0 CHECK ("overtime_hours_25" >= 0),
  "overtime_minutes_25" integer DEFAULT 0 CHECK ("overtime_minutes_25" >= 0) CHECK ("overtime_minutes_25" < 60),
  "overtime_hours_35" numeric(18, 2) DEFAULT 0 CHECK ("overtime_hours_35" >= 0),
  "overtime_minutes_35" integer DEFAULT 0 CHECK ("overtime_minutes_35" >= 0) CHECK ("overtime_minutes_35" < 60),
  "reason" text NOT NULL,
  "status" text DEFAULT 'Activo' CHECK ("status" IN ('Activo', 'Revertido')),
  "created_by" text,
  "reverted_by" text,
  "reverted_date" timestamptz,
  "revert_reason" text
);

CREATE INDEX IF NOT EXISTS horasextrasmanual_employee_idx ON public.horasextrasmanual (employee_id);

CREATE TABLE IF NOT EXISTS public.quintacategoriacalculo (
  id varchar(255) PRIMARY KEY,
  created_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "employee_id" text NOT NULL,
  "year" integer NOT NULL CHECK ("year" >= 0),
  "month" integer NOT NULL CHECK ("month" >= 0) CHECK ("month" BETWEEN 1 AND 12),
  "payroll_type" text DEFAULT 'Mensual' CHECK ("payroll_type" IN ('Mensual', 'Adicional')),
  "projected_annual_income" numeric(18, 2) DEFAULT 0 CHECK ("projected_annual_income" >= 0),
  "annual_deduction" numeric(18, 2) DEFAULT 0 CHECK ("annual_deduction" >= 0),
  "projected_taxable_base" numeric(18, 2) DEFAULT 0 CHECK ("projected_taxable_base" >= 0),
  "projected_annual_tax" numeric(18, 2) DEFAULT 0 CHECK ("projected_annual_tax" >= 0),
  "prior_retentions" numeric(18, 2) DEFAULT 0 CHECK ("prior_retentions" >= 0),
  "current_month_retention" numeric(18, 2) DEFAULT 0 CHECK ("current_month_retention" >= 0),
  "calculation_mode" text DEFAULT 'auto' CHECK ("calculation_mode" IN ('auto', 'manual')),
  "manual_amount" numeric(18, 2) DEFAULT 0 CHECK ("manual_amount" >= 0),
  "manual_reason" text,
  "status" text DEFAULT 'Pendiente' CHECK ("status" IN ('Pendiente', 'Aprobada', 'Aplicada', 'Revertida')),
  "approved_by" text,
  "approved_date" timestamptz,
  "applied_to_payslip_id" text,
  "applied_date" timestamptz,
  "reverted_by" text,
  "reverted_date" timestamptz,
  "revert_reason" text,
  "calculation_detail" jsonb,
  "config_id" text,
  "created_by" text
);

CREATE INDEX IF NOT EXISTS quintacategoriacalculo_employee_idx ON public.quintacategoriacalculo (employee_id);

CREATE TABLE IF NOT EXISTS public.quintacategoriaconfig (
  id varchar(255) PRIMARY KEY,
  created_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "year" integer NOT NULL CHECK ("year" >= 0),
  "uit_amount" numeric(18, 2) NOT NULL CHECK ("uit_amount" >= 0),
  "annual_deduction_uit" numeric(18, 2) DEFAULT 7 CHECK ("annual_deduction_uit" >= 0),
  "tax_brackets" jsonb,
  "is_active" boolean DEFAULT true,
  "notes" text
);

CREATE TABLE IF NOT EXISTS public.ventavacaciones (
  id varchar(255) PRIMARY KEY,
  created_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "employee_id" text NOT NULL,
  "vacation_period_origin" text,
  "days_sold" numeric(18, 2) NOT NULL CHECK ("days_sold" >= 0),
  "amount" numeric(18, 2) NOT NULL CHECK ("amount" >= 0),
  "sale_date" date NOT NULL,
  "payment_period_month" integer CHECK ("payment_period_month" >= 0) CHECK ("payment_period_month" BETWEEN 1 AND 12),
  "payment_period_year" integer CHECK ("payment_period_year" >= 0),
  "payroll_type" text DEFAULT 'Mensual' CHECK ("payroll_type" IN ('Mensual', 'Adicional')),
  "status" text DEFAULT 'Pendiente' CHECK ("status" IN ('Pendiente', 'Aprobada', 'Aplicada', 'Pagada', 'Rechazada', 'Revertida')),
  "approved_by" text,
  "approved_date" timestamptz,
  "payment_reference" text,
  "applied_to_payslip_id" text,
  "applied_date" timestamptz,
  "reverted_by" text,
  "reverted_date" timestamptz,
  "revert_reason" text,
  "rejected_by" text,
  "rejected_date" timestamptz,
  "rejection_reason" text,
  "reason" text,
  "notes" text,
  "created_by" text
);

CREATE INDEX IF NOT EXISTS ventavacaciones_employee_idx ON public.ventavacaciones (employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS quintacategoriaconfig_active_year_idx ON public.quintacategoriaconfig (year) WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS quintacategoriacalculo_active_period_idx ON public.quintacategoriacalculo (employee_id, year, month, payroll_type) WHERE status <> 'Revertida';

COMMIT;
