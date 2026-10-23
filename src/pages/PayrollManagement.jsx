import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, FileText, Calendar, Users, Download, 
  Eye, CheckCircle, AlertCircle, Plus, Search, Lock, Edit2, Settings
} from "lucide-react";
import { usePermissions } from "../components/hooks/usePermissions";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { todayLima, parseDateLima } from "@/lib/dateUtils";
import { toast } from "sonner";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import AttendancePeriodModal from "../components/payroll/AttendancePeriodModal";
import PayrollConfigModal from "../components/payroll/PayrollConfigModal";
import { createPageUrl } from "../utils";
import { useNavigate } from "react-router-dom";
import { PayrollCalculator } from "../components/payroll/PayrollCalculator";
import PayslipPreview from "../components/payroll/PayslipPreview";
import PayrollHistoryTab from "../components/payroll/PayrollHistoryTab";
import ContractAlertBanner from "../components/payroll/ContractAlertBanner";
import ContractAlertModal from "../components/payroll/ContractAlertModal";
import PayrollPreviewCard from "../components/payroll/PayrollPreviewCard";
import { safePayrollNumber, roundMoney, sanitizePayslip, formatMoney } from "@/lib/payrollUtils";
import { calcEffectiveMetrics } from "@/lib/attendanceMetrics";
import { pickContractForPeriod, describeContract } from "@/lib/contractSelection";
import { applyContractSalaryToBaseConcepts } from "@/lib/baseSalaryConcept";
import {
  computeMarkedLateMinutes,
  resolveDiscountLateMinutes,
  isConfirmedAbsence,
  DEFAULT_LATE_TOLERANCE_MINUTES,
} from "@/lib/attendanceReconciliation";
import { getFamilyAllowanceEligibility } from "@/lib/familyAllowance";
import {
  _normStr,
  sumIncomesByCategory,
  sumOvertimeIncomes,
  getCalculatedBaseSalary,
  findCalculatedCost,
  findCalculatedFamilyAllowance,
} from "@/lib/payrollIncomeHelpers";
import {
  getCostFromSummary,
  dedupeIncomesByCost,
  computeDedupedTotalIncome,
  getAfpBreakdown,
  getOvertimePaySplit,
} from "@/lib/payrollExcelHelpers";
import { applyQuintaRetentionToResult } from "@/lib/quintaCategoriaPayroll";
import { getEarlyDepartureMinutes } from "@/lib/attendanceMetrics";
import {
  buildInstallmentsByEmployee,
  sumLoanDeduction,
  markLoanInstallmentsApplied,
  revertLoanInstallments,
} from "@/lib/loanPayroll";
import {
  generatePayrollSummaryPDF,
  generatePayslipPDF,
  generateMassivePayslipsPDF,
} from "@/lib/payrollPdfExport";
import { exportPayslipsToExcel } from "@/lib/payrollExcelExport";

// Rate limiter global + retry con backoff exponencial para errores de rate-limit
// Garantiza un gap mínimo entre TODAS las llamadas API y reintenta en caso de 429
let _lastApiAt = 0;
const MIN_API_GAP = 400; // ms entre llamadas — máx ~2.5 req/seg

const withRetry = async (fn, retries = 5) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Throttle global: esperar el gap mínimo desde la última llamada API
    const wait = MIN_API_GAP - (Date.now() - _lastApiAt);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    _lastApiAt = Date.now();

    try {
      return await fn();
    } catch (err) {
      // Detección robusta de rate-limit en múltiples formatos de error
      const msg = String(err?.message || err?.response?.data?.message || err?.response?.data?.detail || err || "").toLowerCase();
      const status = err?.response?.status || err?.status || err?.statusCode || err?.code;
      const isRateLimit = msg.includes("rate limit") || msg.includes("429")
        || msg.includes("too many") || msg.includes("throttl") || status === 429 || status === "429";
      if (!isRateLimit || attempt === retries) throw err;
      // Backoff exponencial: 1s, 2s, 4s, 8s, 16s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
};

// Procesa un array con concurrencia limitada para evitar rate-limit de la API
const mapWithConcurrency = async (items, mapper, concurrency = 1) => {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
};

// Semáforo global para limitar llamadas API concurrentes (usado dentro de Promise.all)
const createLimiter = (maxConcurrent = 1) => {
  let active = 0;
  const queue = [];
  const drain = () => { while (active < maxConcurrent && queue.length) { active++; queue.shift()(); } };
  return (fn) => new Promise((resolve, reject) => {
    const run = () => fn()
      .then(r => { resolve(r); active--; drain(); })
      .catch(e => { reject(e); active--; drain(); });
    if (active < maxConcurrent) { active++; run(); }
    else queue.push(run);
  });
};
const apiLimiter = createLimiter(2);

// Helpers de identificación de conceptos (_normStr, sumIncomesByCategory,
// sumOvertimeIncomes, getCalculatedBaseSalary, findCalculatedCost,
// findCalculatedFamilyAllowance) importados desde @/lib/payrollIncomeHelpers.

