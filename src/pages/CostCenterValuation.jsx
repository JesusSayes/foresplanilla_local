import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, Download, FileSpreadsheet, Search, Calendar,
  Building2, Users, TrendingUp, ArrowLeft
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import { createPageUrl } from "../utils";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function CostCenterValuation() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
  }, [currentUser]);

  const { data: costCenters = [] } = useQuery({
    queryKey: ["costCenters"],
    queryFn: () => entitiesAPI.CostCenter.list("code"),
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["costCenterAssignments"],
    queryFn: () => entitiesAPI.CostCenterAssignment.list("-created_date"),
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: () => entitiesAPI.Employee.list("first_name"),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const allDepts = await entitiesAPI.Department.list("name");
      return allDepts.filter(d => d.is_active);
    },
  });

  // Calcular valorización por centro de costo
  const valuationData = useMemo(() => {
    const data = [];

    costCenters.forEach(cc => {
      if (!cc.is_active) return;

      const ccAssignments = assignments.filter(a =>
        a.cost_center_id === cc.id &&
        a.is_active &&
        (!a.end_date || new Date(a.end_date) >= new Date())
      );

      let totalSalary = 0;
      const employeeDetails = [];
      const departmentDetails = [];

      // Asignaciones individuales de empleados
      ccAssignments
        .filter(a => a.assignment_type === "Empleado")
        .forEach(assignment => {
          const emp = allEmployees.find(e => e.id === assignment.employee_id);
          if (emp && emp.status === "Activo" && emp.base_salary) {
            const salaryPortion = (emp.base_salary * assignment.percentage) / 100;
            totalSalary += salaryPortion;
            employeeDetails.push({
              code: emp.employee_code,
              name: `${emp.first_name} ${emp.last_name}`,
              position: emp.position,
              salary: emp.base_salary,
              percentage: assignment.percentage,
              allocated: salaryPortion,
              department: emp.department_name,
            });
          }
        });

      // Asignaciones por departamento
      ccAssignments
        .filter(a => a.assignment_type === "Departamento")
        .forEach(assignment => {
          const deptEmployees = allEmployees.filter(e =>
            e.department_name === assignment.department_name &&
            e.status === "Activo" &&
            e.base_salary
          );

          deptEmployees.forEach(emp => {
            const salaryPortion = (emp.base_salary * assignment.percentage) / 100;
            totalSalary += salaryPortion;
            departmentDetails.push({
              code: emp.employee_code,
              name: `${emp.first_name} ${emp.last_name}`,
              position: emp.position,
              salary: emp.base_salary,
              percentage: assignment.percentage,
              allocated: salaryPortion,
              department: emp.department_name,
              assignmentType: "Departamental",
            });
          });
        });

      const allDetails = [...employeeDetails, ...departmentDetails];

      if (allDetails.length > 0 || totalSalary > 0) {
        data.push({
          costCenter: cc,
          totalSalary,
          employeeCount: allDetails.length,
          details: allDetails,
        });
      }
    });

    return data.sort((a, b) => b.totalSalary - a.totalSalary);
  }, [costCenters, assignments, allEmployees]);

  const filteredData = valuationData.filter(item => {
    const matchesSearch =
      item.costCenter.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.costCenter.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.costCenter.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalValorizado = filteredData.reduce((sum, item) => sum + item.totalSalary, 0);
  const totalEmployees = filteredData.reduce((sum, item) => sum + item.employeeCount, 0);

  const exportToExcel = () => {
    const worksheets = {};

    // Hoja resumen
    const summaryData = filteredData.map(item => ({
      'Centro de Costo': item.costCenter.code,
      'Nombre': item.costCenter.name,
      'Categoría': item.costCenter.category,
      'N° Empleados': item.employeeCount,
      'Total Valorizado': item.totalSalary.toFixed(2),
    }));

    worksheets['Resumen'] = XLSX.utils.json_to_sheet(summaryData);

    // Hoja detallada
    const detailData = [];
    filteredData.forEach(item => {
      item.details.forEach(detail => {
        detailData.push({
          'Centro Costo': item.costCenter.code,
          'Nombre CC': item.costCenter.name,
          'Categoría': item.costCenter.category,
          'Código Empleado': detail.code,
          'Empleado': detail.name,
          'Cargo': detail.position,
          'Departamento': detail.department,
          'Sueldo Base': detail.salary.toFixed(2),
          'Porcentaje': detail.percentage,
          'Monto Asignado': detail.allocated.toFixed(2),
          'Tipo': detail.assignmentType || "Individual",
        });
      });
    });

    worksheets['Detalle'] = XLSX.utils.json_to_sheet(detailData);

    const wb = XLSX.utils.book_new();
    Object.keys(worksheets).forEach(name => {
      XLSX.utils.book_append_sheet(wb, worksheets[name], name);
    });

    XLSX.writeFile(wb, `CentrosCosto_Valorizado_${selectedMonth}.xlsx`);
    toast.success("Archivo Excel generado para sistema contable");
  };

  const categories = ["Administración", "Ventas", "Transportes", "Oxapampa", "Lima - VES", "Operaciones Generales"];

  if (!employee || (employee.role !== "admin" && employee.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden ver la valorización</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Button
              variant="outline"
              onClick={() => window.location.href = createPageUrl("CostCenterManagement")}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver a Gestión
            </Button>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Consulta Valorizada de Centros de Costo
            </h1>
            <p className="text-slate-600 text-lg">
              Valorización con sueldos para exportar a sistema contable
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-lg shadow-sm">
            <DollarSign className="w-5 h-5" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold">S/ {totalValorizado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
              <span className="text-sm text-indigo-100">Total Valorizado</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Building2 className="w-5 h-5 text-blue-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{filteredData.length}</span>
              <span className="text-sm text-slate-600">Centros de Costo</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Users className="w-5 h-5 text-purple-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{totalEmployees}</span>
              <span className="text-sm text-slate-600">Empleados Asignados</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">S/ {totalEmployees > 0 ? (totalValorizado / totalEmployees).toFixed(2) : '0.00'}</span>
              <span className="text-sm text-slate-600">Promedio por Empleado</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-lg mb-8">
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-64 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <Input
                  placeholder="Buscar centro de costo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-slate-400" />
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-48"
                />
              </div>
              <Button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar para Contable
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Valorización Table */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle>Detalle de Valorización por Centro de Costo</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {filteredData.map(item => (
                <div key={item.costCenter.id} className="border-2 border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-lg">
                          <Building2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-900">
                            {item.costCenter.code} - {item.costCenter.name}
                          </h3>
                          <p className="text-sm text-slate-600">{item.costCenter.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-indigo-600">
                          S/ {item.totalSalary.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </div>
                        <p className="text-sm text-slate-600">{item.employeeCount} empleados</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="text-left p-2 font-semibold text-slate-700">Código</th>
                            <th className="text-left p-2 font-semibold text-slate-700">Empleado</th>
                            <th className="text-left p-2 font-semibold text-slate-700">Cargo</th>
                            <th className="text-left p-2 font-semibold text-slate-700">Departamento</th>
                            <th className="text-right p-2 font-semibold text-slate-700">Sueldo Base</th>
                            <th className="text-center p-2 font-semibold text-slate-700">%</th>
                            <th className="text-right p-2 font-semibold text-slate-700">Monto Asignado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.details.map((detail, idx) => (
                            <tr key={idx} className="border-b hover:bg-slate-50">
                              <td className="p-2 font-mono text-slate-600">{detail.code}</td>
                              <td className="p-2 font-medium text-slate-900">{detail.name}</td>
                              <td className="p-2 text-slate-600">{detail.position}</td>
                              <td className="p-2 text-slate-600">
                                {detail.department}
                                {detail.assignmentType === "Departamental" && (
                                  <Badge className="ml-2 bg-blue-100 text-blue-700 text-xs">Dpto</Badge>
                                )}
                              </td>
                              <td className="p-2 text-right text-slate-900">
                                S/ {detail.salary.toFixed(2)}
                              </td>
                              <td className="p-2 text-center text-slate-600">{detail.percentage}%</td>
                              <td className="p-2 text-right font-bold text-indigo-600">
                                S/ {detail.allocated.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-indigo-50 font-bold">
                            <td colSpan="6" className="p-2 text-right">TOTAL:</td>
                            <td className="p-2 text-right text-indigo-900">
                              S/ {item.totalSalary.toFixed(2)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
