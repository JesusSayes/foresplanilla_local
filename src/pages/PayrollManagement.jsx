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
  Eye, CheckCircle, AlertCircle, Plus, Search
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import jsPDF from "jspdf";

export default function PayrollManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [payrollType, setPayrollType] = useState("Mensual");
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");

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

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await base44.entities.Employee.filter({ status: "Activo" });
    },
  });

  const { data: existingPayslips = [] } = useQuery({
    queryKey: ["payslips", selectedMonth, selectedYear],
    queryFn: async () => {
      return await base44.entities.Payslip.filter({ 
        month: selectedMonth,
        year: selectedYear
      }, "-created_date");
    },
  });

  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ["attendanceRecords", selectedMonth, selectedYear],
    queryFn: async () => {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0);
      
      const records = await base44.entities.AttendanceRecord.list("-date");
      return records.filter(r => {
        const recordDate = new Date(r.date);
        return recordDate >= startDate && recordDate <= endDate;
      });
    },
  });

  const createPayslipsMutation = useMutation({
    mutationFn: async (payslips) => {
      return await base44.entities.Payslip.bulkCreate(payslips);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payslips"]);
      toast.success("Planilla generada exitosamente");
      setShowPreview(false);
      setPreviewData([]);
    },
    onError: (error) => {
      toast.error("Error al generar la planilla");
      console.error(error);
    },
  });

  const calculatePayroll = async () => {
    const payrollNumber = `${payrollType === "Quincenal" ? "Q" : payrollType === "Mensual" ? "M" : "A"}-${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
    
    // Filtrar empleados según búsqueda y departamento
    let filteredEmployees = allEmployees;
    
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

    const payslipsData = await Promise.all(filteredEmployees.map(async (emp) => {
      // Calcular días trabajados
      const empAttendance = attendanceRecords.filter(r => r.employee_id === emp.id);
      const workedDays = payrollType === "Quincenal" ? 15 : empAttendance.filter(r => r.status === "Completo" || r.status === "Incompleto").length;
      
      // Salario base proporcional
      let baseSalary = emp.base_salary || 0;
      if (payrollType === "Quincenal") {
        baseSalary = baseSalary / 2;
      }

      // Calcular descuentos por asistencia
      const lateRecords = empAttendance.filter(r => r.is_late && r.late_minutes > 10);
      const absentRecords = empAttendance.filter(r => r.is_absent);
      const tardinessDiscount = lateRecords.length * (baseSalary / 30);
      const absenceDiscount = absentRecords.length * (baseSalary / 30);

      // AFP/ONP (aproximado 13%)
      const pensionDeduction = baseSalary * 0.13;
      
      // Seguro de salud (aproximado 9%)
      const healthInsurance = baseSalary * 0.09;

      // Total ingresos
      const totalIncome = baseSalary;

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

      // Total descuentos
      const totalDeductions = pensionDeduction + healthInsurance + tardinessDiscount + absenceDiscount + advanceDeduction;

      // Neto a pagar
      const netPay = totalIncome - totalDeductions;

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
        base_salary: baseSalary,
        family_allowance: 0,
        overtime_pay: 0,
        bonuses: 0,
        commissions: 0,
        other_income: 0,
        total_income: totalIncome,
        pension_deduction: pensionDeduction,
        health_insurance: healthInsurance,
        income_tax: 0,
        tardiness_discount: tardinessDiscount,
        absence_discount: absenceDiscount,
        loan_deduction: 0,
        advance_deduction: advanceDeduction,
        other_deductions: 0,
        total_deductions: totalDeductions,
        net_pay: netPay,
        payment_date: format(new Date(selectedYear, selectedMonth - 1, payrollType === "Quincenal" ? 15 : 30), "yyyy-MM-dd"),
        status: "Calculada",
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
    total: existingPayslips.reduce((sum, p) => sum + (p.net_pay || 0), 0),
  };

  if (!employee || employee.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden gestionar planillas</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.quincenal}
              </div>
              <p className="text-slate-600 text-sm">Planillas Quincenales</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <Calendar className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.mensual}
              </div>
              <p className="text-slate-600 text-sm">Planillas Mensuales</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Plus className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.adicional}
              </div>
              <p className="text-slate-600 text-sm">Planillas Adicionales</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-blue-50">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <DollarSign className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                S/ {stats.total.toFixed(2)}
              </div>
              <p className="text-slate-600 text-sm">Total Planillas</p>
            </CardContent>
          </Card>
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

                <Button
                  onClick={calculatePayroll}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Vista Previa
                </Button>
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
                    {previewData.map((payslip, index) => (
                      <div key={index} className="p-4 border border-slate-200 rounded-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-bold text-slate-900">
                              {payslip.employee_code} - {payslip.employee_name}
                            </h4>
                            <p className="text-sm text-slate-600">{payslip.department}</p>
                          </div>
                          <Badge className="bg-indigo-100 text-indigo-700">
                            {payslip.worked_days} días
                          </Badge>
                        </div>

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

                        {payslip.advance_deduction > 0 && (
                          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                            Adelanto descontado: S/ {payslip.advance_deduction.toFixed(2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

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
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b">
                  <CardTitle className="text-xl font-bold">
                    Planillas del Periodo
                  </CardTitle>
                  <p className="text-sm text-slate-600 mt-1">
                    {format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })}
                  </p>
                </CardHeader>
                <CardContent className="p-6">
                  {filteredPayslips.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                      <p className="text-slate-600">No hay planillas generadas para este periodo</p>
                    </div>
                  ) : (
                    <Tabs defaultValue="all" className="space-y-4">
                      <TabsList>
                        <TabsTrigger value="all">Todas</TabsTrigger>
                        <TabsTrigger value="Quincenal">Quincenales</TabsTrigger>
                        <TabsTrigger value="Mensual">Mensuales</TabsTrigger>
                        <TabsTrigger value="Adicional">Adicionales</TabsTrigger>
                      </TabsList>

                      {["all", "Quincenal", "Mensual", "Adicional"].map(type => (
                        <TabsContent key={type} value={type}>
                          <div className="space-y-3">
                            {filteredPayslips
                              .filter(p => type === "all" || p.payroll_type === type)
                              .map(payslip => {
                                const emp = allEmployees.find(e => e.id === payslip.employee_id);
                                if (!emp) return null;

                                return (
                                  <div key={payslip.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                          <h4 className="font-bold text-slate-900">
                                            {emp.employee_code} - {emp.first_name} {emp.last_name}
                                          </h4>
                                          <Badge className={
                                            payslip.payroll_type === "Quincenal" ? "bg-blue-100 text-blue-700" :
                                            payslip.payroll_type === "Mensual" ? "bg-green-100 text-green-700" :
                                            "bg-purple-100 text-purple-700"
                                          }>
                                            {payslip.payroll_type}
                                          </Badge>
                                          <Badge className={
                                            payslip.status === "Calculada" ? "bg-yellow-100 text-yellow-700" :
                                            payslip.status === "Aprobada" ? "bg-blue-100 text-blue-700" :
                                            "bg-green-100 text-green-700"
                                          }>
                                            {payslip.status}
                                          </Badge>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4 text-sm">
                                          <div>
                                            <p className="text-slate-600">Neto a Pagar</p>
                                            <p className="font-bold text-indigo-600">
                                              S/ {payslip.net_pay.toFixed(2)}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-slate-600">Días Trabajados</p>
                                            <p className="font-semibold text-slate-900">{payslip.worked_days}</p>
                                          </div>
                                          <div>
                                            <p className="text-slate-600">Fecha de Pago</p>
                                            <p className="font-semibold text-slate-900">
                                              {format(new Date(payslip.payment_date), 'dd/MM/yyyy')}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}