export default function PayrollManagement() {
  const navigate = useNavigate();
  const { hasPermission, canAccessDepartment, loading: permissionsLoading } = usePermissions();
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [payrollType, setPayrollType] = useState("Mensual");
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [additionalConcepts, setAdditionalConcepts] = useState([]);
  const [showConceptsFor, setShowConceptsFor] = useState(null);
  const [selectedPayslipForClose, setSelectedPayslipForClose] = useState(null);
  const [previewPayslip, setPreviewPayslip] = useState(null);
  const [excludedEmployees, setExcludedEmployees] = useState([]);
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyYearFilter, setHistoryYearFilter] = useState(new Date().getFullYear());
  const [historyMonthFilter, setHistoryMonthFilter] = useState("all");
  const [historyTypeFilter, setHistoryTypeFilter] = useState("all");
  const [selectedPayrollToDelete, setSelectedPayrollToDelete] = useState(null);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'preview' | 'generate'
  const [showPayrollConfig, setShowPayrollConfig] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  // Inconsistencias de contrato detectadas en el cálculo: trabajadores sin contrato
  // aprobado (Vigente) aplicable al período y contratos superpuestos.
  const [contractAlerts, setContractAlerts] = useState({ noApproved: [], conflicts: [] });
  // Boletas calculadas que esperan la confirmación explícita del usuario.
  const [pendingGeneration, setPendingGeneration] = useState(null);
  const [showContractAlert, setShowContractAlert] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);

        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };

    loadUserData();
  }, []);

  const employeesQuery = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      // Incluir Activos y Cesados (los Cesados pueden tener días parciales en el periodo)
      return await withRetry(() => base44.entities.Employee.filter({}));
    },
  });
  const { data: allEmployees = [] } = employeesQuery;

  const payslipsQuery = useQuery({
    queryKey: ["payslips", selectedMonth, selectedYear],
    queryFn: async () => {
      return await withRetry(() => base44.entities.Payslip.filter({
        month: selectedMonth,
        year: selectedYear
      }, "-created_date"));
    },
    staleTime: 0,
    refetchOnMount: true,
  });
  const { data: existingPayslips = [] } = payslipsQuery;

  const { data: allPayslips = [] } = useQuery({
    queryKey: ["allPayslips"],
    queryFn: async () => {
      return await withRetry(() => base44.entities.Payslip.list("-created_date", 5000));
    },
  });

  const attendanceQuery = useQuery({
    queryKey: ["attendanceRecords", selectedMonth, selectedYear],
    queryFn: async () => {
      // Ampliar el rango 15 días antes del inicio del mes para cubrir el ajuste
      // del período de cómputo de asistencias (ej: 26 del mes anterior al 24 del mes actual)
      const startDate = new Date(selectedYear, selectedMonth - 1, -14);
      const endDate = new Date(selectedYear, selectedMonth, 0);
      
      const records = await withRetry(() => base44.entities.AttendanceRecord.list("-date", 2000));
      return records.filter(r => {
        const recordDate = new Date(r.date);
        return recordDate >= startDate && recordDate <= endDate;
      });
    },
  });
  const { data: attendanceRecords = [] } = attendanceQuery;

  const payrollConceptsQuery = useQuery({
    queryKey: ["payrollConcepts", selectedMonth, selectedYear],
    queryFn: async () => {
      const allConcepts = await withRetry(() => base44.entities.PayrollConcept.list());
      
      // Filtrar conceptos: recurrentes, del mes/año actual, sin mes/año específico, o generales
      return allConcepts.filter(c => {
        // Conceptos recurrentes (incluyendo los generales): SIEMPRE incluir, nunca filtrar por is_applied
        if (c.is_recurring) return true;
        
        // Conceptos generales no recurrentes: incluir siempre (aplican a todos)
        if (c.employee_id === "general") return true;

        // Para conceptos específicos no recurrentes: excluir si ya fueron aplicados
        if (c.is_applied) return false;
        
        // Conceptos con mes/año específico: solo si coincide
        if (c.month && c.year) {
          return c.month === selectedMonth && c.year === selectedYear;
        }
        
        // Conceptos sin mes/año específico: incluir
        return true;
      });
    },
  });
  const { data: payrollConcepts = [] } = payrollConceptsQuery;

  const rmvQuery = useQuery({
    queryKey: ["rmv"],
    queryFn: async () => {
      const rmvs = await withRetry(() => base44.entities.RMV.filter({ is_active: true }, "-effective_date"));
      return rmvs.length > 0 ? rmvs[0] : { amount: 1130 };
    },
  });
  const { data: rmvData } = rmvQuery;

  const afpsQuery = useQuery({
    queryKey: ["allAfps"],
    queryFn: async () => {
      return await withRetry(() => base44.entities.AFP.filter({ is_active: true }));
    },
    staleTime: 300000,
  });
  const { data: allAfps = [] } = afpsQuery;

  const { data: companyInfo } = useQuery({
    queryKey: ["companyInfo"],
    queryFn: async () => {
      const companies = await withRetry(() => base44.entities.CompanyInfo.filter({ is_active: true }));
      return companies.length > 0 ? companies[0] : null;
    },
  });

  const payrollConfigQuery = useQuery({
    queryKey: ["payrollConfig"],
    queryFn: async () => {
      const configs = await withRetry(() => base44.entities.PayrollConfig.filter({ config_type: "Quincenal", is_active: true }));
      return configs.length > 0 ? configs[0] : { quincenal_percentage: 40, quincenal_cutoff_day: 7 };
    },
    staleTime: 0, // Siempre refetch al invalidar para reflejar cambios de configuración inmediatamente
  });
  const { data: payrollConfig } = payrollConfigQuery;

  // Configuración general (incluye flag de compensación de tardanzas)
  const generalConfigQuery = useQuery({
    queryKey: ["generalPayrollConfig"],
    queryFn: async () => {
      const configs = await withRetry(() => base44.entities.PayrollConfig.filter({ config_type: "General", is_active: true }));
      return configs.length > 0 ? configs[0] : {};
    },
    staleTime: 0,
  });
  const enableTardinessCompensation = generalConfigQuery.data?.enable_tardiness_compensation || false;

  // Vacaciones aprobadas: se consultan con datos frescos al calcular la planilla
  // para excluir del descuento por tardanzas/inasistencias los días cubiertos por
  // vacaciones aprobadas (incluso si el AttendanceRecord tiene valores residuales).
  const vacationsQuery = useQuery({
    queryKey: ["approvedVacations"],
    queryFn: async () => {
      const all = await withRetry(() => base44.entities.VacationRequest.list("-created_date", 2000));
      return all.filter(v => v.status === "Aprobada" || v.status === "Aprobado");
    },
    staleTime: 0,
  });
  const { data: approvedVacations = [] } = vacationsQuery;

  // Horas extras manuales registradas desde el panel de asistencia
  const manualOvertimeQuery = useQuery({
    queryKey: ["manualOvertime", selectedMonth, selectedYear, payrollType],
    queryFn: async () => {
      return await withRetry(() => base44.entities.HorasExtrasManual.filter({
        status: "Activo",
        month: selectedMonth,
        year: selectedYear,
        payroll_type: payrollType,
      }, "-created_date"));
    },
    staleTime: 0,
  });
  const { data: manualOvertimeRecords = [] } = manualOvertimeQuery;

  // Horarios de trabajo: tolerancia y refrigerio aplicables al cálculo de tardanzas.
  // Asistencia y planilla deben usar la misma tolerancia para dar el mismo resultado.
  const workSchedulesQuery = useQuery({
    queryKey: ["allWorkSchedules"],
    queryFn: async () => {
      const res = await withRetry(() => base44.entities.WorkSchedule.list("schedule_name", 1000));
      return Array.isArray(res) ? res : (res?.items || []);
    },
    staleTime: 0,
  });
  const workSchedules = workSchedulesQuery.data || [];

  // Compensaciones de tardanza aprobadas: se descuentan UNA sola vez del descuento
  // de planilla (mismo resultado que asistencia). Consulta no bloqueante.
  const compensationIncidentsQuery = useQuery({
    queryKey: ["payrollCompensationIncidents", selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await withRetry(() => base44.entities.AttendanceIncident.filter(
        { incident_type: "Compensación de Tardanza" },
        "-incident_date",
        2000
      ));
      return Array.isArray(res) ? res : (res?.items || []);
    },
    staleTime: 0,
  });
  const compensationIncidents = compensationIncidentsQuery.data || [];

  // Cuotas de préstamo pendientes del período: se descuentan automáticamente en
  // la planilla mensual (una cuota por mes y por préstamo activo).
  const loanInstallmentsQuery = useQuery({
    queryKey: ["loanInstallments", selectedMonth, selectedYear],
    queryFn: async () => {
      return await withRetry(() => base44.entities.LoanInstallment.filter({
        month: selectedMonth,
        year: selectedYear,
        status: "Pendiente",
      }));
    },
    staleTime: 0,
  });
  const { data: loanInstallments = [] } = loanInstallmentsQuery;

  // Préstamos activos: únicamente sus cuotas se descuentan.
  const activeLoansQuery = useQuery({
    queryKey: ["activeLoans"],
    queryFn: async () => {
      const loans = await withRetry(() => base44.entities.Loan.filter({ status: "Activo" }));
      // Excluir préstamos eliminados lógicamente: sus cuotas no se descuentan.
      return loans.filter(l => !l.is_deleted);
    },
    staleTime: 0,
  });
  const { data: activeLoans = [] } = activeLoansQuery;

  // Retenciones de Quinta Categoría aprobadas/aplicadas del ejercicio.
  // Se consultan con datos frescos al calcular la planilla para incorporar el
  // importe vigente como descuento (income_tax) en la boleta del empleado.
  const quintaCategoriaQuery = useQuery({
    queryKey: ["quintaCategoriaCalculos", selectedYear],
    queryFn: async () => {
      return await withRetry(() => base44.entities.QuintaCategoriaCalculo.filter({
        year: selectedYear,
        status: { $in: ["Aprobada", "Aplicada"] },
      }));
    },
    staleTime: 0,
  });
  const { data: quintaCategoriaCalculos = [] } = quintaCategoriaQuery;

  // Bandera combinada de carga/errores de los datos críticos para el cálculo de planilla.
  // Diferencia una consulta pendiente (payrollDataLoading=true) de un resultado válido vacío.
  const payrollDataLoading =
    employeesQuery.isPending ||
    payslipsQuery.isPending ||
    attendanceQuery.isPending ||
    payrollConceptsQuery.isPending ||
    rmvQuery.isPending ||
    afpsQuery.isPending ||
    payrollConfigQuery.isPending ||
    vacationsQuery.isPending ||
    quintaCategoriaQuery.isPending ||
    loanInstallmentsQuery.isPending ||
    activeLoansQuery.isPending;

  const payrollDataError =
    employeesQuery.isError ||
    payslipsQuery.isError ||
    attendanceQuery.isError ||
    payrollConceptsQuery.isError ||
    rmvQuery.isError ||
    afpsQuery.isError ||
    payrollConfigQuery.isError ||
    vacationsQuery.isError;

  const createPayslipsMutation = useMutation({
    mutationFn: async (payslips) => {
      // Reemplazar boletas existentes del mismo período/tipo para estos empleados.
      // Así la regeneración sobrescribe valores obsoletos (p.ej. días laborados
      // calculados con una versión anterior de la lógica) en lugar de crear
      // duplicados que dejarían la boleta antigua visible.
      if (payslips.length > 0) {
        const { month, year, payroll_type: payrollType } = payslips[0];
        const employeeIds = [...new Set(payslips.map(p => p.employee_id))];
        const existing = await base44.entities.Payslip.filter({ month, year, payroll_type: payrollType });
        const stale = existing.filter(p => employeeIds.includes(p.employee_id));
        if (stale.length > 0) {
          // Devolver a "Pendiente" las cuotas de préstamo descontadas en las boletas
          // que se reemplazan, para que vuelvan a descontarse en las nuevas.
          await revertLoanInstallments(stale.map(p => p.id));
          await mapWithConcurrency(stale, p => base44.entities.Payslip.delete(p.id));
        }
      }

      const createdPayslips = await base44.entities.Payslip.bulkCreate(payslips);
      
      // Marcar conceptos como aplicados
      const conceptsToUpdate = additionalConcepts.map(c => ({
        ...c,
        is_applied: true,
        payslip_id: createdPayslips.find(p => p.employee_id === c.employee_id)?.id
      }));
      
      if (conceptsToUpdate.length > 0) {
        await mapWithConcurrency(conceptsToUpdate, c => base44.entities.PayrollConcept.create(c));
      }
      
      // Marcar como "Aplicado" las cuotas de préstamo descontadas en cada boleta
      // (una cuota por mes y por préstamo activo) y asociarlas a la boleta.
      await markLoanInstallmentsApplied(
        payslips.map(p => ({
          ...p,
          id: createdPayslips.find(c => c.employee_id === p.employee_id)?.id,
        }))
      );

      return createdPayslips;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["payrollConcepts"]);
      queryClient.invalidateQueries(["loanInstallments"]);
      queryClient.invalidateQueries(["activeLoans"]);
      queryClient.invalidateQueries({ queryKey: ["allEmployees"] });
      toast.success("Planilla generada exitosamente");
      setShowPreview(false);
      setPreviewData([]);
      setAdditionalConcepts([]);
    },
    onError: (error) => {
      toast.error("Error al generar la planilla");
      console.error(error);
    },
  });

  const updatePayslipStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      return await base44.entities.Payslip.update(id, { status });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["allPayslips"]);
      toast.success(`Planilla ${status === "Aprobada" ? "aprobada" : "marcada como pagada"}`);
      setSelectedPayslipForClose(null);
    },
    onError: () => {
      toast.error("Error al actualizar el estado");
    },
  });

  // Aprobar planilla completa (todas las boletas de un tipo/periodo)
  const approveFullPayrollMutation = useMutation({
    mutationFn: async ({ year, month, payrollType }) => {
      const fresh = await base44.entities.Payslip.filter({ month, year, payroll_type: payrollType });
      const toApprove = fresh.filter(p => p.status !== "Aprobada" && p.status !== "Pagada");
      await mapWithConcurrency(toApprove, p => base44.entities.Payslip.update(p.id, { status: "Aprobada" }));
      return toApprove.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["payslips"] });
      queryClient.invalidateQueries({ queryKey: ["allPayslips"] });
      toast.success(`✓ Planilla aprobada — ${count} boleta(s) actualizadas`);
    },
    onError: () => toast.error("Error al aprobar la planilla"),
  });

  // Aprobar y marcar como pagada planilla completa
  const payFullPayrollMutation = useMutation({
    mutationFn: async ({ year, month, payrollType }) => {
      const fresh = await base44.entities.Payslip.filter({ month, year, payroll_type: payrollType });
      const toPay = fresh.filter(p => p.status === "Aprobada");
      await mapWithConcurrency(toPay, p => base44.entities.Payslip.update(p.id, { status: "Pagada" }));
      return toPay.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["payslips"] });
      queryClient.invalidateQueries({ queryKey: ["allPayslips"] });
      toast.success(`✓ Planilla marcada como pagada — ${count} boleta(s)`);
    },
    onError: () => toast.error("Error al marcar como pagada"),
  });

  // Eliminar un trabajador individual de una planilla ya generada
  const removeOnePayslipMutation = useMutation({
    mutationFn: async (payslipId) => {
      // Devolver a "Pendiente" las cuotas de préstamo descontadas en esa boleta
      await revertLoanInstallments([payslipId]);
      await base44.entities.Payslip.delete(payslipId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["allPayslips"]);
      queryClient.invalidateQueries(["loanInstallments"]);
      queryClient.invalidateQueries(["activeLoans"]);
      toast.success("Trabajador eliminado de la planilla");
    },
    onError: () => toast.error("Error al eliminar el trabajador"),
  });

  const deletePayslipMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.Payslip.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["allPayslips"]);
      toast.success("Planilla eliminada exitosamente");
    },
    onError: () => {
      toast.error("Error al eliminar la planilla");
    },
  });

  const getDefaultPeriod = () => {
    const firstDay = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const lastDayStr = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`;
    return { dateFrom: firstDay, dateTo: lastDayStr };
  };

  const handleOpenPeriodModal = (action) => {
    // Resetear vista previa para forzar recálculo con datos frescos
    setShowPreview(false);
    setPreviewData([]);
    setPendingAction(action);
    setShowPeriodModal(true);
  };

  const handlePeriodConfirm = async ({ dateFrom, dateTo }) => {
    setShowPeriodModal(false);
    if (pendingAction === 'preview') {
      await calculatePayroll(dateFrom, dateTo);
    } else if (pendingAction === 'generate') {
      await calculatePayroll(dateFrom, dateTo, true);
    }
    setPendingAction(null);
  };

  const calculatePayroll = async (periodFrom, periodTo, autoGenerate = false) => {
    // Evitar reentrada: si ya hay un cálculo en curso, ignorar
    if (isCalculating) return;

    setIsCalculating(true);
    try {
      // ── Forzar datos frescos con React Query para evitar valores capturados por renders anteriores ──
      // Garantiza que la primera vista previa produzca los mismos montos que las siguientes,
      // incluso tras recargar o limpiar la caché.
      const criticalKeys = [
        ["allEmployees"],
        ["attendanceRecords", selectedMonth, selectedYear],
        ["payrollConcepts", selectedMonth, selectedYear],
        ["rmv"],
        ["allAfps"],
        ["payrollConfig"],
        ["payslips", selectedMonth, selectedYear],
        ["approvedVacations"],
        ["manualOvertime", selectedMonth, selectedYear, payrollType],
        ["quintaCategoriaCalculos", selectedYear],
        ["loanInstallments", selectedMonth, selectedYear],
        ["activeLoans"],
      ];
      await Promise.all(criticalKeys.map(key => queryClient.refetchQueries({ queryKey: key, exact: true })));

      // Si alguna consulta crítica falló, cancelar el proceso sin crear boletas.
      // La consulta de Quinta Categoría es no bloqueante: si falla, no se aplica retención.
      const failedKey = criticalKeys.find(key => key[0] !== "quintaCategoriaCalculos" && queryClient.getQueryState(key)?.status === "error");
      if (failedKey) {
        toast.error("Error al cargar datos de planilla. Reintente en unos segundos.");
        return;
      }

      // Leer datos frescos desde la caché y sombrear las variables del closure
      const allEmployees = queryClient.getQueryData(["allEmployees"]) ?? [];
      const attendanceRecords = queryClient.getQueryData(["attendanceRecords", selectedMonth, selectedYear]) ?? [];
      const payrollConcepts = queryClient.getQueryData(["payrollConcepts", selectedMonth, selectedYear]) ?? [];
      const rmvData = queryClient.getQueryData(["rmv"]) ?? { amount: 1130 };
      const allAfps = queryClient.getQueryData(["allAfps"]) ?? [];
      const payrollConfig = queryClient.getQueryData(["payrollConfig"]) ?? { quincenal_percentage: 40, quincenal_cutoff_day: 7 };
      const existingPayslips = queryClient.getQueryData(["payslips", selectedMonth, selectedYear]) ?? [];
      const approvedVacations = queryClient.getQueryData(["approvedVacations"]) ?? [];
      const manualOvertimeRecords = queryClient.getQueryData(["manualOvertime", selectedMonth, selectedYear, payrollType]) ?? [];
      const quintaCategoriaCalculos = queryClient.getQueryData(["quintaCategoriaCalculos", selectedYear]) ?? [];
      const loanInstallments = queryClient.getQueryData(["loanInstallments", selectedMonth, selectedYear]) ?? [];
      const activeLoansData = queryClient.getQueryData(["activeLoans"]) ?? [];
      // Cuotas del período agrupadas por empleado (solo de préstamos activos)
      const loanInstallmentsByEmployee = buildInstallmentsByEmployee(loanInstallments, activeLoansData);

      const payrollNumber = `${payrollType === "Quincenal" ? "Q" : payrollType === "Mensual" ? "M" : payrollType === "SNP" ? "SNP" : "A"}-${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
    
    const periodStart = new Date(selectedYear, selectedMonth - 1, 1);
    const periodEnd = new Date(selectedYear, selectedMonth, 0); // último día del mes

      // Datos actualizados antes de calcular: se relee el maestro de empleados para no
      // trabajar con una copia en caché desactualizada tras crear, editar, renovar o
      // cambiar el estado de un contrato. Si la lectura fresca no devuelve datos, se
      // conserva la copia local para no dejar la planilla sin empleados.
      let employeesForCalc = allEmployees;
      try {
        const freshEmployees = await base44.entities.Employee.filter({});
        if (freshEmployees && freshEmployees.length > 0) {
          employeesForCalc = freshEmployees;
        }
      } catch (error) {
        // Si falla la lectura fresca se usa la copia local; el cálculo continúa.
        employeesForCalc = allEmployees;
      }

      // Filtrar empleados según búsqueda y departamento (usando datos frescos locales)
      let filteredEmployees = canViewAllDepartments
        ? employeesForCalc
        : employeesForCalc.filter(emp => canAccessDepartment(emp.department_name));
    
    // Validación general de superposición del vínculo laboral con el período:
    //   - Excluir Suspendidos (comportamiento existente).
    //   - Incluir solo si hire_date <= periodEnd (si hire_date existe; si está vacío, se incluye).
    //   - Si termination_date existe, incluir solo si termination_date >= periodStart.
    //   - Cesado sin termination_date: excluir (no se puede verificar superposición).
    // Compara fechas normalizadas YYYY-MM-DD (lexicográfico) para evitar desfases de timezone.
    const periodStartStr = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-01`;
    const lastDayNum = new Date(selectedYear, selectedMonth, 0).getDate();
    const periodEndStr = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${String(lastDayNum).padStart(2,'0')}`;

    filteredEmployees = filteredEmployees.filter(emp => {
      if (emp.status === "Suspendido") return false;
      if (emp.status === "Cesado" && !emp.termination_date) return false;
      if (emp.hire_date) {
        const hireDateStr = emp.hire_date.split("T")[0];
        if (hireDateStr > periodEndStr) return false;
      }
      if (emp.termination_date) {
        const termDateStr = emp.termination_date.split("T")[0];
        if (termDateStr < periodStartStr) return false;
      }
      return true;
    });

    // Filtrar por tipo de contrato según el tipo de planilla:
    // - SNP: solo trabajadores con contrato SNP
    // - Quincenal / Mensual / Adicional: excluir trabajadores SNP
    if (payrollType === "SNP") {
      filteredEmployees = filteredEmployees.filter(emp => emp.contract_type === "SNP");
    } else {
      filteredEmployees = filteredEmployees.filter(emp => emp.contract_type !== "SNP");
    }

    // Regla quincenal: solo trabajadores que ingresaron hasta el día de corte configurado
    if (payrollType === "Quincenal") {
      const cutoffDay = payrollConfig?.quincenal_cutoff_day ?? 7;
      filteredEmployees = filteredEmployees.filter(emp => {
        if (!emp.hire_date) return true; // Sin fecha de ingreso: se incluye
        // Parsear fecha como local (YYYY-MM-DD) para evitar desfases de timezone
        const [hireYear, hireMonth, hireDay] = emp.hire_date.split("T")[0].split("-").map(Number);
        // Si ingresó en un año anterior, siempre se incluye
        if (hireYear < selectedYear) return true;
        // Si ingresó en el mismo año pero en un mes anterior, se incluye
        if (hireYear === selectedYear && hireMonth < selectedMonth) return true;
        // Si ingresó exactamente en el mes en proceso, solo si fue hasta el día de corte
        if (hireYear === selectedYear && hireMonth === selectedMonth) {
          return hireDay <= cutoffDay;
        }
        return false; // Ingresó en un mes futuro: no se incluye
      });
    }
    
    if (searchTerm) {
      filteredEmployees = filteredEmployees.filter(emp => 
        emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.document_number.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (departmentFilter !== "all") {
      filteredEmployees = filteredEmployees.filter(emp => emp.department_name === departmentFilter);
    }

    // Excluir empleados que el usuario haya quitado
    filteredEmployees = filteredEmployees.filter(emp => !excludedEmployees.includes(emp.id));

    // Batch fetch: TODOS los contratos (historial completo) para consultar sueldo vigente exacto.
    // Se usa filter con límite alto para evitar pérdida por paginación.
    const allContracts = filteredEmployees.length > 0
      ? await withRetry(() => base44.entities.Contract.filter({}, '-start_date', 500))
      : [];

    // Inconsistencias detectadas durante el cálculo, para informarlas al usuario
    // sin modificar nada de forma automática.
    const contractConflicts = [];
    const noApprovedContractWorkers = [];
    const absenceReviewWarnings = [];

    // Helper: contrato APROBADO (estado "Vigente") que corresponde al período.
    //   1. Contrato aprobado que solapa el período (inicio ≤ fin mes, fin ≥ inicio mes o nulo)
    //   2. Si ninguno solapa, el último contrato aprobado ya iniciado al cierre del período
    // Si no existe contrato aprobado aplicable, se registra para pedir confirmación
    // explícita antes de generar las boletas (nada se modifica de forma automática).
    const getContractForPeriod = (employeeId, employeeCode, employeeName) => {
      const empContracts = allContracts.filter(c => c.employee_id === employeeId);
      const { contract, overlaps, hasConflict, missingApprovedContract } = pickContractForPeriod(
        empContracts,
        periodStartStr,
        periodEndStr
      );
      // Contratos superpuestos: se muestra la inconsistencia en lugar de resolverla
      // de forma arbitraria (puede haber varios registros con estado "Vigente",
      // incluso con fecha de fin ya pasada).
      if (hasConflict) {
        contractConflicts.push({
          employee_id: employeeId,
          detail: `${employeeCode || employeeId} ${employeeName || ""}: ${describeContract(contract)} · superpuesto con ${overlaps.map(describeContract).join(" / ")}`.trim(),
        });
      }
      if (missingApprovedContract) {
        noApprovedContractWorkers.push({
          employee_id: employeeId,
          employee_code: employeeCode || "s/c",
          employee_name: employeeName || "",
          detail: contract
            ? `Último contrato registrado sin estado Vigente: ${describeContract(contract)}`
            : "Sin contrato registrado para el trabajador",
        });
      }
      return contract;
    };

    // Enriquecer SIEMPRE con el sueldo del contrato vigente del período.
    // El base_salary del empleado solo se usa como último recurso si no existe
    // ningún contrato con salario registrado.
    const enrichedEmployees = await mapWithConcurrency(filteredEmployees, async (emp) => {
      const periodContract = getContractForPeriod(
        emp.id,
        emp.employee_code,
        `${emp.first_name} ${emp.last_name}`
      );

      if (periodContract && periodContract.salary != null && parseFloat(periodContract.salary) > 0) {
        const contractSalary = parseFloat(periodContract.salary);
        const currentSalary = parseFloat(emp.base_salary) || 0;
        return {
          ...emp,
          base_salary: contractSalary,
          activity_cost: periodContract.activity_cost ?? emp.activity_cost ?? 0,
          food_cost: periodContract.food_cost ?? emp.food_cost ?? 0,
          transport_cost: periodContract.transport_cost ?? emp.transport_cost ?? 0,
          _salary_from_contract: true,
          _salary_changed: contractSalary !== currentSalary,
          _contract_number: periodContract.contract_number || "",
        };
      }

      // Sin contrato con salario válido: último recurso es el base_salary del empleado
      return emp;
    });

    // Batch fetch: una sola llamada para todos los derechohabientes (en lugar de N por empleado)
    const allDerechohabientesRaw = enrichedEmployees.length > 0
      ? await withRetry(() => base44.entities.Derechohabiente.list())
      : [];
    const derechohabientesMap = {};
    enrichedEmployees.forEach(emp => {
      derechohabientesMap[emp.id] = allDerechohabientesRaw.filter(d => d.employee_id === emp.id);
    });

    // Re-verificar empleados aún sin salario (ni en Employee ni en contrato)
    const stillWithoutSalary = enrichedEmployees.filter(emp => !emp.base_salary || parseFloat(emp.base_salary) <= 0);
    if (stillWithoutSalary.length > 0) {
      const names = stillWithoutSalary.map(e => `${e.employee_code} - ${e.first_name} ${e.last_name}`).join(", ");
      toast.warning(`⚠️ ${stillWithoutSalary.length} empleado(s) sin salario ni contrato vigente: ${names}`, { duration: 8000 });
    }

    // Batch fetch: todas las boletas quincenales del mes en una sola llamada (para descuento de adelanto)
    let batchQuincenalPayslips = [];
    if (payrollType === "Mensual") {
      batchQuincenalPayslips = await withRetry(() => base44.entities.Payslip.filter({
        payroll_type: "Quincenal",
        month: selectedMonth,
        year: selectedYear,
      }));
    }

    const payslipsData = await mapWithConcurrency(enrichedEmployees, async (emp) => {
      // Preparar datos de asistencia
      const empAttendance = attendanceRecords.filter(r => {
        if (r.employee_id !== emp.id) return false;
        if (periodFrom && r.date < periodFrom) return false;
        if (periodTo && r.date > periodTo) return false;
        return true;
      });
      // ── DÍAS LABORADOS (convención Perú: el mes se computa como 30 días) ──
      // El periodo de asistencia seleccionado (periodFrom/periodTo) SOLO se usa para
      // descontar faltas y tardanzas, NO para el cómputo de días laborados.
      // - Mes completo (activo del 1 al último día calendario): 30 días (siempre,
      //   sin importar si el mes tiene 28, 30 o 31 días calendario).
      // - Ingreso en el mes el día D (>1): del D al 30 → (30 - D + 1).
      // - Cese en el mes el día D (< último día calendario): del 1 al D → min(D, 30).
      // - Ingreso y cese en el mismo mes: del día de ingreso al día de cese.
      const lastCalendarDay = periodEnd.getDate(); // último día calendario del mes
      let hireInMonth = null;
      if (emp.hire_date) {
        const [hY, hM, hD] = emp.hire_date.split("T")[0].split("-").map(Number);
        if (hY === selectedYear && hM === selectedMonth && hD > 1) hireInMonth = hD;
      }
      let termInMonth = null;
      if (emp.status === "Cesado" && emp.termination_date) {
        const [tY, tM, tD] = emp.termination_date.split("T")[0].split("-").map(Number);
        if (tY === selectedYear && tM === selectedMonth && tD < lastCalendarDay) termInMonth = tD;
      }

      let workedDays;
      if (payrollType === "Quincenal") {
        // Adelanto quincenal: tope 15, prorrateado por cese (comportamiento existente).
        let quincenalMax = lastCalendarDay;
        if (emp.status === "Cesado" && emp.termination_date) {
          const termDate = new Date(emp.termination_date.split("T")[0]);
          if (termDate >= periodStart && termDate <= periodEnd) {
            quincenalMax = termDate.getDate();
          }
        }
        workedDays = Math.min(15, quincenalMax);
      } else if (hireInMonth !== null && termInMonth !== null) {
        workedDays = Math.min(30, termInMonth) - hireInMonth + 1;
      } else if (hireInMonth !== null) {
        workedDays = 30 - hireInMonth + 1;
      } else if (termInMonth !== null) {
        workedDays = Math.min(termInMonth, 30);
      } else {
        workedDays = 30; // mes completo → siempre 30
      }
      if (workedDays < 0) workedDays = 0;
      // Permiso sin goce (día completo): restar de días trabajados. El descuento
      // viene del prorrateo de la remuneración base al reducir worked_days.
      // Los permisos por horas no restan días (su descuento es un PayrollConcept).
      const sinGoceFullDays = payrollType === "Quincenal"
        ? 0
        : empAttendance.filter(r => r.status === "Permiso sin goce" && (r.notes || "").includes("día completo")).length;
      workedDays = Math.max(0, workedDays - sinGoceFullDays);
      // Días subsidiados: justificaciones aprobadas que cubren el día completo (descanso médico, etc.)
      const subsidizedDays = payrollType === "Quincenal"
        ? 0
        : empAttendance.filter(r => r.status === "Justificado").length;
      
      // Horas extras y nocturnas calculadas desde los registros de asistencia del periodo.
      // horas_nocturnas: los registros de asistencia aún no cuentan con un campo dedicado,
      // por lo que se conserva en 0 hasta que exista una fuente de datos válida para calcularlas.
      // DESTINO POR JORNADA: solo se suman las HE con destino "pago" y autorizadas
      // (overtime_authorized=true). Las HE con destino "compensacion" se excluyen del
      // pago y de las bases de cálculo, conservando su saldo para compensar tardanzas.
      // Seleccionar "pago" NO autoriza automáticamente las horas.
      const otPayableRecords = empAttendance.filter(record =>
        (record.overtime_destination || "pago") === "pago" && record.overtime_authorized === true
      );
      // Horas extras efectivas: si un registro tiene compensación de tardanza activa,
      // los minutos compensados se descuentan de las HE (primero 25%, luego 35%)
      // para evitar doble contabilización.
      const overtimeHours25Auto = otPayableRecords.reduce((sum, record) => {
        const ot25 = Number(record.overtime_hours_25 || 0);
        if (!enableTardinessCompensation || record.tardiness_compensation_status !== "Activa") return sum + ot25;
        const compHours = (record.tardiness_compensation_minutes || 0) / 60;
        return sum + Math.max(0, ot25 - Math.min(ot25, compHours));
      }, 0);
      const overtimeHours35Auto = otPayableRecords.reduce((sum, record) => {
        const ot25 = Number(record.overtime_hours_25 || 0);
        const ot35 = Number(record.overtime_hours_35 || 0);
        if (!enableTardinessCompensation || record.tardiness_compensation_status !== "Activa") return sum + ot35;
        const compHours = (record.tardiness_compensation_minutes || 0) / 60;
        const deduct25 = Math.min(ot25, compHours);
        const remainingComp = compHours - deduct25;
        return sum + Math.max(0, ot35 - Math.min(ot35, remainingComp));
      }, 0);
      // Horas extras manuales (registradas desde el panel de asistencia)
      // Solo se suman las con destino "pago". Las manuales con destino "compensacion"
      // se excluyen del pago. Se suman al cálculo automático una sola vez.
      const empManualOT = (manualOvertimeRecords || []).filter(r =>
        r.employee_id === emp.id && (r.overtime_destination || "pago") === "pago"
      );
      const manualOT25 = empManualOT.reduce((sum, r) =>
        sum + (r.overtime_hours_25 || 0) + (r.overtime_minutes_25 || 0) / 60, 0);
      const manualOT35 = empManualOT.reduce((sum, r) =>
        sum + (r.overtime_hours_35 || 0) + (r.overtime_minutes_35 || 0) / 60, 0);
      const overtimeHours25 = roundMoney(overtimeHours25Auto + manualOT25);
      const overtimeHours35 = roundMoney(overtimeHours35Auto + manualOT35);
      const nightHours = empAttendance.reduce(
        (sum, record) => sum + Number(record.horas_nocturnas ?? record.night_hours ?? 0), 0
      );
      const attendanceData = {
        worked_days: workedDays,
        regular_hours: empAttendance.reduce((sum, r) => sum + (r.worked_hours || 0), 0),
        overtime_hours: overtimeHours25 + overtimeHours35,
        horas_extras_25: overtimeHours25,
        horas_extras_35: overtimeHours35,
        horas_nocturnas: nightHours,
      };

      // Conceptos fijos del empleado (actividad, alimento, movilidad)
      const employeeFixedConcepts = [];
      if (emp.activity_cost > 0) {
        employeeFixedConcepts.push({ employee_id: emp.id, concept_type: "Ingreso", concept_category: "Bonificaciones", concept_name: "Costo Actividad", amount: emp.activity_cost, is_dynamic: false, applies_to_payroll_types: ["Quincenal", "Mensual", "Adicional", "SNP"] });
      }
      if (emp.food_cost > 0) {
        employeeFixedConcepts.push({ employee_id: emp.id, concept_type: "Ingreso", concept_category: "Bonificaciones", concept_name: "Costo Alimento", amount: emp.food_cost, is_dynamic: false, applies_to_payroll_types: ["Quincenal", "Mensual", "Adicional", "SNP"] });
      }
      if (emp.transport_cost > 0) {
        employeeFixedConcepts.push({ employee_id: emp.id, concept_type: "Ingreso", concept_category: "Asignaciones", concept_name: "Costo Movilidad", amount: emp.transport_cost, is_dynamic: false, applies_to_payroll_types: ["Quincenal", "Mensual", "Adicional", "SNP"] });
      }

      // Obtener conceptos del empleado (generales + específicos + fijos del empleado)
      const generalConcepts = payrollConcepts.filter(c => c.employee_id === "general");
      const specificConcepts = [...payrollConcepts, ...additionalConcepts].filter(c => c.employee_id === emp.id);
      // Fuente única de configuración: los conceptos de planilla configurados (PayrollConcept).
      // Los campos del contrato (activity_cost, food_cost, transport_cost) son DATOS que los
      // conceptos configurados pueden referenciar vía fórmula. Para evitar duplicidad, los
      // conceptos fijos autogenerados desde el contrato SOLO se incluyen si NO existe un
      // concepto configurado que cubra el mismo costo (por variable de fórmula o por nombre).
      const configuredConcepts = [...generalConcepts, ...specificConcepts];
      const coversCost = (costVariable, nameRegex) =>
        configuredConcepts.some(c => {
          const formula = String(c.calculation_formula || "").toLowerCase();
          const name = (c.concept_name || "").toLowerCase().trim();
          return formula.includes(costVariable) || nameRegex.test(name);
        });
      const costCoverage = {
        activity_cost: coversCost("activity_cost", /actividad/i),
        food_cost: coversCost("food_cost", /alimentaci[oó]n|alimento/i),
        transport_cost: coversCost("transport_cost", /movilidad|transporte/i),
      };
      const fixedConceptsForMonth = employeeFixedConcepts.filter(c => {
        if (c.concept_name === "Costo Actividad") return !costCoverage.activity_cost;
        if (c.concept_name === "Costo Alimento") return !costCoverage.food_cost;
        if (c.concept_name === "Costo Movilidad") return !costCoverage.transport_cost;
        return true;
      });
      const allEmpConcepts = [...generalConcepts, ...specificConcepts, ...fixedConceptsForMonth];

      // Porcentaje quincenal desde la configuración (decimal, ej: 0.40)
      const quincenalPct = (payrollConfig?.quincenal_percentage ?? 40) / 100;

      const calculator = new PayrollCalculator(emp, selectedMonth, selectedYear, payrollType, quincenalPct);

      // Calcular asignación familiar automática basada en derechohabientes
      const empDerechohabientes = derechohabientesMap[emp.id] || [];
      const familyAllowanceInfo = getFamilyAllowanceEligibility(empDerechohabientes, rmvData?.amount || 1130);

      let conceptsForCalc;
      if (payrollType === "Quincenal") {
        // Para planilla quincenal: si el empleado tiene monto_quincena fijo, usarlo;
        // si no, calcular como base_salary * porcentaje configurado.
        const hasFixedQuincenal = emp.quincenal_amount != null && parseFloat(emp.quincenal_amount) > 0;
        const adelantoAmount = hasFixedQuincenal
          ? Math.round(parseFloat(emp.quincenal_amount) * 100) / 100
          : Math.round((emp.base_salary || 0) * quincenalPct * 100) / 100;
        conceptsForCalc = [
          {
            employee_id: emp.id,
            concept_type: "Ingreso",
            concept_category: "Remuneración Base",
            concept_name: "Adelanto Quincenal",
            is_dynamic: false,
            amount: adelantoAmount,
            is_recurring: true,
            applies_to_payroll_types: ["Quincenal"],
          },
          // La planilla quincenal es únicamente el adelanto de sueldo.
          // Costo Actividad, Costo Alimento y Costo Movilidad se pagan en la
          // planilla mensual, no en la quincenal.
        ];
      } else {
        // Para planillas no quincenales: usar todos los conceptos normales
        // Excluir conceptos que PayrollManagement calcula por separado (tardanzas, inasistencias, adelanto)
        // para evitar doble descuento en el neto a pagar.
        const separatelyHandled = ['tardiness_discount', 'absence_discount', 'early_departure_discount', 'salary_advance'];
        conceptsForCalc = allEmpConcepts.filter(c => {
          const formulaKey = c.calculation_formula ? String(c.calculation_formula).trim().toLowerCase() : '';
          const logicType = c.system_logic_type || formulaKey;
          return !separatelyHandled.includes(logicType);
        });
        // Si NO existe un concepto de "Asignación Familiar" configurado (ya sea por fórmula o lógica del sistema),
        // agregar la asignación familiar automática basada en derechohabientes como fallback.
        const hasFamilyAllowanceConcept = allEmpConcepts.some(c => 
          c.concept_name === "Asignación Familiar" || c.system_logic_type === "family_allowance"
        );
        if (!hasFamilyAllowanceConcept && familyAllowanceInfo.qualifies) {
          conceptsForCalc.push({
            employee_id: emp.id,
            concept_type: "Ingreso",
            concept_category: "Asignaciones",
            concept_name: "Asignación Familiar",
            is_dynamic: false,
            amount: familyAllowanceInfo.amount,
            is_recurring: true,
            applies_to_payroll_types: ["Mensual", "Adicional", "SNP"],
          });
        }

        // Cuota de Préstamo: se agrega automáticamente cuando el empleado tiene
        // cuotas pendientes del período, de modo que cada cuota se descuente en la
        // planilla mensual sin configurar un concepto manualmente. Si ya existe un
        // concepto configurado que cubre la lógica loan_installment, se respeta
        // ese para evitar el doble descuento.
        const empLoanInstallments = loanInstallmentsByEmployee[emp.id] || [];
        if (empLoanInstallments.length > 0) {
          const hasLoanConcept = allEmpConcepts.some(c =>
            c.system_logic_type === "loan_installment" ||
            String(c.calculation_formula || "").trim().toLowerCase() === "loan_installment" ||
            /pr[eé]stamo/i.test(c.concept_name || "")
          );
          if (!hasLoanConcept) {
            conceptsForCalc.push({
              employee_id: emp.id,
              concept_type: "Descuento",
              concept_category: "Préstamos",
              concept_name: "Cuota de Préstamo",
              system_logic_type: "loan_installment",
              is_dynamic: true,
              is_recurring: true,
              applies_to_payroll_types: ["Mensual"],
            });
          }
        }
      }

      // La remuneración básica (concepto 00101) toma SIEMPRE el sueldo del contrato
      // aprobado del período: si el concepto está configurado con un importe fijo
      // obsoleto, se ajusta al sueldo contractual. Las fórmulas dinámicas no se
      // tocan (leen base_salary, ya enriquecido con el contrato del período).
      if (payrollType !== "Quincenal") {
        conceptsForCalc = applyContractSalaryToBaseConcepts(conceptsForCalc, emp.base_salary);
      }

      // Calcular descuentos por asistencia (solo para planillas NO quincenales)
      // Excluir los registros cubiertos por vacaciones aprobadas: un día de
      // vacaciones no debe generar descuento por tardanza ni por inasistencia,
      // incluso si el AttendanceRecord tiene valores residuales (is_late,
      // late_minutes, is_absent) por haberse aprobado la vacación después.
      const normDate = (d) => (d ? String(d).split("T")[0].slice(0, 10) : "");
      const isCoveredByApprovedVacation = (employeeId, recordDate) => {
        const d = normDate(recordDate);
        return approvedVacations.some(vacation =>
          vacation.employee_id === employeeId &&
          normDate(vacation.start_date) <= d &&
          normDate(vacation.end_date) >= d
        );
      };
      const attendanceForDiscounts = empAttendance.filter(
        record => !isCoveredByApprovedVacation(emp.id, record.date)
      );

      // Horario aplicable del empleado en una fecha: tolerancia, refrigerio y turnos
      // nocturnos, igual que en el control de asistencia. El horario del empleado
      // tiene prioridad sobre el de departamento y se respeta su vigencia.
      const scheduleDayFor = (dateStr) => {
        const isActive = (ws) => ws.is_active !== false;
        const pickValid = (list) => {
          const valid = list.filter(ws => {
            const from = ws.effective_from || "0000-01-01";
            const to = ws.effective_to || "9999-12-31";
            return from <= dateStr && to >= dateStr;
          });
          valid.sort((a, b) => String(b.effective_from || "0000-01-01").localeCompare(String(a.effective_from || "0000-01-01")));
          return valid[0] || null;
        };
        const schedule =
          pickValid(workSchedules.filter(ws => ws.employee_id === emp.id && isActive(ws))) ||
          pickValid(workSchedules.filter(ws => !ws.employee_id && isActive(ws) &&
            (ws.department_name === emp.department_name || (ws.departments || []).includes(emp.department_name))));
        if (!schedule) return null;
        const dow = new Date(dateStr + "T00:00:00").getDay();
        const stMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
        const enMap = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
        return {
          start: schedule[stMap[dow]] || null,
          end: schedule[enMap[dow]] || null,
          tolerance_minutes: schedule.tolerance_minutes ?? DEFAULT_LATE_TOLERANCE_MINUTES,
          breakMinutes: schedule.break_duration_minutes ?? 0,
          breakStart: schedule.break_start || null,
        };
      };

      // Minutos de tardanza respaldados por las marcaciones reales, aplicando la
      // tolerancia del horario vigente. Devuelve null si el registro no permite el
      // cálculo (sin marcación de entrada o sin horario): en ese caso se conserva el
      // valor almacenado por el motor.
      const markedLateMinutes = (record) =>
        computeMarkedLateMinutes({
          record,
          scheduleDay: scheduleDayFor(normDate(record.date)),
          approvedIncidents: [],
        }).markedMinutes;

      // Compensación aprobada por fecha (una sola lectura por empleado).
      const approvedCompensationByDate = new Map();
      for (const incident of compensationIncidents) {
        if (incident.employee_id !== emp.id) continue;
        if (incident.status !== "Aprobada") continue;
        if (incident.incident_type !== "Compensación de Tardanza") continue;
        const day = normDate(incident.incident_date);
        approvedCompensationByDate.set(
          day,
          (approvedCompensationByDate.get(day) || 0) + (incident.late_minutes_to_adjust || 0)
        );
      }

      // Tardanza descontable con el MISMO resultado que asistencia y sus filtros:
      // marcaciones + tolerancia del horario, con la compensación aprobada descontada
      // una sola vez (si el registro ya la refleja, no se resta de nuevo). Una entrada
      // regularizada y puntual deja cero minutos descontables aunque el registro
      // conserve is_late = true.
      const effectiveLateMinutes = (record) => {
        const recordCompMin = enableTardinessCompensation && record.tardiness_compensation_status === "Activa"
          ? (record.tardiness_compensation_minutes || 0)
          : 0;
        return resolveDiscountLateMinutes({
          storedMinutes: record.late_minutes,
          storedIsLate: record.is_late,
          markedMinutes: markedLateMinutes(record),
          appliedCompensationMinutes:
            (approvedCompensationByDate.get(normDate(record.date)) || 0) + recordCompMin,
        });
      };

      // La tolerancia ya está aplicada: cualquier minuto efectivo es descontable.
      const lateRecords = attendanceForDiscounts.filter(r => effectiveLateMinutes(r) > 0);
      // Inasistencias: solo se descuenta la falta CONFIRMADA (is_absent y estado
      // "Ausente" coherentes). Un día cubierto, un descanso o una marcación
      // incompleta no generan descuento por falta injustificada.
      const absentRecords = attendanceForDiscounts.filter(r => isConfirmedAbsence(r));
      const absenceReviewRecords = attendanceForDiscounts.filter(r =>
        (r.is_absent || r.status === "Ausente") && !isConfirmedAbsence(r)
      );
      if (absenceReviewRecords.length > 0) {
        absenceReviewWarnings.push(
          `${emp.employee_code} ${emp.first_name} ${emp.last_name}: ${absenceReviewRecords.length} día(s) con datos de falta contradictorios (${absenceReviewRecords.slice(0, 3).map(r => normDate(r.date)).join(", ")})`
        );
      }
      // ── Descuento por salida anticipada (concepto independiente) ──
      // Sin tolerancia: descuento desde el primer minuto. Excluye registros
      // justificados, de vacaciones, compensación, permiso sin goce y ausentes.
      // No interpreta una marcación de salida ausente como salida anticipada.
      const earlyDepartureRecords = attendanceForDiscounts.filter(r =>
        r.status !== "Justificado" && r.status !== "Vacaciones" &&
        r.status !== "Compensación" && r.status !== "Permiso sin goce" &&
        r.status !== "Ausente" && !r.is_absent
      );

      // ── Descuentos por asistencia (se calculan AQUÍ, antes de invocar el motor) ──
      // Regla quincenal: NO aplicar descuentos por inasistencias/tardanzas.
      // Descuento por tardanzas: (salario_diario / 8) * (minutos_tardanza / 60).
      // Se descuenta únicamente el tiempo de tardanza (en horas) sobre el valor hora,
      // NO un día completo por cada tardanza. Los registros con tardanza ≤ 10 minutos
      // (tolerancia) ya fueron excluidos al construir lateRecords.
      const baseSalaryForCalc = safePayrollNumber(emp.base_salary); // Siempre usar el salario del contrato
      const dailyRate = baseSalaryForCalc > 0 ? roundMoney(baseSalaryForCalc / 30) : 0;
      // Suma de la tardanza efectiva ya calculada: la compensación vigente se descuenta
      // una sola vez, dentro de effectiveLateMinutes (no se resta de nuevo aquí).
      const totalLateMinutes = lateRecords.reduce((sum, r) => sum + effectiveLateMinutes(r), 0);
      const hourlyRate = dailyRate > 0 ? roundMoney(dailyRate / 8) : 0;
      const tardinessDiscount = payrollType === "Quincenal" ? 0 : roundMoney(hourlyRate * (totalLateMinutes / 60));
      // Descuento por inasistencias: un día de salario por cada falta completa.
      const absenceDiscount = payrollType === "Quincenal" ? 0 : roundMoney(absentRecords.length * dailyRate);
      // ── Descuento por salida anticipada ──
      // Usa el mismo valor hora que tardanzas (salario diario / 8).
      const totalEarlyDepartureMinutes = earlyDepartureRecords.reduce((sum, r) => {
        // Usar el valor almacenado por el motor si está disponible (considera
        // justificaciones aprobadas). Si no, calcular inline como respaldo.
        if (r.early_departure_minutes != null && r.early_departure_minutes > 0) {
          return sum + r.early_departure_minutes;
        }
        return sum + getEarlyDepartureMinutes(r, []);
      }, 0);
      const earlyDepartureDiscount = payrollType === "Quincenal" ? 0 : roundMoney(hourlyRate * (totalEarlyDepartureMinutes / 60));

      // Datos adicionales para lógica del sistema (derechohabientes, tardanzas, inasistencias)
      const extraContext = {
        derechohabientes: empDerechohabientes,
        late_records: lateRecords,
        absent_records: absentRecords,
        early_departure_records: earlyDepartureRecords,
        afp: allAfps.find(a => a.id === emp.afp_id) || null,
        enable_tardiness_compensation: enableTardinessCompensation,
        loan_installments: loanInstallmentsByEmployee[emp.id] || [],
        // Total de descuentos de asistencia que este módulo aplica por separado al neto.
        // Se entrega al motor para que reduzcan la base previsional (remuneracion_afecta)
        // antes de evaluar las fórmulas dinámicas y el aporte AFP/ONP. El motor NO los
        // suma a sus propios descuentos: se aplican una sola vez al neto, más abajo.
        attendance_discount_amount: roundMoney(tardinessDiscount + earlyDepartureDiscount + absenceDiscount),
      };

      const result = await calculator.calculatePayroll(conceptsForCalc, attendanceData, rmvData?.amount || 1130, extraContext);

      // Buscar adelanto quincenal si es mensual.
      // Solo se descuenta a empleados que fueron elegibles para la quincenal
      // (mismo filtro de cutoff que se usa al generar la planilla quincenal).
      // Se hace una consulta fresca para garantizar que se encuentre incluso si
      // la quincenal fue generada en esta misma sesión sin recarga de página.
      let advanceDeduction = 0;
      let advancePaymentId = null;
      if (payrollType === "Mensual") {
        // Validar elegibilidad quincenal: el empleado debió ingresar antes del día de corte
        const cutoffDay = payrollConfig?.quincenal_cutoff_day ?? 7;
        const wasEligibleForQuincenal = (() => {
          if (!emp.hire_date) return true; // Sin fecha de ingreso: elegible
          const [hireYear, hireMonth, hireDay] = emp.hire_date.split("T")[0].split("-").map(Number);
          if (hireYear < selectedYear) return true;
          if (hireYear === selectedYear && hireMonth < selectedMonth) return true;
          if (hireYear === selectedYear && hireMonth === selectedMonth) {
            return hireDay <= cutoffDay;
          }
          return false; // Ingresó en un mes posterior: no elegible
        })();

        if (wasEligibleForQuincenal) {
          // Considerar boletas quincenales Calculadas, Aprobadas o Pagadas.
          // Si la quincenal ya fue generada (Calculada), el adelanto se pagó al
          // empleado y debe descontarse de la mensual.
          const validStatuses = ["Calculada", "Aprobada", "Pagada"];
          // Combinar batch fresco + cache local (existingPayslips) para máxima cobertura
          const quincenalSource = [
            ...batchQuincenalPayslips,
            ...existingPayslips.filter(p => p.payroll_type === "Quincenal" &&
              Number(p.month) === selectedMonth && Number(p.year) === selectedYear)
          ];
          let quincenalPayslips = quincenalSource
            .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i) // dedup por ID
            .filter(p => p.employee_id === emp.id && validStatuses.includes(p.status));
          if (quincenalPayslips.length > 0) {
            // Usar la boleta más reciente si hay múltiples
            const quincenalPayslip = quincenalPayslips.sort((a, b) =>
              new Date(b.created_date) - new Date(a.created_date)
            )[0];
            // Se descuenta el total_income de la quincenal (monto bruto adelantado),
            // no el net_pay, porque la quincenal no tiene descuentos propios.
            // Si total_income está disponible y es mayor a 0, usarlo; si no, usar net_pay.
            const quincenalAmount = safePayrollNumber(quincenalPayslip.total_income) > 0
              ? safePayrollNumber(quincenalPayslip.total_income)
              : safePayrollNumber(quincenalPayslip.net_pay);
            advanceDeduction = quincenalAmount;
            advancePaymentId = quincenalPayslip.id;
          }
        }
      }

      // Extraer montos específicos del calculador para los campos dedicados de la boleta.
      const pensionDeductionAmount = roundMoney(
        result.deductions
          .filter(d => d.concept_category === "AFP/ONP")
          .reduce((sum, d) => sum + safePayrollNumber(d.calculated_amount), 0)
      );
      // Cuotas de préstamo descontadas en esta boleta
      const loanDeductionAmount = sumLoanDeduction(result.deductions);
      // ── Retención de Quinta Categoría ──
      // La retención vigente del módulo reemplaza al descuento de renta basado en conceptos.
      const quintaResult = applyQuintaRetentionToResult(
        result, quintaCategoriaCalculos, emp.id, selectedMonth, selectedYear, payrollType
      );
      const incomeTaxAmount = quintaResult.finalIncomeTax;
      // Ajustar totales con descuentos adicionales — sanitizar cada término
      const adjustedDeductions = roundMoney(
        safePayrollNumber(result.totals.totalDeductions) + tardinessDiscount + earlyDepartureDiscount + absenceDiscount + advanceDeduction + quintaResult.adjustment
      );
      const adjustedNetPay = roundMoney(safePayrollNumber(result.totals.totalIncome) - adjustedDeductions);
      if (quintaResult.hasQuintaCalc && result.summary?.result) {
        result.summary.result.totalDeductions = adjustedDeductions;
        result.summary.result.netPay = adjustedNetPay;
      }
      // other_deductions: descuentos del calculador que NO están en campos dedicados (AFP/ONP, Renta)
      const otherDeductionsFromCalc = roundMoney(
        safePayrollNumber(result.totals.totalDeductions) - pensionDeductionAmount - quintaResult.conceptIncomeTax - loanDeductionAmount
      );

      const rawPayslip = {
        employee_id: emp.id,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        employee_code: emp.employee_code,
        department: emp.department_name,
        period: `${format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })}`,
        attendance_period_start: periodFrom,
        attendance_period_end: periodTo,
        month: selectedMonth,
        year: selectedYear,
        payroll_type: payrollType,
        payroll_number: payrollNumber,
        advance_payment_id: advancePaymentId,
        worked_days: workedDays,
        subsidized_days: subsidizedDays,
        non_worked_days: payrollType === "Quincenal" ? 0 : absentRecords.length,
        regular_hours: attendanceData.regular_hours,
        overtime_hours: roundMoney(overtimeHours25 + overtimeHours35),
        overtime_hours_25: roundMoney(overtimeHours25),
        overtime_hours_35: roundMoney(overtimeHours35),
        // Remuneración base calculada: suma de ingresos con categoría "Remuneración Base".
        // Si no existe el concepto, conserva el salario nominal del contrato.
        base_salary: getCalculatedBaseSalary(result.incomes, emp.base_salary),
        // Asignación familiar calculada desde el concepto del motor (respaldo: elegibilidad).
        family_allowance: roundMoney(findCalculatedFamilyAllowance(result.incomes) || (familyAllowanceInfo.qualifies ? familyAllowanceInfo.amount : 0)),
        // Costos calculados desde los conceptos del motor (por variable de fórmula, respaldo por nombre).
        // Contienen el calculated_amount, no el valor nominal del contrato.
        activity_cost_amount: roundMoney(findCalculatedCost(result.incomes, "activity_cost", ["actividad", "costo actividad"])),
        food_cost_amount: roundMoney(findCalculatedCost(result.incomes, "food_cost", ["alimentación", "costo alimentación", "costo alimento"])),
        transport_cost_amount: roundMoney(findCalculatedCost(result.incomes, "transport_cost", ["movilidad", "costo movilidad"])),
        // overtime_pay: suma monetaria de los conceptos de Horas Extras (25%, 35% y, si
        // existe, horas nocturnas) calculados por el motor. Ya están incluidos en
        // total_income vía result.totals.totalIncome, por lo que no se agregan nuevamente.
        overtime_pay: roundMoney(sumOvertimeIncomes(result.incomes)),
        // Bonificaciones: suma de conceptos de ingreso calculados con categoría "Bonificaciones".
        // La asignación familiar queda excluida (tiene categoría "Asignaciones" y su propia columna).
        bonuses: roundMoney(sumIncomesByCategory(result.incomes, "Bonificaciones")),
        commissions: 0,
        other_income: 0,
        total_income: safePayrollNumber(result.totals.totalIncome),
        pension_deduction: pensionDeductionAmount,
        health_insurance: 0,
        income_tax: incomeTaxAmount,
        tardiness_discount: tardinessDiscount,
        early_departure_discount: earlyDepartureDiscount,
        absence_discount: absenceDiscount,
        loan_deduction: loanDeductionAmount,
        advance_deduction: advanceDeduction,
        other_deductions: otherDeductionsFromCalc,
        total_deductions: adjustedDeductions,
        net_pay: adjustedNetPay,
        payment_date: `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-${payrollType === "Quincenal" ? "15" : "30"}`,
        status: "Calculada",
        calculation_summary: result.summary,
        calculation_log: result.calculationLog,
        has_errors: result.errors.length > 0,
        errors: result.errors,
      };

      // Sanitización final antes de retornar — corrige cualquier residuo no finito
      const { sanitized, warnings } = sanitizePayslip(rawPayslip);
      if (warnings.length > 0) {
        console.warn(`[Planilla] Valores corregidos para ${rawPayslip.employee_name}:`, warnings);
      }
      return { ...sanitized, employee_name: rawPayslip.employee_name, employee_code: rawPayslip.employee_code, department: rawPayslip.department };
    });

      setPreviewData(payslipsData);
      setShowPreview(true);
      setContractAlerts({ noApproved: noApprovedContractWorkers, conflicts: contractConflicts });

      // Inconsistencias detectadas: se informan sin modificar nada automáticamente.
      // Si hay trabajadores sin contrato aprobado, la generación pedirá confirmación.
      if (contractConflicts.length > 0) {
        toast.warning(
          `⚠️ ${contractConflicts.length} trabajador(es) con contratos superpuestos en el período. Depure los contratos y vuelva a calcular. ${contractConflicts.slice(0, 3).map(c => c.detail).join(" | ")}`,
          { duration: 15000 }
        );
      }
      if (noApprovedContractWorkers.length > 0) {
        toast.warning(
          `⚠️ ${noApprovedContractWorkers.length} trabajador(es) sin contrato aprobado (Vigente) en el período. Se usó el último contrato aprobado. ${noApprovedContractWorkers.slice(0, 3).map(w => `${w.employee_code} ${w.employee_name}`).join(" | ")}`,
          { duration: 15000 }
        );
      }
      if (absenceReviewWarnings.length > 0) {
        toast.warning(
          `⚠️ ${absenceReviewWarnings.length} trabajador(es) con días de ausencia inconsistentes: no se descontaron. Use "Regularizar asistencia" para revisarlos. ${absenceReviewWarnings.slice(0, 3).join(" | ")}`,
          { duration: 12000 }
        );
      }
      if (autoGenerate) {
        const payslipsToCreate = payslipsData.map(p => {
          const { employee_name, employee_code, department, ...rest } = p;
          return rest;
        });
        if (noApprovedContractWorkers.length > 0 || contractConflicts.length > 0) {
          // Nada se persiste hasta que el usuario confirme explícitamente la alerta
          // (trabajadores sin contrato aprobado del período o contratos superpuestos).
          setPendingGeneration(payslipsToCreate);
          setShowContractAlert(true);
        } else {
          createPayslipsMutation.mutate(payslipsToCreate);
        }
      }
      // ── Validación de sanity post-cálculo: registrar días laborados para depuración ──
      // Si un empleado ingresa a mitad de mes, los días laborados deben ser
      // (30 - día_ingreso + 1), NO el conteo de registros de asistencia.
      payslipsData.forEach(p => {
        const empDebug = enrichedEmployees.find(e => e.id === p.employee_id);
        if (empDebug?.hire_date && p.worked_days != null) {
          const [hY, hM, hD] = empDebug.hire_date.split("T")[0].split("-").map(Number);
          if (hY === selectedYear && hM === selectedMonth && hD > 1) {
            const expected = 30 - hD + 1;
            if (p.worked_days !== expected) {
              console.warn(`[Días Laborados] ${p.employee_name}: calculado=${p.worked_days}, esperado=${expected} (ingreso ${empDebug.hire_date})`);
            }
          }
        }
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleGeneratePayroll = () => {
    const payslipsToCreate = previewData.map(p => {
      const { employee_name, employee_code, department, ...rest } = p;
      return rest;
    });
    createPayslipsMutation.mutate(payslipsToCreate);
  };

  // Generación confirmada tras el aviso de contratos: solo aquí se persisten las
  // boletas calculadas de los trabajadores sin contrato aprobado (Vigente).
  const handleConfirmContractAlert = () => {
    if (!pendingGeneration) return;
    createPayslipsMutation.mutate(pendingGeneration, {
      onSuccess: () => {
        setShowContractAlert(false);
        setPendingGeneration(null);
      },
    });
  };

  const handleRemoveEmployee = (employeeId) => {
    setPreviewData(previewData.filter(p => p.employee_id !== employeeId));
    setExcludedEmployees([...excludedEmployees, employeeId]);
    toast.success("Empleado excluido de la planilla");
  };

  const handleAddEmployee = (employee) => {
    // Quitar de excluidos
    setExcludedEmployees(excludedEmployees.filter(id => id !== employee.id));
    toast.success("Empleado agregado. Regenere la vista previa.");
  };

  // Obtener empleados no incluidos en la planilla actual
  const getExcludedEmployeesData = () => {
    const includedIds = previewData.map(p => p.employee_id);
    const periodStart = new Date(selectedYear, selectedMonth - 1, 1);
    const periodEnd = new Date(selectedYear, selectedMonth, 0);

    // Solo empleados que trabajaron en el periodo (Activos o Cesados dentro del periodo)
    let baseEmployees = allEmployees.filter(emp => {
      if (emp.status === "Suspendido") return false;
      if (emp.status === "Cesado") {
        if (!emp.termination_date) return false;
        const termDate = new Date(emp.termination_date.split("T")[0]);
        return termDate >= periodStart;
      }
      return true;
    });
    
    if (searchTerm) {
      baseEmployees = baseEmployees.filter(emp => 
        emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (departmentFilter !== "all") {
      baseEmployees = baseEmployees.filter(emp => emp.department_name === departmentFilter);
    }

    return baseEmployees.filter(emp => 
      !includedIds.includes(emp.id) || excludedEmployees.includes(emp.id)
    );
  };

  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  // Planillas del periodo actual filtradas por mes/año/departamento/búsqueda (SIN filtrar por tipo)
  const filteredPayslips = existingPayslips.filter(p => {
    const emp = allEmployees.find(e => e.id === p.employee_id);
    if (!emp) return false;
    const matchesPeriod = Number(p.month) === selectedMonth && Number(p.year) === selectedYear;
    const matchesType = p.payroll_type === payrollType;
    const matchesSearch = searchTerm ? (
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
    ) : true;
    const matchesDept = departmentFilter === "all" || emp.department_name === departmentFilter;
    return matchesPeriod && matchesType && matchesSearch && matchesDept;
  });

  // Helper para parsear números seguros (evita Infinity/NaN) — delegado a payrollUtils
  const safeNum = (v) => safePayrollNumber(v);

  // Stats calculadas sobre el periodo/departamento filtrado actual
  const stats = {
    quincenal: filteredPayslips.filter(p => p.payroll_type === "Quincenal").length,
    mensual: filteredPayslips.filter(p => p.payroll_type === "Mensual").length,
    adicional: filteredPayslips.filter(p => p.payroll_type === "Adicional").length,
    snp: filteredPayslips.filter(p => p.payroll_type === "SNP").length,
    total: filteredPayslips.reduce((sum, p) => sum + safeNum(p.net_pay), 0),
  };

  // El agrupamiento del histórico se movió a PayrollHistoryTab (mismo cálculo).

  const handleDeletePayroll = async () => {
    if (!selectedPayrollToDelete) return;
    
    const toDelete = allPayslips.filter(p => 
      p.year === selectedPayrollToDelete.year && 
      p.month === selectedPayrollToDelete.month && 
      p.payroll_type === selectedPayrollToDelete.type
    );
    
    try {
      // Devolver a "Pendiente" las cuotas de préstamo descontadas en esas boletas
      await revertLoanInstallments(toDelete.map(p => p.id));
      await mapWithConcurrency(toDelete, p => base44.entities.Payslip.delete(p.id));
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["allPayslips"]);
      queryClient.invalidateQueries(["loanInstallments"]);
      queryClient.invalidateQueries(["activeLoans"]);
      toast.success(`${toDelete.length} planilla(s) eliminada(s)`);
      setSelectedPayrollToDelete(null);
    } catch (error) {
      toast.error("Error al eliminar las planillas");
      console.error(error);
    }
  };

  // Helpers de exportación Excel extraídos a @/lib/payrollExcelHelpers
  // (getCostFromSummary, dedupeIncomesByCost, computeDedupedTotalIncome,
  // getAfpBreakdown, getOvertimePaySplit)

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <p className="text-slate-600">Cargando permisos...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasPermission("payroll.view_all") && !hasPermission("payroll.view_department")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para gestionar planillas</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canCreate = hasPermission("payroll.create");
  const canEdit = hasPermission("payroll.edit");
  const canDelete = hasPermission("payroll.delete");
  const canViewAmounts = hasPermission("payroll.view_amounts");
  const canViewAllDepartments = hasPermission("payroll.view_all");
  
  // Filtrar empleados según permisos departamentales
  const getFilteredEmployees = () => {
    if (canViewAllDepartments) return allEmployees;
    return allEmployees.filter(emp => canAccessDepartment(emp.department_name));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Gestión de Planillas</h1>
            <p className="text-slate-600 text-lg">Generar y administrar planillas quincenales, mensuales y adicionales</p>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => navigate(createPageUrl("PayrollConcepts"))} variant="outline" className="whitespace-nowrap text-sm">
              <Edit2 className="w-4 h-4 mr-2" />Gestionar Conceptos
            </Button>
            <Button onClick={() => setShowPayrollConfig(true)} variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 whitespace-nowrap text-sm">
              <Settings className="w-4 h-4 mr-2" />Configurar Quincenal
            </Button>
          </div>
        </div>

        {/* ── Barra de filtros / generación (ancho completo) ── */}
        <Card className="border-0 shadow-lg mb-6">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-end gap-4">
              {/* Tipo de Planilla */}
              <div className="flex-1 min-w-[160px]">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tipo de Planilla</Label>
                <Select value={payrollType} onValueChange={(v) => { setPayrollType(v); setShowPreview(false); setPreviewData([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Quincenal">Quincenal (Adelanto)</SelectItem>
                    <SelectItem value="Mensual">Mensual (Final)</SelectItem>
                    <SelectItem value="Adicional">Adicional (Extraordinaria)</SelectItem>
                    <SelectItem value="SNP">SNP (Servicios No Personales)</SelectItem>
                  </SelectContent>
                </Select>
                {payrollType === "Quincenal" && (
                  <p className="text-xs text-amber-600 mt-1">
                    {payrollConfig?.quincenal_percentage ?? 40}% del sueldo base · Hasta el día {payrollConfig?.quincenal_cutoff_day ?? 7}
                  </p>
                )}
                {payrollType === "Mensual" && (
                  <p className="text-xs text-blue-600 mt-1">Se descontará el adelanto quincenal si existe</p>
                )}
              </div>

              {/* Mes */}
              <div className="min-w-[130px]">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Mes</Label>
                <Select value={String(selectedMonth)} onValueChange={(v) => { const m = parseInt(v); setSelectedMonth(m); setShowPreview(false); setPreviewData([]); queryClient.invalidateQueries({ queryKey: ["payslips", m, selectedYear] }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {format(new Date(2024, i), 'MMMM', { locale: es })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Año */}
              <div className="min-w-[100px]">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Año</Label>
                <Select value={String(selectedYear)} onValueChange={(v) => { const y = parseInt(v); setSelectedYear(y); setShowPreview(false); setPreviewData([]); queryClient.invalidateQueries({ queryKey: ["payslips", selectedMonth, y] }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2023, 2024, 2025, 2026].map(year => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Departamento */}
              <div className="min-w-[150px]">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Departamento</Label>
                <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); setShowPreview(false); setPreviewData([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Buscar Empleado */}
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Buscar Empleado</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input placeholder="Nombre o código..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
                </div>
              </div>

              {/* Vista Previa */}
              {canCreate && (
                <div className="flex items-end">
                  <Button onClick={() => handleOpenPeriodModal('preview')} className="bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap" disabled={payrollDataLoading || isCalculating}>
                    <Eye className="w-4 h-4 mr-2" />{isCalculating ? "Calculando..." : "Vista Previa"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Indicador de carga / error de datos de planilla ── */}
        {(payrollDataLoading || isCalculating) && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-blue-700 font-medium">
              {isCalculating ? "Calculando planilla..." : "Cargando datos de planilla..."}
            </p>
          </div>
        )}
        {payrollDataError && !payrollDataLoading && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              Error al cargar datos de planilla. Algunos datos no están disponibles. Reintente en unos segundos.
            </p>
          </div>
        )}

        {/* ── Stats Cards ── */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <FileText className="w-5 h-5 text-blue-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.quincenal}</span>
              <span className="text-sm text-slate-600">Planillas Quincenales</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Calendar className="w-5 h-5 text-green-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.mensual}</span>
              <span className="text-sm text-slate-600">Planillas Mensuales</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Plus className="w-5 h-5 text-purple-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.adicional}</span>
              <span className="text-sm text-slate-600">Planillas Adicionales</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg border border-indigo-200 shadow-sm">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{canViewAmounts ? `S/ ${stats.total.toFixed(2)}` : '🔒'}</span>
              <span className="text-sm text-slate-600">Total Planillas</span>
            </div>
          </div>
        </div>

        {/* ── Contenido principal a ancho completo ── */}
        <div>
            {showPreview ? (
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold">Vista Previa de Planilla</CardTitle>
                      <p className="text-sm text-slate-600 mt-1">
                        {payrollType} - {format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })}
                      </p>
                      <p className="text-xs text-indigo-600 mt-0.5 font-medium">
                        📅 Período de cómputo: {previewData[0]?.attendance_period_start ? format(parseDateLima(previewData[0].attendance_period_start), "dd/MM/yyyy", { locale: es }) : "—"} → {previewData[0]?.attendance_period_end ? format(parseDateLima(previewData[0].attendance_period_end), "dd/MM/yyyy", { locale: es }) : "—"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)}>
                      ✕
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <ContractAlertBanner
                    noApproved={contractAlerts.noApproved}
                    conflicts={contractAlerts.conflicts}
                  />
                  <div className="mb-6 flex gap-3 flex-wrap">
                    <Button
                      onClick={() => generatePayrollSummaryPDF({
                        payrollType,
                        month: selectedMonth,
                        year: selectedYear,
                        payslips: previewData,
                        allEmployees,
                      })}
                      variant="outline"
                      className="flex-1"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar PDF
                    </Button>
                    <Button
                      onClick={() => exportPayslipsToExcel(previewData, allEmployees, `Planilla_${payrollType}_${selectedMonth}_${selectedYear}`, payrollType)}
                      variant="outline"
                      className="flex-1 border-green-300 text-green-700 hover:bg-green-50"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Exportar Excel
                    </Button>
                    <Button
                      onClick={() => handleOpenPeriodModal('generate')}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={createPayslipsMutation.isPending || isCalculating}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {isCalculating ? "Calculando..." : createPayslipsMutation.isPending ? "Generando..." : "Confirmar y Generar"}
                    </Button>
                  </div>

                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {previewData.map((payslip) => (
                      <PayrollPreviewCard
                        key={payslip.employee_id}
                        payslip={payslip}
                        emp={allEmployees.find(e => e.id === payslip.employee_id)}
                        payrollConcepts={payrollConcepts}
                        additionalConcepts={additionalConcepts}
                        canViewAmounts={canViewAmounts}
                        selectedMonth={selectedMonth}
                        selectedYear={selectedYear}
                        contractAlert={contractAlerts.noApproved.find(w => w.employee_id === payslip.employee_id)}
                        showConcepts={showConceptsFor === payslip.employee_id}
                        onToggleConcepts={() => setShowConceptsFor(showConceptsFor === payslip.employee_id ? null : payslip.employee_id)}
                        onAddConcept={(concept) => setAdditionalConcepts([...additionalConcepts, concept])}
                        onRemoveConcept={(idx) => setAdditionalConcepts(additionalConcepts.filter((_, i) => i !== idx))}
                        onRemoveEmployee={() => handleRemoveEmployee(payslip.employee_id)}
                        onViewPayslip={() => setPreviewPayslip(payslip)}
                        onRecalculate={() => calculatePayroll()}
                      />
                    ))}
                  </div>

                  {canViewAmounts && (
                    <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-lg">Total General:</span>
                        <span className="font-bold text-indigo-600 text-2xl">
                          S/ {previewData.reduce((sum, p) => sum + safeNum(p.net_pay), 0).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {previewData.length} empleados
                      </p>
                    </div>
                  )}

                  {/* Empleados No Incluidos */}
                  {getExcludedEmployeesData().length > 0 && (
                    <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <h4 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Empleados No Incluidos ({getExcludedEmployeesData().length})
                      </h4>
                      <p className="text-xs text-amber-700 mb-3">
                        Estos empleados no están incluidos en la planilla actual. Puede agregarlos o generar una planilla adicional para ellos.
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {getExcludedEmployeesData().map(emp => (
                          <div key={emp.id} className="flex items-center justify-between bg-white p-2 rounded border border-amber-200">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {emp.employee_code} - {emp.first_name} {emp.last_name}
                              </p>
                              <p className="text-xs text-slate-600">{emp.department_name}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleAddEmployee(emp)}
                              className="bg-green-600 hover:bg-green-700 text-xs"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Agregar
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="current" className="space-y-6">
                <TabsList>
                  <TabsTrigger value="current">Periodo Actual</TabsTrigger>
                  <TabsTrigger value="history">Histórico de Planillas</TabsTrigger>
                </TabsList>

                <TabsContent value="current">
                  {filteredPayslips.length === 0 ? (
                    <Card className="border-0 shadow-lg">
                      <CardContent className="py-16 text-center">
                        <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-600">No hay planillas generadas para este periodo</p>
                        <p className="text-sm text-slate-400 mt-1">{format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })}</p>
                      </CardContent>
                    </Card>
                  ) : (() => {
                    // Agrupar por tipo de planilla
                    const tipos = [...new Set(filteredPayslips.map(p => p.payroll_type))];
                    return (
                      <div className="space-y-6">
                        {tipos.map(tipo => {
                          const planillasDelTipo = filteredPayslips.filter(p => p.payroll_type === tipo);
                          const totalNeto = planillasDelTipo.reduce((s, p) => s + safeNum(p.net_pay), 0);
                          const totalIngresos = planillasDelTipo.reduce((s, p) => s + safeNum(p.total_income), 0);
                          const totalDesc = planillasDelTipo.reduce((s, p) => s + safeNum(p.total_deductions), 0);
                          const allPagada   = planillasDelTipo.every(p => p.status === "Pagada");
                          const allAprobada = !allPagada && planillasDelTipo.every(p => p.status === "Aprobada" || p.status === "Pagada") && planillasDelTipo.some(p => p.status === "Aprobada");
                          const puedeAprobar = !allPagada && !allAprobada;

                          const statusBadgeColor =
                            allPagada   ? "bg-green-100 text-green-700 border-green-200" :
                            allAprobada ? "bg-blue-100 text-blue-700 border-blue-200" :
                            "bg-yellow-100 text-yellow-700 border-yellow-200";
                          const statusLabel =
                            allPagada ? "✓ Pagada" : allAprobada ? "✓ Aprobada" : "Calculada";

                          return (
                            <Card key={tipo} className={`border-2 shadow-lg ${allAprobada ? "border-blue-300" : allPagada ? "border-green-300" : "border-transparent"}`}>
                              {/* Cabecera de la planilla */}
                              <CardHeader className={`border-b pb-4 ${allAprobada ? "bg-blue-50" : allPagada ? "bg-green-50" : "bg-slate-50/60"}`}>
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <div className="flex items-center gap-3 mb-1">
                                      <CardTitle className="text-xl font-bold">
                                        Planilla {tipo}
                                      </CardTitle>
                                      <Badge className={
                                        tipo === "Quincenal" ? "bg-blue-100 text-blue-700" :
                                        tipo === "Mensual"   ? "bg-green-100 text-green-700" :
                                        tipo === "SNP"       ? "bg-orange-100 text-orange-700" :
                                        "bg-purple-100 text-purple-700"
                                      }>{tipo}</Badge>
                                      <Badge className={statusBadgeColor}>{statusLabel}</Badge>
                                    </div>
                                    <p className="text-sm text-slate-500 capitalize">
                                      {format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })} • {planillasDelTipo.length} trabajador(es)
                                    </p>
                                  </div>
                                  {/* Acciones a nivel de planilla completa */}
                                  <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-green-300 text-green-700 hover:bg-green-50"
                                      onClick={() => exportPayslipsToExcel(
                                        planillasDelTipo,
                                        allEmployees,
                                        `Planilla_${tipo}_${selectedMonth}_${selectedYear}`,
                                        tipo
                                      )}
                                    >
                                      <Download className="w-4 h-4 mr-1" />
                                      Excel
                                    </Button>
                                    {puedeAprobar && (
                                      <Button
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow"
                                        onClick={() => approveFullPayrollMutation.mutate({ year: selectedYear, month: selectedMonth, payrollType: tipo })}
                                        disabled={approveFullPayrollMutation.isPending}
                                      >
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        {approveFullPayrollMutation.isPending ? "Aprobando..." : "✓ Aprobar Planilla Completa"}
                                      </Button>
                                    )}
                                    {allAprobada && (
                                      <Button
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700 text-white font-semibold shadow"
                                        onClick={() => payFullPayrollMutation.mutate({ year: selectedYear, month: selectedMonth, payrollType: tipo })}
                                        disabled={payFullPayrollMutation.isPending}
                                      >
                                        <Lock className="w-4 h-4 mr-2" />
                                        {payFullPayrollMutation.isPending ? "Procesando..." : "Marcar como Pagada"}
                                      </Button>
                                    )}
                                    {allPagada && (
                                      <Badge className="bg-green-100 text-green-700 border border-green-300 px-3 py-1.5 text-sm">
                                        ✓ Planilla Pagada
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {/* Banner de estado aprobada/pagada */}
                                {allAprobada && (
                                  <div className="mt-4 flex items-center gap-3 p-3 bg-blue-100 border border-blue-300 rounded-lg">
                                    <CheckCircle className="w-5 h-5 text-blue-600 shrink-0" />
                                    <div>
                                      <p className="font-bold text-blue-800 text-sm">Planilla Aprobada</p>
                                      <p className="text-xs text-blue-600">Esta planilla ha sido aprobada y está lista para pago.</p>
                                    </div>
                                  </div>
                                )}
                                {allPagada && (
                                  <div className="mt-4 flex items-center gap-3 p-3 bg-green-100 border border-green-300 rounded-lg">
                                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                                    <div>
                                      <p className="font-bold text-green-800 text-sm">Planilla Pagada</p>
                                      <p className="text-xs text-green-600">El pago de esta planilla ha sido procesado.</p>
                                    </div>
                                  </div>
                                )}
                                {/* Totales cabecera */}
                                {canViewAmounts && (
                                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-200">
                                    <div className="text-center">
                                      <p className="text-xs text-slate-500 mb-0.5">Total Ingresos</p>
                                      <p className="font-bold text-green-700">S/ {totalIngresos.toFixed(2)}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xs text-slate-500 mb-0.5">Total Descuentos</p>
                                      <p className="font-bold text-red-600">S/ {totalDesc.toFixed(2)}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xs text-slate-500 mb-0.5">NETO TOTAL A PAGAR</p>
                                      <p className="font-bold text-indigo-700 text-lg">S/ {totalNeto.toFixed(2)}</p>
                                    </div>
                                  </div>
                                )}
                              </CardHeader>

                              {/* Detalle de trabajadores */}
                              <CardContent className="p-0">
                                <div className="divide-y divide-slate-100">
                                  {planillasDelTipo.map((payslip, idx) => {
                                    const emp = allEmployees.find(e => e.id === payslip.employee_id);
                                    if (!emp) return null;
                                    return (
                                      <div key={payslip.id} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50/70">
                                        <span className="text-xs text-slate-400 w-6 shrink-0">{idx + 1}</span>
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                          {emp.first_name[0]}{emp.last_name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-semibold text-slate-900 text-sm truncate">
                                              {emp.document_type} {emp.document_number} — {emp.first_name} {emp.last_name}
                                            </p>
                                          <p className="text-xs text-slate-500">{emp.position} · {emp.department_name}</p>
                                        </div>
                                        <div className="flex items-center gap-6 text-sm shrink-0">
                                          <div className="text-center hidden sm:block">
                                            <p className="text-xs text-slate-400">Días</p>
                                            <p className="font-medium">{payslip.worked_days}</p>
                                          </div>
                                          {canViewAmounts && (
                                            <>
                                              <div className="text-center hidden md:block">
                                                <p className="text-xs text-slate-400">Ingresos</p>
                                                <p className="font-medium text-green-700">S/ {(payslip.total_income || 0).toFixed(2)}</p>
                                              </div>
                                              <div className="text-center hidden md:block">
                                                <p className="text-xs text-slate-400">Descuentos</p>
                                                <p className="font-medium text-red-500">S/ {(payslip.total_deductions || 0).toFixed(2)}</p>
                                              </div>
                                              <div className="text-center">
                                                <p className="text-xs text-slate-400">Neto</p>
                                                <p className="font-bold text-indigo-700">S/ {(payslip.net_pay || 0).toFixed(2)}</p>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                        {/* Botón Ver Boleta individual */}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 shrink-0 text-xs"
                                          onClick={() => setPreviewPayslip(payslip)}
                                        >
                                          <Eye className="w-3 h-3 mr-1" />Ver Boleta
                                        </Button>
                                        {/* Botón eliminar del trabajador de la planilla */}
                                        {!allPagada && (
                                         <Button
                                           size="sm"
                                           variant="outline"
                                           className="text-red-500 border-red-200 hover:bg-red-50 shrink-0 text-xs"
                                           onClick={() => {
                                             if (window.confirm(`¿Eliminar a ${emp.first_name} ${emp.last_name} de esta planilla?`)) {
                                               removeOnePayslipMutation.mutate(payslip.id);
                                             }
                                           }}
                                         >
                                           ✕ Quitar
                                         </Button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}
            </TabsContent>

            <TabsContent value="history">
              <PayrollHistoryTab
                allPayslips={allPayslips}
                allEmployees={allEmployees}
                canViewAmounts={canViewAmounts}
                selectedPayrollToDelete={selectedPayrollToDelete}
                onSelectPayrollToDelete={setSelectedPayrollToDelete}
                onDeletePayroll={handleDeletePayroll}
                searchTerm={historySearchTerm}
                onSearchTermChange={setHistorySearchTerm}
                yearFilter={historyYearFilter}
                onYearFilterChange={setHistoryYearFilter}
                monthFilter={historyMonthFilter}
                onMonthFilterChange={setHistoryMonthFilter}
                typeFilter={historyTypeFilter}
                onTypeFilterChange={setHistoryTypeFilter}
              />
            </TabsContent>
          </Tabs>
            )}
        </div>

        {/* Modal de Período de Asistencias */}
        {showPeriodModal && (() => {
          const { dateFrom, dateTo } = getDefaultPeriod();
          return (
            <AttendancePeriodModal
              defaultDateFrom={dateFrom}
              defaultDateTo={dateTo}
              actionLabel={pendingAction === 'generate' ? 'Generar Planilla' : 'Ver Vista Previa'}
              onConfirm={handlePeriodConfirm}
              onCancel={() => { setShowPeriodModal(false); setPendingAction(null); }}
            />
          );
        })()}

        {/* Modal Configuración Quincenal */}
        {showPayrollConfig && (
          <PayrollConfigModal onClose={() => setShowPayrollConfig(false)} />
        )}

        {/* Confirmación por trabajadores sin contrato aprobado */}
        {showContractAlert && (
          <ContractAlertModal
            noApproved={contractAlerts.noApproved}
            conflicts={contractAlerts.conflicts}
            employeesCount={(pendingGeneration || []).length}
            isSaving={createPayslipsMutation.isPending}
            onConfirm={handleConfirmContractAlert}
            onCancel={() => {
              setShowContractAlert(false);
              setPendingGeneration(null);
            }}
          />
        )}

        {/* Modal de Vista Previa de Boleta */}
        {previewPayslip && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-3 sm:p-6 overflow-y-auto"
            onClick={() => setPreviewPayslip(null)}
          >
            <div 
              className="max-w-4xl w-full my-4 sm:my-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex justify-end">
                <Button
                  onClick={() => setPreviewPayslip(null)}
                  variant="outline"
                  className="bg-white"
                >
                  ✕ Cerrar
                </Button>
              </div>
              <PayslipPreview 
                payslip={previewPayslip} 
                employee={allEmployees.find(e => e.id === previewPayslip.employee_id)}
                companyInfo={companyInfo}
                showPrintButton={true}
                conceptsMap={payrollConcepts}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}