import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
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
  Eye, CheckCircle, AlertCircle, Plus, Search, Lock, Edit2
} from "lucide-react";
import { usePermissions } from "../components/hooks/usePermissions";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import jsPDF from "jspdf";
import ConceptsManager from "../components/payroll/ConceptsManager";
import { createPageUrl } from "../utils";
import { PayrollCalculator } from "../components/payroll/PayrollCalculator";
import PayslipPreview from "../components/payroll/PayslipPreview";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function PayrollManagement() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;

  const { hasPermission, canAccessDepartment, loading: permissionsLoading } = usePermissions();

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

  const queryClient = useQueryClient();

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
  }, [currentUser]);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await entitiesAPI.Employee.filter({ status: "Activo" });
    },
  });

  const { data: existingPayslips = [] } = useQuery({
    queryKey: ["payslips", selectedMonth, selectedYear],
    queryFn: async () => {
      return await entitiesAPI.Payslip.filter({
        month: selectedMonth,
        year: selectedYear
      }, "-created_date");
    },
  });

  const { data: allPayslips = [] } = useQuery({
    queryKey: ["allPayslips"],
    queryFn: async () => {
      return await entitiesAPI.Payslip.list("-created_date", 500);
    },
  });

  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ["attendanceRecords", selectedMonth, selectedYear],
    queryFn: async () => {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0);

      const records = await entitiesAPI.AttendanceRecord.list("-date");
      return records.filter(r => {
        const recordDate = new Date(r.date);
        return recordDate >= startDate && recordDate <= endDate;
      });
    },
  });

  const { data: payrollConcepts = [] } = useQuery({
    queryKey: ["payrollConcepts", selectedMonth, selectedYear],
    queryFn: async () => {
      const allConcepts = await entitiesAPI.PayrollConcept.list();

      // Filtrar conceptos generales y específicos del mes/año
      return allConcepts.filter(c => {
        // Conceptos recurrentes
        if (c.is_recurring && !c.is_applied) return true;

        // Conceptos específicos del mes/año
        if (c.month === selectedMonth && c.year === selectedYear && !c.is_applied) return true;

        // Conceptos generales (sin mes/año específico)
        if (c.employee_id === "general" && !c.is_applied) return true;

        return false;
      });
    },
  });

  const { data: rmvData } = useQuery({
    queryKey: ["rmv"],
    queryFn: async () => {
      const rmvs = await entitiesAPI.RMV.filter({ is_active: true }, "-effective_date");
      return rmvs.length > 0 ? rmvs[0] : { amount: 1025 };
    },
  });

  const { data: companyInfo } = useQuery({
    queryKey: ["companyInfo"],
    queryFn: async () => {
      const companies = await entitiesAPI.CompanyInfo.filter({ is_active: true });
      return companies.length > 0 ? companies[0] : null;
    },
  });

  const createPayslipsMutation = useMutation({
    mutationFn: async (payslips) => {
      const createdPayslips = await entitiesAPI.Payslip.bulkCreate(payslips);

      // Marcar conceptos como aplicados
      const conceptsToUpdate = additionalConcepts.map(c => ({
        ...c,
        is_applied: true,
        payslip_id: createdPayslips.find(p => p.employee_id === c.employee_id)?.id
      }));

      if (conceptsToUpdate.length > 0) {
        await Promise.all(conceptsToUpdate.map(c =>
          entitiesAPI.PayrollConcept.create(c)
        ));
      }

      return createdPayslips;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["payrollConcepts"]);
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
      return await entitiesAPI.Payslip.update(id, { status });
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
      // Re-fetch para asegurar datos frescos
      const fresh = await base44.entities.Payslip.filter({ month, year, payroll_type: payrollType });
      const toApprove = fresh.filter(p => p.status !== "Aprobada" && p.status !== "Pagada");
      await Promise.all(toApprove.map(p => base44.entities.Payslip.update(p.id, { status: "Aprobada" })));
      return toApprove.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["allPayslips"]);
      toast.success(`✓ Planilla aprobada — ${count} boleta(s) actualizadas`);
    },
    onError: () => toast.error("Error al aprobar la planilla"),
  });

  // Aprobar y marcar como pagada planilla completa
  const payFullPayrollMutation = useMutation({
    mutationFn: async ({ year, month, payrollType }) => {
      const fresh = await base44.entities.Payslip.filter({ month, year, payroll_type: payrollType });
      const toPay = fresh.filter(p => p.status === "Aprobada");
      await Promise.all(toPay.map(p => base44.entities.Payslip.update(p.id, { status: "Pagada" })));
      return toPay.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["allPayslips"]);
      toast.success(`✓ Planilla marcada como pagada — ${count} boleta(s)`);
    },
    onError: () => toast.error("Error al marcar como pagada"),
  });

  // Eliminar un trabajador individual de una planilla ya generada
  const removeOnePayslipMutation = useMutation({
    mutationFn: async (payslipId) => {
      await base44.entities.Payslip.delete(payslipId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["allPayslips"]);
      toast.success("Trabajador eliminado de la planilla");
    },
    onError: () => toast.error("Error al eliminar el trabajador"),
  });

  const deletePayslipMutation = useMutation({
    mutationFn: async (id) => {
      return await entitiesAPI.Payslip.delete(id);
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

  const calculatePayroll = async () => {
    const payrollNumber = `${payrollType === "Quincenal" ? "Q" : payrollType === "Mensual" ? "M" : payrollType === "SNP" ? "SNP" : "A"}-${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

    // Filtrar empleados según búsqueda y departamento
    // let filteredEmployees = allEmployees;
    let filteredEmployees = getFilteredEmployees();

    // Filtrar por tipo de contrato si es SNP
    if (payrollType === "SNP") {
      filteredEmployees = filteredEmployees.filter(emp => emp.contract_type === "SNP");
    }

    if (searchTerm) {
      filteredEmployees = filteredEmployees.filter(emp =>
        emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (departmentFilter !== "all") {
      filteredEmployees = filteredEmployees.filter(emp => emp.department_name === departmentFilter);
    }

    // Excluir empleados que el usuario haya quitado
    filteredEmployees = filteredEmployees.filter(emp => !excludedEmployees.includes(emp.id));

    const payslipsData = await Promise.all(filteredEmployees.map(async (emp) => {
      // Preparar datos de asistencia
      const empAttendance = attendanceRecords.filter(r => r.employee_id === emp.id);
      const workedDays = payrollType === "Quincenal" ? 15 : empAttendance.filter(r => r.status === "Completo" || r.status === "Incompleto").length;

      const attendanceData = {
        worked_days: workedDays,
        regular_hours: empAttendance.reduce((sum, r) => sum + (r.worked_hours || 0), 0),
        overtime_hours: 0,
        horas_extras_25: 0,
        horas_extras_35: 0,
        horas_nocturnas: 0,
      };

      // Obtener conceptos del empleado (generales + específicos)
      const generalConcepts = payrollConcepts.filter(c => c.employee_id === "general");
      const specificConcepts = [...payrollConcepts, ...additionalConcepts].filter(c => c.employee_id === emp.id);
      const allEmpConcepts = [...generalConcepts, ...specificConcepts];

      // Usar el calculador automático
      const calculator = new PayrollCalculator(emp, selectedMonth, selectedYear, payrollType);
      const result = await calculator.calculatePayroll(allEmpConcepts, attendanceData, rmvData?.amount || 1025);

      // Calcular descuentos por asistencia (adicionales al sistema)
      const lateRecords = empAttendance.filter(r => r.is_late && r.late_minutes > 10);
      const absentRecords = empAttendance.filter(r => r.is_absent);
      const baseSalaryForCalc = payrollType === "Quincenal" ? (emp.base_salary || 0) / 2 : (emp.base_salary || 0);
      const tardinessDiscount = lateRecords.length * (baseSalaryForCalc / 30);
      const absenceDiscount = absentRecords.length * (baseSalaryForCalc / 30);

      // Buscar adelanto quincenal si es mensual
      let advanceDeduction = 0;
      let advancePaymentId = null;
      if (payrollType === "Mensual") {
        const quincenalPayslip = existingPayslips.find(p =>
          p.employee_id === emp.id &&
          p.payroll_type === "Quincenal" &&
          p.month === selectedMonth &&
          p.year === selectedYear
        );
        if (quincenalPayslip) {
          advanceDeduction = quincenalPayslip.net_pay || 0;
          advancePaymentId = quincenalPayslip.id;
        }
      }

      // Ajustar totales con descuentos adicionales
      const adjustedDeductions = result.totals.totalDeductions + tardinessDiscount + absenceDiscount + advanceDeduction;
      const adjustedNetPay = result.totals.totalIncome - adjustedDeductions;

      return {
        employee_id: emp.id,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        employee_code: emp.employee_code,
        department: emp.department_name,
        period: `${format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })}`,
        month: selectedMonth,
        year: selectedYear,
        payroll_type: payrollType,
        payroll_number: payrollNumber,
        advance_payment_id: advancePaymentId,
        worked_days: workedDays,
        base_salary: result.context.base_salary,
        family_allowance: 0,
        overtime_pay: 0,
        bonuses: result.totals.totalIncome - result.context.base_salary,
        commissions: 0,
        other_income: 0,
        total_income: result.totals.totalIncome,
        pension_deduction: result.deductions.find(d => d.concept_name.includes("AFP") || d.concept_name === "ONP")?.calculated_amount || 0,
        health_insurance: 0,
        income_tax: result.deductions.find(d => d.concept_name.includes("Renta"))?.calculated_amount || 0,
        tardiness_discount: tardinessDiscount,
        absence_discount: absenceDiscount,
        loan_deduction: 0,
        advance_deduction: advanceDeduction,
        other_deductions: result.totals.totalDeductions,
        total_deductions: adjustedDeductions,
        net_pay: adjustedNetPay,
        payment_date: format(new Date(selectedYear, selectedMonth - 1, payrollType === "Quincenal" ? 15 : 30), "yyyy-MM-dd"),
        status: "Generada",
        calculation_summary: result.summary,
        calculation_log: result.calculationLog,
        has_errors: result.errors.length > 0,
        errors: result.errors,
      };
    }));

    setPreviewData(payslipsData);
    setShowPreview(true);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.text("Planilla de Pagos", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(12);
    doc.text(`Tipo: ${payrollType}`, 14, 35);
    doc.text(`Periodo: ${format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })}`, 14, 42);

    let yPos = 55;
    previewData.forEach((payslip, index) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(`${payslip.employee_code} - ${payslip.employee_name}`, 14, yPos);
      doc.setFont(undefined, 'normal');

      doc.text(`Salario Base: S/ ${payslip.base_salary.toFixed(2)}`, 14, yPos + 6);
      doc.text(`Total Descuentos: S/ ${payslip.total_deductions.toFixed(2)}`, 100, yPos + 6);
      doc.text(`Neto a Pagar: S/ ${payslip.net_pay.toFixed(2)}`, 14, yPos + 12);

      doc.line(14, yPos + 16, pageWidth - 14, yPos + 16);
      yPos += 22;
    });

    const totalNeto = previewData.reduce((sum, p) => sum + p.net_pay, 0);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total General: S/ ${totalNeto.toFixed(2)}`, 14, yPos + 5);

    doc.save(`Planilla_${payrollType}_${selectedMonth}_${selectedYear}.pdf`);
    toast.success("PDF generado exitosamente");
  };

  const handleGeneratePayroll = () => {
    const payslipsToCreate = previewData.map(p => {
      const { employee_name, employee_code, department, ...rest } = p;
      return rest;
    });
    createPayslipsMutation.mutate(payslipsToCreate);
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

    // Empleados que están en el filtro pero no en la preview
    let baseEmployees = allEmployees;

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

  const filteredPayslips = existingPayslips.filter(p => {
    const emp = allEmployees.find(e => e.id === p.employee_id);
    if (!emp) return false;

    const matchesSearch = searchTerm ? (
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
    ) : true;

    const matchesDept = departmentFilter === "all" || emp.department_name === departmentFilter;

    return matchesSearch && matchesDept;
  });

  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  const stats = {
    quincenal: existingPayslips.filter(p => p.payroll_type === "Quincenal").length,
    mensual: existingPayslips.filter(p => p.payroll_type === "Mensual").length,
    adicional: existingPayslips.filter(p => p.payroll_type === "Adicional").length,
    snp: existingPayslips.filter(p => p.payroll_type === "SNP").length,
    total: existingPayslips.reduce((sum, p) => sum + (p.net_pay || 0), 0),
  };

  const getLatestPayslipsByMonth = () => {
    const grouped = {};
    allPayslips.forEach(p => {
      const key = `${p.year}-${p.month}-${p.payroll_type}`;
      if (!grouped[key] || new Date(p.created_date) > new Date(grouped[key].created_date)) {
        grouped[key] = p;
      }
    });
    return Object.values(grouped);
  };

  const handleDeletePayroll = async () => {
    if (!selectedPayrollToDelete) return;

    const toDelete = allPayslips.filter(p =>
      p.year === selectedPayrollToDelete.year &&
      p.month === selectedPayrollToDelete.month &&
      p.payroll_type === selectedPayrollToDelete.type
    );

    try {
      await Promise.all(toDelete.map(p => entitiesAPI.Payslip.delete(p.id)));
      queryClient.invalidateQueries(["payslips"]);
      queryClient.invalidateQueries(["allPayslips"]);
      toast.success(`${toDelete.length} planilla(s) eliminada(s)`);
      setSelectedPayrollToDelete(null);
    } catch (error) {
      toast.error("Error al eliminar las planillas");
      console.error(error);
    }
  };

  const generatePayslipPDF = async (payslip, employee) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(16);
    doc.text("BOLETA DE PAGO", pageWidth / 2, 20, { align: "center" });

    // Employee Info
    doc.setFontSize(10);
    doc.text(`Empleado: ${employee.first_name} ${employee.last_name}`, 14, 35);
    doc.text(`Código: ${employee.employee_code}`, 14, 42);
    doc.text(`Periodo: ${payslip.period}`, 14, 49);
    doc.text(`Tipo: ${payslip.payroll_type}`, 120, 49);

    // Income
    let yPos = 65;
    doc.setFont(undefined, 'bold');
    doc.text("INGRESOS", 14, yPos);
    doc.setFont(undefined, 'normal');
    yPos += 7;
    doc.text(`Salario Base:`, 14, yPos);
    doc.text(`S/ ${payslip.base_salary.toFixed(2)}`, 160, yPos, { align: "right" });
    yPos += 7;
    doc.text(`Total Ingresos:`, 14, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(`S/ ${payslip.total_income.toFixed(2)}`, 160, yPos, { align: "right" });

    // Deductions
    yPos += 15;
    doc.setFont(undefined, 'bold');
    doc.text("DESCUENTOS", 14, yPos);
    doc.setFont(undefined, 'normal');
    yPos += 7;
    if (payslip.pension_deduction > 0) {
      doc.text(`Pensiones:`, 14, yPos);
      doc.text(`S/ ${payslip.pension_deduction.toFixed(2)}`, 160, yPos, { align: "right" });
      yPos += 7;
    }
    if (payslip.income_tax > 0) {
      doc.text(`Renta 5ta:`, 14, yPos);
      doc.text(`S/ ${payslip.income_tax.toFixed(2)}`, 160, yPos, { align: "right" });
      yPos += 7;
    }
    doc.text(`Total Descuentos:`, 14, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(`S/ ${payslip.total_deductions.toFixed(2)}`, 160, yPos, { align: "right" });

    // Net Pay
    yPos += 15;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text("NETO A PAGAR:", 14, yPos);
    doc.text(`S/ ${payslip.net_pay.toFixed(2)}`, 160, yPos, { align: "right" });

    doc.save(`Boleta_${employee.employee_code}_${payslip.period}.pdf`);
    toast.success("Boleta generada");
  };

  const generateMassivePayslipsPDF = async (payslips) => {
    for (const payslip of payslips) {
      const emp = allEmployees.find(e => e.id === payslip.employee_id);
      if (emp) {
        await generatePayslipPDF(payslip, emp);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    toast.success(`${payslips.length} boletas generadas`);
  };

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
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Gestión de Planillas
          </h1>
          <p className="text-slate-600 text-lg">
            Generar y administrar planillas quincenales, mensuales y adicionales
          </p>
        </div>

        {/* Stats Cards */}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left - Generator */}
          <div className="lg:col-span-1">
            <Card className="border-0 shadow-lg sticky top-8">
              <CardHeader className="border-b">
                <CardTitle className="text-xl font-bold">Generar Planilla</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div>
                  <Label>Tipo de Planilla</Label>
                  <Select value={payrollType} onValueChange={setPayrollType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Quincenal">Quincenal (Adelanto)</SelectItem>
                      <SelectItem value="Mensual">Mensual (Final)</SelectItem>
                      <SelectItem value="Adicional">Adicional (Extraordinaria)</SelectItem>
                      <SelectItem value="SNP">SNP (Servicios No Personales)</SelectItem>
                    </SelectContent>
                  </Select>
                  {payrollType === "Quincenal" && (
                    <p className="text-xs text-amber-600 mt-1">
                      Se pagará el 50% del salario base
                    </p>
                  )}
                  {payrollType === "Mensual" && (
                    <p className="text-xs text-blue-600 mt-1">
                      Se descontará el adelanto quincenal si existe
                    </p>
                  )}
                </div>

                <div>
                  <Label>Mes</Label>
                  <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {format(new Date(2024, i), 'MMMM', { locale: es })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Año</Label>
                  <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2023, 2024, 2025, 2026].map(year => (
                        <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Departamento</Label>
                  <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {departments.map(dept => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Buscar Empleado</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      placeholder="Nombre o código..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {canCreate && (
                  <Button
                    onClick={calculatePayroll}
                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Vista Previa
                  </Button>
                )}

                <div className="pt-4 border-t">
                  <Button
                    onClick={() => window.location.href = createPageUrl("PayrollConcepts")}
                    variant="outline"
                    className="w-full"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Gestionar Conceptos
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right - Preview or History */}
          <div className="lg:col-span-2">
            {showPreview ? (
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold">Vista Previa de Planilla</CardTitle>
                      <p className="text-sm text-slate-600 mt-1">
                        {payrollType} - {format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)}>
                      ✕
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="mb-6 flex gap-3">
                    <Button
                      onClick={generatePDF}
                      variant="outline"
                      className="flex-1"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar PDF
                    </Button>
                    <Button
                      onClick={handleGeneratePayroll}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={createPayslipsMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {createPayslipsMutation.isPending ? "Generando..." : "Confirmar y Generar"}
                    </Button>
                  </div>

                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {previewData.map((payslip, index) => {
                      const empConcepts = [...payrollConcepts, ...additionalConcepts].filter(c => c.employee_id === payslip.employee_id);
                      const hasAdditionalConcepts = empConcepts.length > 0;
                      const hasCalculationErrors = payslip.has_errors;

                      return (
                        <div key={index} className={`p-4 border rounded-lg ${hasCalculationErrors ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-slate-900">
                                  {payslip.employee_code} - {payslip.employee_name}
                                </h4>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setShowConceptsFor(showConceptsFor === payslip.employee_id ? null : payslip.employee_id)}
                                >
                                  <Edit2 className="w-3 h-3 mr-1" />
                                  Conceptos
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPreviewPayslip(payslip)}
                                  className="bg-blue-50 hover:bg-blue-100"
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  Ver Boleta
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRemoveEmployee(payslip.employee_id)}
                                  className="text-red-600 hover:bg-red-50"
                                >
                                  ✕ Quitar
                                </Button>
                              </div>
                              <p className="text-sm text-slate-600">{payslip.department}</p>
                            </div>
                            <Badge className="bg-indigo-100 text-indigo-700">
                              {payslip.worked_days} días
                            </Badge>
                          </div>

                          {showConceptsFor === payslip.employee_id && (
                            <div className="mb-3">
                              <ConceptsManager
                                employeeId={payslip.employee_id}
                                employeeName={payslip.employee_name}
                                month={selectedMonth}
                                year={selectedYear}
                                concepts={additionalConcepts}
                                onAdd={(concept) => setAdditionalConcepts([...additionalConcepts, concept])}
                                onRemove={(idx) => {
                                  const filtered = additionalConcepts.filter((_, i) => i !== idx);
                                  setAdditionalConcepts(filtered);
                                  // Recalcular planilla
                                  setTimeout(() => calculatePayroll(), 100);
                                }}
                              />
                            </div>
                          )}

                          {canViewAmounts ? (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-slate-600">Salario Base</p>
                                <p className="font-semibold text-slate-900">
                                  S/ {payslip.base_salary.toFixed(2)}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-600">Total Ingresos</p>
                                <p className="font-semibold text-green-600">
                                  S/ {payslip.total_income.toFixed(2)}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-600">Descuentos</p>
                                <p className="font-semibold text-red-600">
                                  -S/ {payslip.total_deductions.toFixed(2)}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-600 font-bold">Neto a Pagar</p>
                                <p className="font-bold text-indigo-600 text-lg">
                                  S/ {payslip.net_pay.toFixed(2)}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 bg-slate-100 rounded-lg text-center">
                              <p className="text-sm text-slate-600">
                                🔒 Sin permisos para ver montos
                              </p>
                            </div>
                          )}

                          {payslip.advance_deduction > 0 && (
                            <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                              Adelanto descontado: S/ {payslip.advance_deduction.toFixed(2)}
                            </div>
                          )}

                          {hasAdditionalConcepts && (
                            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                              ✓ {empConcepts.length} concepto(s) adicional(es) aplicado(s)
                            </div>
                          )}

                          {hasCalculationErrors && (
                            <div className="mt-3 p-2 bg-red-50 border border-red-300 rounded">
                              <p className="text-xs font-semibold text-red-800 mb-1">
                                ⚠️ Errores en el cálculo:
                              </p>
                              {payslip.errors.map((err, idx) => (
                                <p key={idx} className="text-xs text-red-700">
                                  • {err.formula}: {err.error}
                                </p>
                              ))}
                            </div>
                          )}

                          {payslip.calculation_summary && (
                            <details className="mt-3">
                              <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900">
                                Ver resumen detallado de cálculos
                              </summary>
                              <div className="mt-2 p-3 bg-slate-50 rounded text-xs space-y-2">
                                <div>
                                  <p className="font-semibold text-slate-900 mb-1">Ingresos ({payslip.calculation_summary.breakdown.incomes.count}):</p>
                                  {payslip.calculation_summary.breakdown.incomes.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-slate-700 ml-2">
                                      <span>{item.name} {item.formula && `(${item.formula})`}</span>
                                      <span className="font-semibold">S/ {item.amount.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900 mb-1">Descuentos ({payslip.calculation_summary.breakdown.deductions.count}):</p>
                                  {payslip.calculation_summary.breakdown.deductions.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-slate-700 ml-2">
                                      <span>{item.name} {item.formula && `(${item.formula})`}</span>
                                      <span className="font-semibold">S/ {item.amount.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                                {payslip.calculation_summary.breakdown.contributions.count > 0 && (
                                  <div>
                                    <p className="font-semibold text-slate-900 mb-1">Aportes Empleador ({payslip.calculation_summary.breakdown.contributions.count}):</p>
                                    {payslip.calculation_summary.breakdown.contributions.items.map((item, idx) => (
                                      <div key={idx} className="flex justify-between text-slate-700 ml-2">
                                        <span>{item.name} {item.formula && `(${item.formula})`}</span>
                                        <span className="font-semibold">S/ {item.amount.toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {canViewAmounts && (
                    <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-lg">Total General:</span>
                        <span className="font-bold text-indigo-600 text-2xl">
                          S/ {previewData.reduce((sum, p) => sum + p.net_pay, 0).toFixed(2)}
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
                          const statusGroup = planillasDelTipo[0]?.status || "Generada";
                          const totalNeto = planillasDelTipo.reduce((s, p) => s + (p.net_pay || 0), 0);
                          const totalIngresos = planillasDelTipo.reduce((s, p) => s + (p.total_income || 0), 0);
                          const totalDesc = planillasDelTipo.reduce((s, p) => s + (p.total_deductions || 0), 0);
                          const allPagada   = planillasDelTipo.every(p => p.status === "Pagada");
                          const allAprobada = !allPagada && planillasDelTipo.every(p => p.status === "Aprobada");
                          const puedeAprobar = !allPagada && !allAprobada;
                          const hayMixto = !allPagada && !allAprobada && planillasDelTipo.some(p => p.status === "Aprobada");

                          const statusBadgeColor =
                            allPagada   ? "bg-green-100 text-green-700 border-green-200" :
                            allAprobada ? "bg-blue-100 text-blue-700 border-blue-200" :
                            "bg-yellow-100 text-yellow-700 border-yellow-200";
                          const statusLabel =
                            allPagada ? "✓ Pagada" : allAprobada ? "✓ Aprobada" : "Generada";

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
                                            {emp.employee_code} — {emp.first_name} {emp.last_name}
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
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b">
                  <CardTitle className="text-xl font-bold">Histórico de Planillas</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex gap-4 mb-6 flex-wrap">
                    <div className="flex-1 min-w-[200px] relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <Input
                        placeholder="Buscar empleado..."
                        value={historySearchTerm}
                        onChange={(e) => setHistorySearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select value={String(historyYearFilter)} onValueChange={(v) => setHistoryYearFilter(parseInt(v))}>
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="Año" />
                      </SelectTrigger>
                      <SelectContent>
                        {[2023, 2024, 2025, 2026].map(year => (
                          <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={historyMonthFilter} onValueChange={setHistoryMonthFilter}>
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Mes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los meses</SelectItem>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            {format(new Date(2024, i), 'MMMM', { locale: es })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={historyTypeFilter} onValueChange={setHistoryTypeFilter}>
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="Quincenal">Quincenal</SelectItem>
                        <SelectItem value="Mensual">Mensual</SelectItem>
                        <SelectItem value="Adicional">Adicional</SelectItem>
                        <SelectItem value="SNP">SNP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(() => {
                    const latestPayslips = getLatestPayslipsByMonth();
                    const filtered = latestPayslips.filter(p => {
                      if (p.year !== historyYearFilter) return false;
                      if (historyMonthFilter !== "all" && p.month !== parseInt(historyMonthFilter)) return false;
                      if (historyTypeFilter !== "all" && p.payroll_type !== historyTypeFilter) return false;
                      if (historySearchTerm) {
                        const emp = allEmployees.find(e => e.id === p.employee_id);
                        if (!emp) return false;
                        const searchLower = historySearchTerm.toLowerCase();
                        return (
                          emp.first_name.toLowerCase().includes(searchLower) ||
                          emp.last_name.toLowerCase().includes(searchLower) ||
                          emp.employee_code.toLowerCase().includes(searchLower)
                        );
                      }
                      return true;
                    });

                    // Group by month and type
                    const grouped = {};
                    filtered.forEach(p => {
                      const key = `${p.year}-${p.month}-${p.payroll_type}`;
                      if (!grouped[key]) {
                        grouped[key] = {
                          year: p.year,
                          month: p.month,
                          type: p.payroll_type,
                          payslips: []
                        };
                      }
                      grouped[key].payslips.push(p);
                    });

                    const groups = Object.values(grouped).sort((a, b) => {
                      if (a.year !== b.year) return b.year - a.year;
                      if (a.month !== b.month) return b.month - a.month;
                      return a.type.localeCompare(b.type);
                    });

                    return groups.length === 0 ? (
                      <div className="text-center py-12">
                        <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-600">No se encontraron planillas</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {groups.map((group, idx) => {
                          const allGroupPayslips = allPayslips.filter(p =>
                            p.year === group.year &&
                            p.month === group.month &&
                            p.payroll_type === group.type
                          );
                          const total = allGroupPayslips.reduce((sum, p) => sum + (p.net_pay || 0), 0);
                          const isSelected = selectedPayrollToDelete?.year === group.year &&
                                            selectedPayrollToDelete?.month === group.month &&
                                            selectedPayrollToDelete?.type === group.type;

                          return (
                            <Card key={`${group.year}-${group.month}-${group.type}`} className={`border-2 ${isSelected ? 'border-red-400 bg-red-50' : ''}`}>
                              <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => setSelectedPayrollToDelete(isSelected ? null : group)}
                                      className="w-5 h-5 rounded border-slate-300"
                                    />
                                    <div>
                                      <h3 className="text-lg font-bold text-slate-900">
                                        {format(new Date(group.year, group.month - 1), 'MMMM yyyy', { locale: es })} - {group.type}
                                      </h3>
                                      <p className="text-sm text-slate-600">
                                        {allGroupPayslips.length} empleado(s)
                                        {canViewAmounts && ` • Total: S/ ${total.toFixed(2)}`}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const emp = allEmployees.find(e => e.id === allGroupPayslips[0].employee_id);
                                        if (emp) generatePayslipPDF(allGroupPayslips[0], emp);
                                      }}
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Boleta Individual
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => generateMassivePayslipsPDF(allGroupPayslips)}
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Todas las Boletas
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const doc = new jsPDF();
                                        doc.text(`Planilla ${group.type}`, 14, 20);
                                        doc.text(`${format(new Date(group.year, group.month - 1), 'MMMM yyyy', { locale: es })}`, 14, 28);
                                        let y = 40;
                                        allGroupPayslips.forEach(p => {
                                          const emp = allEmployees.find(e => e.id === p.employee_id);
                                          if (emp) {
                                            doc.text(`${emp.employee_code} - ${emp.first_name} ${emp.last_name}`, 14, y);
                                            doc.text(`S/ ${p.net_pay.toFixed(2)}`, 160, y, { align: "right" });
                                            y += 7;
                                          }
                                        });
                                        doc.save(`Planilla_${group.type}_${group.year}_${group.month}.pdf`);
                                      }}
                                    >
                                      <FileText className="w-3 h-3 mr-1" />
                                      Resumen PDF
                                    </Button>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  {allGroupPayslips.slice(0, 5).map(p => {
                                    const emp = allEmployees.find(e => e.id === p.employee_id);
                                    return emp ? (
                                      <div key={p.id} className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded">
                                        <span>{emp.employee_code} - {emp.first_name} {emp.last_name}</span>
                                        {canViewAmounts ? (
                                          <span className="font-semibold">S/ {p.net_pay.toFixed(2)}</span>
                                        ) : (
                                          <span className="text-slate-400">🔒</span>
                                        )}
                                      </div>
                                    ) : null;
                                  })}
                                  {allGroupPayslips.length > 5 && (
                                    <p className="text-xs text-slate-500 text-center">
                                      y {allGroupPayslips.length - 5} más...
                                    </p>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {selectedPayrollToDelete && (
                    <div className="mt-6 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-red-900 mb-1">
                            ⚠️ Planilla seleccionada para eliminar
                          </p>
                          <p className="text-sm text-red-700">
                            {format(new Date(selectedPayrollToDelete.year, selectedPayrollToDelete.month - 1), 'MMMM yyyy', { locale: es })} - {selectedPayrollToDelete.type}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedPayrollToDelete(null)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700"
                            onClick={handleDeletePayroll}
                          >
                            Confirmar Eliminación
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
            )}
          </div>
        </div>

        {/* Modal de Vista Previa de Boleta */}
        {previewPayslip && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
            onClick={() => setPreviewPayslip(null)}
          >
            <div
              className="max-w-4xl w-full my-8"
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
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
