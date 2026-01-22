import React, { useState, useEffect } from "react";
// import { base44 } from "@/api/base44Client";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, Search, Users } from "lucide-react";
import OrgChart from "../components/employees/OrgChart";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function OrgChartPage() {
  // const [currentUser, setCurrentUser] = useState(null);
  // const [employee, setEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
  }, [currentUser]);

  // useEffect(() => {
    // const loadUserData = async () => {
      // try {
        // const user = await base44.auth.me();
        // const user = await base44.auth.me();
        // setCurrentUser(user);

        // const employees = await base44.entities.Employee.filter({
          // work_email: user.email
        // });

        // if (employees && employees.length > 0) {
          // setEmployee(employees[0]);
        // }
      // } catch (error) {
        // console.error("Error loading user:", error);
      // }
    // };

    // loadUserData();
  // }, []);

  const { data: allEmployees = [], isLoading } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      // return await base44.entities.Employee.filter({ status: "Activo" });
      return await entitiesAPI.Employee.filter({ status: "Activo" });
    },
  });

  const filteredEmployees = allEmployees.filter(emp => {
    const matchesSearch = searchTerm ? (
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
    ) : true;

    const matchesDept = departmentFilter === "all" || emp.department_name === departmentFilter;

    return matchesSearch && matchesDept;
  });

  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  // Estadísticas
  const stats = {
    total: allEmployees.length,
    managers: allEmployees.filter(e => e.role === "manager").length,
    admins: allEmployees.filter(e => e.role === "admin").length,
    departments: departments.length,
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Organigrama Empresarial
          </h1>
          <p className="text-slate-600 text-lg">
            Visualiza la estructura jerárquica de la organización
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.total}
              </div>
              <p className="text-slate-600 text-sm">Total Empleados</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.managers}
              </div>
              <p className="text-slate-600 text-sm">Managers</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.admins}
              </div>
              <p className="text-slate-600 text-sm">Administradores</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <Building className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.departments}
              </div>
              <p className="text-slate-600 text-sm">Departamentos</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-lg mb-8">
          <CardHeader className="border-b">
            <CardTitle className="text-xl font-bold">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Buscar empleado..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Departamentos</SelectItem>
                  {departments.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Org Chart */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b">
            <CardTitle className="text-xl font-bold">Estructura Organizacional</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              {filteredEmployees.length} empleados {departmentFilter !== "all" && `en ${departmentFilter}`}
            </p>
          </CardHeader>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <OrgChart employees={filteredEmployees} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
