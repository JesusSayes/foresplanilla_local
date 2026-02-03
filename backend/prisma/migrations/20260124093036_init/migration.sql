-- CreateTable
CREATE TABLE "access_device" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "access_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afp" (
    "name" VARCHAR(150),
    "code" VARCHAR(50),
    "commission_percentage" DECIMAL(6,2),
    "obligatory_contribution_percentage" DECIMAL(6,2),
    "insurance_percentage" DECIMAL(6,2),
    "is_active" BOOLEAN,
    "notes" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "afp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_incident" (
    "employee_id" VARCHAR(50),
    "attendance_record_id" VARCHAR(50),
    "incident_date" DATE,
    "incident_type" VARCHAR(100),
    "justification" TEXT,
    "supporting_document_url" TEXT,
    "justified_time_start" VARCHAR(10),
    "justified_time_end" VARCHAR(10),
    "full_day_justification" BOOLEAN,
    "hours_to_adjust" DECIMAL(6,2),
    "late_minutes_to_adjust" DECIMAL(6,2),
    "status" VARCHAR(50),
    "reviewed_by" VARCHAR(150),
    "review_date" DATE,
    "review_comments" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "attendance_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_record" (
    "employee_id" VARCHAR(50),
    "date" DATE,
    "clock_in" VARCHAR(10),
    "clock_out" VARCHAR(10),
    "scheduled_start" VARCHAR(10),
    "scheduled_end" VARCHAR(10),
    "worked_hours" DECIMAL(6,2),
    "is_late" BOOLEAN,
    "late_minutes" DECIMAL(6,2),
    "is_absent" BOOLEAN,
    "status" VARCHAR(50),
    "notes" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank" (
    "name" VARCHAR(150),
    "code" VARCHAR(50),
    "is_active" BOOLEAN,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_info" (
    "company_name" VARCHAR(200),
    "ruc" VARCHAR(20),
    "address" VARCHAR(250),
    "phone" VARCHAR(50),
    "email" VARCHAR(150),
    "logo_url" TEXT,
    "legal_representative" VARCHAR(150),
    "legal_representative_dni" VARCHAR(20),
    "legal_representative_position" VARCHAR(150),
    "website" VARCHAR(150),
    "is_active" BOOLEAN,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "company_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract" (
    "employee_id" VARCHAR(50),
    "contract_number" VARCHAR(50),
    "contract_type" VARCHAR(50),
    "template_id" VARCHAR(50),
    "start_date" DATE,
    "end_date" DATE,
    "position" VARCHAR(100),
    "department" VARCHAR(100),
    "work_location" VARCHAR(150),
    "salary" DECIMAL(12,2),
    "work_schedule" TEXT,
    "weekly_hours" DECIMAL(5,2),
    "functions" TEXT,
    "benefits" TEXT,
    "trial_period_days" DECIMAL(5,0),
    "renewable" BOOLEAN,
    "status" VARCHAR(50),
    "signed_date" DATE,
    "pdf_url" TEXT,
    "notes" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_clause" (
    "title" VARCHAR(200),
    "content" TEXT,
    "type" VARCHAR(50),
    "contract_types" JSONB,
    "order" DECIMAL(5,0),
    "is_active" BOOLEAN,
    "category" VARCHAR(50),
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "contract_clause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_renewal_rule" (
    "name" VARCHAR(200),
    "is_active" BOOLEAN,
    "days_before_expiration" DECIMAL(5,0),
    "contract_types" JSONB,
    "send_notification" BOOLEAN,
    "notification_emails" JSONB,
    "auto_create_draft" BOOLEAN,
    "only_renewable" BOOLEAN,
    "draft_extension_months" DECIMAL(5,0),
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "contract_renewal_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_template" (
    "template_name" VARCHAR(200),
    "description" TEXT,
    "is_default" BOOLEAN,
    "is_active" BOOLEAN,
    "contract_types" JSONB,
    "company_name" VARCHAR(200),
    "company_ruc" VARCHAR(20),
    "company_address" VARCHAR(250),
    "company_representative" VARCHAR(150),
    "company_representative_doc" VARCHAR(100),
    "introduction_text" TEXT,
    "contract_object_text" TEXT,
    "functions_intro_text" TEXT,
    "duration_indeterminate_text" TEXT,
    "duration_fixed_text" TEXT,
    "trial_period_text" TEXT,
    "salary_text" TEXT,
    "schedule_text" TEXT,
    "work_location_text" TEXT,
    "obligations_text" TEXT,
    "benefits_text" TEXT,
    "termination_text" TEXT,
    "domicile_text" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "contract_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_center" (
    "code" VARCHAR(50),
    "name" VARCHAR(200),
    "category" VARCHAR(100),
    "is_active" BOOLEAN,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "cost_center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_center_assignment" (
    "cost_center_id" VARCHAR(50),
    "assignment_type" VARCHAR(50),
    "employee_id" VARCHAR(50),
    "department_name" VARCHAR(150),
    "percentage" DECIMAL(5,2),
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN,
    "notes" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "cost_center_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_center_change_log" (
    "cost_center_id" VARCHAR(50),
    "assignment_id" VARCHAR(50),
    "change_type" VARCHAR(100),
    "entity_type" VARCHAR(50),
    "entity_id" VARCHAR(50),
    "field_changed" VARCHAR(150),
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" VARCHAR(150),
    "change_date" TIMESTAMP(6),
    "notes" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "cost_center_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "database_connection" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "database_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "name" VARCHAR(150),
    "code" VARCHAR(50),
    "description" TEXT,
    "is_active" BOOLEAN,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "derechohabiente" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "derechohabiente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_event" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "device_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "employee_code" VARCHAR(50),
    "document_type" VARCHAR(20),
    "document_number" VARCHAR(20),
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(150),
    "birth_date" DATE,
    "gender" VARCHAR(10),
    "personal_email" VARCHAR(150),
    "work_email" VARCHAR(150),
    "phone" VARCHAR(50),
    "mobile" VARCHAR(50),
    "address" VARCHAR(200),
    "district" VARCHAR(100),
    "province" VARCHAR(100),
    "department" VARCHAR(100),
    "company" VARCHAR(150),
    "position" VARCHAR(100),
    "position_level" VARCHAR(100),
    "profession" VARCHAR(150),
    "department_name" VARCHAR(150),
    "work_unit" VARCHAR(100),
    "site" VARCHAR(150),
    "hire_date" DATE,
    "termination_date" DATE,
    "contract_type" VARCHAR(50),
    "base_salary" DECIMAL(12,2),
    "bank_name" VARCHAR(150),
    "bank_account" VARCHAR(100),
    "cci_account" VARCHAR(100),
    "cts_bank" VARCHAR(150),
    "cts_account_number" VARCHAR(100),
    "cts_currency" VARCHAR(50),
    "pension_system" VARCHAR(50),
    "afp_id" VARCHAR(50),
    "afp_affiliation_date" DATE,
    "cuspp" VARCHAR(50),
    "worker_type" VARCHAR(50),
    "tax_residence" VARCHAR(50),
    "photo_url" TEXT,
    "status" VARCHAR(50),
    "role" VARCHAR(50),
    "managed_team_ids" JSONB,
    "supervisor_id" VARCHAR(50),
    "supervisor_name" VARCHAR(150),
    "emergency_contact_name" VARCHAR(150),
    "emergency_contact_phone" VARCHAR(50),
    "emergency_contact_relationship" VARCHAR(50),
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_access_mapping" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "employee_access_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_change_log" (
    "employee_id" VARCHAR(50),
    "field_changed" VARCHAR(100),
    "old_value" VARCHAR(255),
    "new_value" VARCHAR(255),
    "change_type" VARCHAR(50),
    "changed_by" VARCHAR(150),
    "change_date" TIMESTAMP(6),
    "notes" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "employee_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday" (
    "name" VARCHAR(150),
    "date" DATE,
    "type" VARCHAR(50),
    "is_mandatory" BOOLEAN,
    "description" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_alert" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "overtime_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_concept" (
    "employee_id" VARCHAR(50),
    "concept_type" VARCHAR(50),
    "concept_category" VARCHAR(100),
    "concept_name" VARCHAR(150),
    "concept_code" VARCHAR(50),
    "description" TEXT,
    "amount" DECIMAL(12,2),
    "is_dynamic" BOOLEAN,
    "calculation_formula" TEXT,
    "period" VARCHAR(50),
    "month" DECIMAL(2,0),
    "year" DECIMAL(4,0),
    "is_recurring" BOOLEAN,
    "is_mandatory" BOOLEAN,
    "applies_to_payroll_types" JSONB,
    "is_applied" BOOLEAN,
    "payslip_id" VARCHAR(50),
    "notes" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "payroll_concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_template" (
    "template_name" VARCHAR(200),
    "is_active" BOOLEAN,
    "show_company_logo" BOOLEAN,
    "show_employee_photo" BOOLEAN,
    "header_fields" JSONB,
    "employee_info_fields" JSONB,
    "work_period_fields" JSONB,
    "income_section" JSONB,
    "discount_section" JSONB,
    "employer_contribution_section" JSONB,
    "footer_fields" JSONB,
    "show_signatures" BOOLEAN,
    "custom_notes" TEXT,
    "color_scheme" VARCHAR(50),
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "payslip_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "name" VARCHAR(150),
    "department" VARCHAR(150),
    "level" VARCHAR(100),
    "is_active" BOOLEAN,
    "description" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profession" (
    "name" VARCHAR(150),
    "category" VARCHAR(100),
    "is_active" BOOLEAN,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "profession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmv" (
    "amount" DECIMAL(12,2),
    "effective_date" DATE,
    "is_active" BOOLEAN,
    "notes" TEXT,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "rmv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "name" VARCHAR(100),
    "description" TEXT,
    "permissions" JSONB,
    "is_system_role" BOOLEAN,
    "department_restricted" BOOLEAN,
    "team_restricted" BOOLEAN,
    "priority" DECIMAL(5,0),
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site" (
    "name" VARCHAR(150),
    "code" VARCHAR(50),
    "address" TEXT,
    "is_active" BOOLEAN,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubigeo" (
    "codigo_ubigeo" VARCHAR(10),
    "departamento" VARCHAR(100),
    "provincia" VARCHAR(100),
    "distrito" VARCHAR(100),
    "codigo_departamento" VARCHAR(10),
    "codigo_provincia" VARCHAR(10),
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "ubigeo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invitation" (
    "employee_id" VARCHAR(50),
    "email" VARCHAR(150),
    "invited_by" VARCHAR(150),
    "invited_at" TIMESTAMP(6),
    "status" VARCHAR(50),
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "user_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "employee_id" VARCHAR(50),
    "role_id" VARCHAR(50),
    "assigned_by" VARCHAR(150),
    "assigned_date" DATE,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(255) NOT NULL DEFAULT 'admin',
    "full_name" VARCHAR(255),
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacatin_request" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "vacatin_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacation_balance" (
    "employee_id" VARCHAR(50),
    "period_start" DATE,
    "period_end" DATE,
    "total_entitled_days" DECIMAL(5,2),
    "days_taken" DECIMAL(5,2),
    "days_pending" DECIMAL(5,2),
    "days_sold" DECIMAL(5,2),
    "is_active" BOOLEAN,
    "deadline" DATE,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "vacation_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule" (
    "employee_id" VARCHAR(50),
    "department_name" VARCHAR(150),
    "schedule_name" VARCHAR(150),
    "monday_start" VARCHAR(10),
    "monday_end" VARCHAR(10),
    "tuesday_start" VARCHAR(10),
    "tuesday_end" VARCHAR(10),
    "wednesday_start" VARCHAR(10),
    "wednesday_end" VARCHAR(10),
    "thursday_start" VARCHAR(10),
    "thursday_end" VARCHAR(10),
    "friday_start" VARCHAR(10),
    "friday_end" VARCHAR(10),
    "saturday_start" VARCHAR(10),
    "saturday_end" VARCHAR(10),
    "sunday_start" VARCHAR(10),
    "sunday_end" VARCHAR(10),
    "break_duration_minutes" DECIMAL(5,0),
    "tolerance_minutes" DECIMAL(5,0),
    "is_active" BOOLEAN,
    "id" VARCHAR(50) NOT NULL,
    "created_date" TIMESTAMP(6),
    "updated_date" TIMESTAMP(6),
    "created_by_id" INTEGER,
    "created_by" VARCHAR(150),
    "is_sample" BOOLEAN,

    CONSTRAINT "work_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "afp" ADD CONSTRAINT "afp_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance_incident" ADD CONSTRAINT "attendance_incident_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank" ADD CONSTRAINT "bank_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_info" ADD CONSTRAINT "company_info_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_clause" ADD CONSTRAINT "contract_clause_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_renewal_rule" ADD CONSTRAINT "contract_renewal_rule_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contract_template" ADD CONSTRAINT "contract_template_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cost_center" ADD CONSTRAINT "cost_center_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cost_center_assignment" ADD CONSTRAINT "cost_center_assignment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cost_center_change_log" ADD CONSTRAINT "cost_center_change_log_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_change_log" ADD CONSTRAINT "employee_change_log_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_concept" ADD CONSTRAINT "payroll_concept_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payslip_template" ADD CONSTRAINT "payslip_template_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "profession" ADD CONSTRAINT "profession_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rmv" ADD CONSTRAINT "rmv_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "site" ADD CONSTRAINT "site_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ubigeo" ADD CONSTRAINT "ubigeo_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_invitation" ADD CONSTRAINT "user_invitation_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vacation_balance" ADD CONSTRAINT "vacation_balance_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_schedule" ADD CONSTRAINT "work_schedule_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
