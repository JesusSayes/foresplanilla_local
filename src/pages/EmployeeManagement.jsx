import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, Plus, Edit, Eye, UserX, UserCheck, Search, 
  Calendar as CalendarIcon, Briefcase, Mail, Phone, MapPin, Shield, History
} from "lucide-react";
import { createPageUrl } from "../utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { usePermissions } from "../components/hooks/usePermissions";
import EmployeeHistory from "../components/employees/EmployeeHistory";

export default function EmployeeManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [positionSearchTerm, setPositionSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [formData, setFormData] = useState({});
  const [departmentSearchTerm, setDepartmentSearchTerm] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyEmployeeId, setHistoryEmployeeId] = useState(null);
  const [selectedDepartamento, setSelectedDepartamento] = useState("");
  const [selectedProvincia, setSelectedProvincia] = useState("");

  const { hasPermission, loading: permissionsLoading } = usePermissions();
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

  const { data: allEmployees = [], isLoading } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await base44.entities.Employee.list("-created_date");
    },
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const allPositions = await base44.entities.Position.list("name");
      return allPositions.filter(p => p.is_active);
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const allDepartments = await base44.entities.Department.list("name");
      return allDepartments.filter(d => d.is_active);
    },
  });

  const { data: banks = [] } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const allBanks = await base44.entities.Bank.list("name");
      return allBanks.filter(b => b.is_active);
    },
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const allSites = await base44.entities.Site.list("name");
      return allSites.filter(s => s.is_active);
    },
  });

  const { data: afps = [] } = useQuery({
    queryKey: ["afps"],
    queryFn: async () => {
      const allAFPs = await base44.entities.AFP.list("name");
      return allAFPs.filter(a => a.is_active);
    },
  });

  const { data: ubigeos = [] } = useQuery({
    queryKey: ["ubigeos"],
    queryFn: async () => {
      return await base44.entities.Ubigeo.list("departamento");
    },
  });

  const { data: employeeChanges = [], isLoading: historyLoading } = useQuery({
    queryKey: ["employeeChanges", historyEmployeeId],
    queryFn: async () => {
      if (!historyEmployeeId) return [];
      return await base44.entities.EmployeeChangeLog.filter(
        { employee_id: historyEmployeeId },
        "-created_date"
      );
    },
    enabled: !!historyEmployeeId,
  });

  const { data: allContracts = [] } = useQuery({
    queryKey: ["allContracts"],
    queryFn: async () => {
      return await base44.entities.Contract.list("-created_date");
    },
  });

  const createChangeLogMutation = useMutation({
    mutationFn: async (changeData) => {
      return await base44.entities.EmployeeChangeLog.create(changeData);
    },
  });

  const handleCreateEmployee = async (data) => {
    const newEmployee = await base44.entities.Employee.create(data);
    
    // Si seleccionó ONP, agregar concepto automáticamente
    if (data.pension_system === "ONP") {
      await addONPConcept(newEmployee.id);
    }
    
    // Si seleccionó AFP, agregar conceptos automáticamente
    if (data.pension_system === "AFP" && data.afp_id) {
      const selectedAFP = afps.find(a => a.id === data.afp_id);
      if (selectedAFP) {
        await syncAFPConcepts(newEmployee.id, selectedAFP);
      }
    }
    
    // Registrar creación en el historial
    await createChangeLogMutation.mutateAsync({
      employee_id: newEmployee.id,
      field_changed: "Registro completo",
      old_value: "",
      new_value: "Empleado creado",
      change_type: "Creación",
      changed_by: currentUser?.email || "Sistema",
      change_date: new Date().toISOString(),
      notes: "Registro inicial del empleado en el sistema"
    });
    
    return newEmployee;
  };

  const createEmployeeMutation = useMutation({
    mutationFn: handleCreateEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries(["allEmployees"]);
      toast.success("Empleado creado correctamente");
      resetForm();
    },
    onError: (error) => {
      toast.error("Error al crear el empleado");
      console.error(error);
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, data, oldData }) => {
      const updatedEmployee = await base44.entities.Employee.update(id, data);
      
      // Si cambió la AFP, actualizar conceptos de planilla
      if (data.afp_id && data.afp_id !== oldData.afp_id && data.pension_system === "AFP") {
        const selectedAFP = afps.find(a => a.id === data.afp_id);
        if (selectedAFP) {
          await syncAFPConcepts(id, selectedAFP);
        }
      }
      
      // Si cambió el sistema de pensiones a AFP, agregar conceptos
      if (data.pension_system === "AFP" && oldData.pension_system !== "AFP" && data.afp_id) {
        const selectedAFP = afps.find(a => a.id === data.afp_id);
        if (selectedAFP) {
          await syncAFPConcepts(id, selectedAFP);
        }
      }
      
      // Si cambió a ONP o Ninguno, eliminar conceptos AFP
      if ((data.pension_system === "ONP" || data.pension_system === "Ninguno") && oldData.pension_system === "AFP") {
        await removeAFPConcepts(id);
      }
      
      // Si cambió a ONP, agregar concepto ONP y eliminar AFP
      if (data.pension_system === "ONP" && oldData.pension_system !== "ONP") {
        await removeAFPConcepts(id);
        await addONPConcept(id);
      }
      
      // Si cambió de ONP a otro sistema, eliminar concepto ONP
      if (data.pension_system !== "ONP" && oldData.pension_system === "ONP") {
        await removeONPConcept(id);
      }
      
      // Registrar cambios en el historial
      const changedFields = [];
      Object.keys(data).forEach(key => {
        if (oldData[key] !== data[key] && data[key] !== undefined) {
          changedFields.push({
            field: key,
            oldValue: oldData[key] || "",
            newValue: data[key] || ""
          });
        }
      });
      
      // Crear registros de cambio
      for (const change of changedFields) {
        await createChangeLogMutation.mutateAsync({
          employee_id: id,
          field_changed: change.field,
          old_value: String(change.oldValue),
          new_value: String(change.newValue),
          change_type: "Actualización",
          changed_by: currentUser?.email || "Sistema",
          change_date: new Date().toISOString(),
        });
      }
      
      return updatedEmployee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["allEmployees"]);
      queryClient.invalidateQueries(["employeeChanges"]);
      toast.success("Empleado actualizado correctamente");
      resetForm();
    },
    onError: (error) => {
      toast.error("Error al actualizar el empleado");
      console.error(error);
    },
  });

  const syncAFPConcepts = async (employeeId, afp) => {
    try {
      // Eliminar conceptos AFP anteriores
      await removeAFPConcepts(employeeId);
      
      // Agregar nuevos conceptos AFP
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      
      const afpConcepts = [
        {
          employee_id: employeeId,
          concept_type: "Descuento",
          concept_name: "AFP - Comisión",
          amount: 0,
          is_dynamic: true,
          calculation_formula: `base_salary * ${(afp.commission_percentage / 100).toFixed(4)}`,
          month,
          year,
          is_recurring: true,
          is_applied: false,
          notes: `${afp.name} - Comisión ${afp.commission_percentage}%`
        },
        {
          employee_id: employeeId,
          concept_type: "Descuento",
          concept_name: "AFP - Aporte Obligatorio",
          amount: 0,
          is_dynamic: true,
          calculation_formula: `base_salary * ${(afp.obligatory_contribution_percentage / 100).toFixed(4)}`,
          month,
          year,
          is_recurring: true,
          is_applied: false,
          notes: `${afp.name} - Aporte Obligatorio ${afp.obligatory_contribution_percentage}%`
        },
        {
          employee_id: employeeId,
          concept_type: "Descuento",
          concept_name: "AFP - Seguro",
          amount: 0,
          is_dynamic: true,
          calculation_formula: `base_salary * ${(afp.insurance_percentage / 100).toFixed(4)}`,
          month,
          year,
          is_recurring: true,
          is_applied: false,
          notes: `${afp.name} - Seguro ${afp.insurance_percentage}%`
        }
      ];
      
      for (const concept of afpConcepts) {
        await base44.entities.PayrollConcept.create(concept);
      }
      
      toast.success(`Conceptos AFP de ${afp.name} agregados automáticamente`);
    } catch (error) {
      console.error("Error al sincronizar conceptos AFP:", error);
    }
  };

  const removeAFPConcepts = async (employeeId) => {
    try {
      const allConcepts = await base44.entities.PayrollConcept.filter({ employee_id: employeeId });
      const afpConcepts = allConcepts.filter(c => 
        c.concept_name.includes("AFP - Comisión") || 
        c.concept_name.includes("AFP - Aporte Obligatorio") || 
        c.concept_name.includes("AFP - Seguro")
      );
      
      for (const concept of afpConcepts) {
        await base44.entities.PayrollConcept.delete(concept.id);
      }
    } catch (error) {
      console.error("Error al eliminar conceptos AFP:", error);
    }
  };

  const addONPConcept = async (employeeId) => {
    try {
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      
      await base44.entities.PayrollConcept.create({
        employee_id: employeeId,
        concept_type: "Descuento",
        concept_name: "ONP",
        amount: 0,
        is_dynamic: true,
        calculation_formula: "base_salary * 0.13",
        month,
        year,
        is_recurring: true,
        is_applied: false,
        notes: "ONP - 13% sobre remuneración bruta"
      });
      
      toast.success("Concepto ONP agregado automáticamente");
    } catch (error) {
      console.error("Error al agregar concepto ONP:", error);
    }
  };

  const removeONPConcept = async (employeeId) => {
    try {
      const allConcepts = await base44.entities.PayrollConcept.filter({ employee_id: employeeId });
      const onpConcepts = allConcepts.filter(c => c.concept_name === "ONP");
      
      for (const concept of onpConcepts) {
        await base44.entities.PayrollConcept.delete(concept.id);
      }
    } catch (error) {
      console.error("Error al eliminar concepto ONP:", error);
    }
  };

  const initializeForm = (emp = null) => {
    // Buscar el último contrato vigente del empleado
    let baseSalary = emp?.base_salary || "";
    if (emp?.id) {
      const employeeContracts = allContracts.filter(c => c.employee_id === emp.id && c.status === "Vigente");
      if (employeeContracts.length > 0) {
        const latestContract = employeeContracts.sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
        baseSalary = latestContract.salary || baseSalary;
      }
    }

    // Inicializar selecciones de ubigeo
    if (emp?.department) {
      setSelectedDepartamento(emp.department);
    } else {
      setSelectedDepartamento("");
    }
    if (emp?.province) {
      setSelectedProvincia(emp.province);
    } else {
      setSelectedProvincia("");
    }

    setFormData({
      employee_code: emp?.employee_code || "",
      document_type: emp?.document_type || "DNI",
      document_number: emp?.document_number || "",
      first_name: emp?.first_name || "",
      last_name: emp?.last_name || "",
      birth_date: emp?.birth_date || "",
      gender: emp?.gender || "M",
      personal_email: emp?.personal_email || "",
      work_email: emp?.work_email || "",
      phone: emp?.phone || "",
      mobile: emp?.mobile || "",
      address: emp?.address || "",
      district: emp?.district || "",
      province: emp?.province || "",
      department: emp?.department || "",
      company: emp?.company || "",
      position: emp?.position || "",
      position_level: emp?.position_level || "",
      profession: emp?.profession || "",
      department_name: emp?.department_name || "",
      work_unit: emp?.work_unit || "",
      site: emp?.site || "",
      hire_date: emp?.hire_date || "",
      termination_date: emp?.termination_date || "",
      contract_type: emp?.contract_type || "Indeterminado",
      base_salary: baseSalary,
      pension_system: emp?.pension_system || "Ninguno",
      afp_id: emp?.afp_id || "",
      afp_affiliation_date: emp?.afp_affiliation_date || "",
      cuspp: emp?.cuspp || "",
      bank_name: emp?.bank_name || "",
      bank_account: emp?.bank_account || "",
      cci_account: emp?.cci_account || "",
      cts_bank: emp?.cts_bank || "",
      cts_account_number: emp?.cts_account_number || "",
      cts_currency: emp?.cts_currency || "Soles",
      status: emp?.status || "Activo",
      role: emp?.role || "empleado",
      supervisor_name: emp?.supervisor_name || "",
      emergency_contact_name: emp?.emergency_contact_name || "",
      emergency_contact_phone: emp?.emergency_contact_phone || "",
      emergency_contact_relationship: emp?.emergency_contact_relationship || "",
    });
  };

  const handleCreate = () => {
    if (!hasPermission("employees.create")) {
      toast.error("No tienes permisos para crear empleados");
      return;
    }
    initializeForm();
    setEditingEmployee(null);
    setShowForm(true);
  };

  const handleEdit = (emp) => {
    if (!hasPermission("employees.edit")) {
      toast.error("No tienes permisos para editar empleados");
      return;
    }
    initializeForm(emp);
    setEditingEmployee(emp);
    setShowForm(true);
  };

  const handleView = (emp) => {
    setSelectedEmployee(emp);
    setShowDetails(true);
  };

  const handleSubmit = () => {
    if (!formData.employee_code || !formData.document_number || !formData.first_name || !formData.last_name) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    if (editingEmployee) {
      updateEmployeeMutation.mutate({ 
        id: editingEmployee.id, 
        data: formData,
        oldData: editingEmployee 
      });
    } else {
      createEmployeeMutation.mutate(formData);
    }
  };

  const handleStatusChange = async (emp, newStatus) => {
    if (!hasPermission("employees.edit")) {
      toast.error("No tienes permisos para cambiar el estado");
      return;
    }
    
    try {
      await base44.entities.Employee.update(emp.id, { status: newStatus });
      
      // Registrar cambio de estado
      await createChangeLogMutation.mutateAsync({
        employee_id: emp.id,
        field_changed: "status",
        old_value: emp.status,
        new_value: newStatus,
        change_type: "Cambio de Estado",
        changed_by: currentUser?.email || "Sistema",
        change_date: new Date().toISOString(),
        notes: `Estado cambiado de ${emp.status} a ${newStatus}`
      });
      
      queryClient.invalidateQueries(["allEmployees"]);
      queryClient.invalidateQueries(["employeeChanges"]);
      toast.success(`Estado actualizado a ${newStatus}`);
    } catch (error) {
      toast.error("Error al actualizar el estado");
    }
  };

  const handleViewHistory = (emp) => {
    setHistoryEmployeeId(emp.id);
    setShowHistory(true);
  };

  const resetForm = () => {
    setFormData({});
    setEditingEmployee(null);
    setShowForm(false);
  };

  const departmentNames = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  // Obtener listas únicas de ubigeos
  const departamentos = [...new Set(ubigeos.map(u => u.departamento))].sort();
  const provincias = selectedDepartamento 
    ? [...new Set(ubigeos.filter(u => u.departamento === selectedDepartamento).map(u => u.provincia))].sort()
    : [];
  const distritos = selectedProvincia 
    ? [...new Set(ubigeos.filter(u => u.departamento === selectedDepartamento && u.provincia === selectedProvincia).map(u => u.distrito))].sort()
    : [];

  const filteredEmployees = allEmployees.filter(emp => {
    const matchesSearch = emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.document_number.includes(searchTerm);
    const matchesStatus = statusFilter === "all" || emp.status === statusFilter;
    const matchesDept = departmentFilter === "all" || emp.department_name === departmentFilter;
    const matchesSite = siteFilter === "all" || emp.site === siteFilter || (siteFilter === "sin_sede" && !emp.site);
    return matchesSearch && matchesStatus && matchesDept && matchesSite;
  });

  const getStatusConfig = (status) => {
    const configs = {
      "Activo": { color: "bg-green-100 text-green-700 border-green-200", icon: UserCheck },
      "Suspendido": { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: UserX },
      "Cesado": { color: "bg-red-100 text-red-700 border-red-200", icon: UserX },
    };
    return configs[status] || configs["Activo"];
  };

  if (!employee || permissionsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasPermission("employees.view")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para ver empleados</p>
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
            Gestión de Empleados
          </h1>
          <p className="text-slate-600 text-lg">
            Administra el registro completo del personal
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {allEmployees.length}
              </div>
              <p className="text-slate-600 text-sm">Total empleados</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <UserCheck className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {allEmployees.filter(e => e.status === "Activo").length}
              </div>
              <p className="text-slate-600 text-sm">Activos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <Briefcase className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {departmentNames.length}
              </div>
              <p className="text-slate-600 text-sm">Departamentos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6 space-y-3">
              {hasPermission("employees.create") && (
                <Button
                  onClick={handleCreate}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Empleado
                </Button>
              )}
              {hasPermission("employees.import") && (
                <Button
                  onClick={() => window.location.href = createPageUrl("ImportEmployees")}
                  variant="outline"
                  className="w-full"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Importar Empleados
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Buscar por nombre, código o documento..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="Suspendido">Suspendido</SelectItem>
                  <SelectItem value="Cesado">Cesado</SelectItem>
                </SelectContent>
              </Select>

              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {departmentNames.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Sede" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="sin_sede">Sin sede</SelectItem>
                  {sites.map(site => (
                    <SelectItem key={site.id} value={site.name}>{site.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No se encontraron empleados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEmployees.map(emp => {
                  const statusConfig = getStatusConfig(emp.status);
                  const StatusIcon = statusConfig.icon;

                  return (
                    <div 
                      key={emp.id}
                      className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                            {emp.first_name[0]}{emp.last_name[0]}
                          </div>
                          
                          <div className="flex-1">
                            <h4 className="font-bold text-slate-900 text-lg">
                              {emp.first_name} {emp.last_name}
                            </h4>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 mt-1">
                              <span className="font-medium">{emp.employee_code}</span>
                              <span>•</span>
                              <span>{emp.position}</span>
                              <span>•</span>
                              <span>{emp.department_name}</span>
                              <span>•</span>
                              <span className="text-indigo-600 font-medium">{emp.site || "Sin sede"}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <Badge className={statusConfig.color}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {emp.status}
                            </Badge>

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleView(emp)}
                                title="Ver detalles"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewHistory(emp)}
                                title="Ver historial"
                              >
                                <History className="w-4 h-4" />
                              </Button>

                              {hasPermission("employees.edit") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEdit(emp)}
                                  title="Editar"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              )}

                              {hasPermission("employees.edit") && emp.status === "Activo" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  onClick={() => handleStatusChange(emp, "Suspendido")}
                                  title="Suspender"
                                >
                                  <UserX className="w-4 h-4" />
                                </Button>
                              )}

                              {hasPermission("employees.edit") && emp.status !== "Activo" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600"
                                  onClick={() => handleStatusChange(emp, "Activo")}
                                  title="Activar"
                                >
                                  <UserCheck className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
          onClick={resetForm}
        >
          <Card 
            className="max-w-5xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingEmployee ? "Editar Empleado" : "Nuevo Empleado"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <Tabs defaultValue="personal" className="space-y-6" onClick={(e) => e.stopPropagation()}>
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="personal">Personal</TabsTrigger>
                  <TabsTrigger value="contact">Contacto</TabsTrigger>
                  <TabsTrigger value="work">Laboral</TabsTrigger>
                  <TabsTrigger value="financial">Financiero</TabsTrigger>
                  <TabsTrigger value="emergency">Emergencia</TabsTrigger>
                </TabsList>

                <TabsContent value="personal" className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Código de Empleado *</Label>
                      <Input
                        value={formData.employee_code}
                        onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Tipo de Documento *</Label>
                      <Select value={formData.document_type} onValueChange={(val) => setFormData({ ...formData, document_type: val })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DNI">DNI</SelectItem>
                          <SelectItem value="CE">CE</SelectItem>
                          <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Número de Documento *</Label>
                      <Input
                        value={formData.document_number}
                        onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Nombres *</Label>
                      <Input
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Apellidos *</Label>
                      <Input
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Género</Label>
                      <Select value={formData.gender} onValueChange={(val) => setFormData({ ...formData, gender: val })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M">Masculino</SelectItem>
                          <SelectItem value="F">Femenino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Fecha de Nacimiento</Label>
                      <Input
                        type="date"
                        value={formData.birth_date}
                        onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Profesión</Label>
                      <Input
                        value={formData.profession}
                        onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                        placeholder="Profesión"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="contact" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Email Personal</Label>
                      <Input
                        type="email"
                        value={formData.personal_email}
                        onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Email Corporativo</Label>
                      <Input
                        type="email"
                        value={formData.work_email}
                        onChange={(e) => setFormData({ ...formData, work_email: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Teléfono Fijo</Label>
                      <Input
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Celular</Label>
                      <Input
                        value={formData.mobile}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Dirección</Label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Departamento</Label>
                      <Select 
                        value={selectedDepartamento} 
                        onValueChange={(val) => {
                          setSelectedDepartamento(val);
                          setSelectedProvincia("");
                          setFormData({ ...formData, department: val, province: "", district: "" });
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleccionar departamento" /></SelectTrigger>
                        <SelectContent>
                          {departamentos.map(dept => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Provincia</Label>
                      <Select 
                        value={selectedProvincia} 
                        onValueChange={(val) => {
                          setSelectedProvincia(val);
                          setFormData({ ...formData, province: val, district: "" });
                        }}
                        disabled={!selectedDepartamento}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleccionar provincia" /></SelectTrigger>
                        <SelectContent>
                          {provincias.map(prov => (
                            <SelectItem key={prov} value={prov}>{prov}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Distrito</Label>
                      <Select 
                        value={formData.district} 
                        onValueChange={(val) => setFormData({ ...formData, district: val })}
                        disabled={!selectedProvincia}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleccionar distrito" /></SelectTrigger>
                        <SelectContent>
                          {distritos.map(dist => (
                            <SelectItem key={dist} value={dist}>{dist}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="work" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Empresa</Label>
                      <Input
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        placeholder="Empresa del grupo"
                      />
                    </div>
                    <div>
                      <Label>Sede</Label>
                      <Select value={formData.site} onValueChange={(val) => setFormData({ ...formData, site: val })}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar sede" /></SelectTrigger>
                        <SelectContent>
                          {sites.map(site => (
                            <SelectItem key={site.id} value={site.name}>
                              {site.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Cargo</Label>
                      <Select value={formData.position} onValueChange={(val) => setFormData({ ...formData, position: val })}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar cargo" /></SelectTrigger>
                        <SelectContent>
                          <div className="p-2 border-b sticky top-0 bg-white z-10">
                            <Input
                              placeholder="Buscar cargo..."
                              value={positionSearchTerm}
                              onChange={(e) => setPositionSearchTerm(e.target.value)}
                              className="h-8"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                          {positions
                            .filter(pos => pos.name.toLowerCase().includes(positionSearchTerm.toLowerCase()))
                            .map(pos => (
                              <SelectItem key={pos.id} value={pos.name}>
                                {pos.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Nivel</Label>
                      <Input
                        value={formData.position_level}
                        onChange={(e) => setFormData({ ...formData, position_level: e.target.value })}
                        placeholder="Nivel del cargo"
                      />
                    </div>
                    <div>
                      <Label>Tipo de Contrato</Label>
                      <Select value={formData.contract_type} onValueChange={(val) => setFormData({ ...formData, contract_type: val })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Indeterminado">Indeterminado</SelectItem>
                          <SelectItem value="Plazo Fijo">Plazo Fijo</SelectItem>
                          <SelectItem value="Part-Time">Part-Time</SelectItem>
                          <SelectItem value="Prácticas">Prácticas</SelectItem>
                          <SelectItem value="SNP">SNP - Servicios No Personales</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Área/Departamento</Label>
                      <Select value={formData.department_name} onValueChange={(val) => setFormData({ ...formData, department_name: val })}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar departamento" /></SelectTrigger>
                        <SelectContent>
                          <div className="p-2 border-b sticky top-0 bg-white z-10">
                            <Input
                              placeholder="Buscar departamento..."
                              value={departmentSearchTerm}
                              onChange={(e) => setDepartmentSearchTerm(e.target.value)}
                              className="h-8"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                          {departments
                            .filter(dept => dept.name.toLowerCase().includes(departmentSearchTerm.toLowerCase()))
                            .map(dept => (
                              <SelectItem key={dept.id} value={dept.name}>
                                {dept.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Unidad de Trabajo</Label>
                      <Input
                        value={formData.work_unit}
                        onChange={(e) => setFormData({ ...formData, work_unit: e.target.value })}
                        placeholder="Unidad de trabajo"
                      />
                    </div>
                    <div>
                      <Label>Supervisor Directo</Label>
                      <Input
                        value={formData.supervisor_name}
                        onChange={(e) => setFormData({ ...formData, supervisor_name: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Fecha de Ingreso</Label>
                      <Input
                        type="date"
                        value={formData.hire_date}
                        onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Fecha de Cese</Label>
                      <Input
                        type="date"
                        value={formData.termination_date}
                        onChange={(e) => setFormData({ ...formData, termination_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Estado</Label>
                      <Select value={formData.status} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Activo">Activo</SelectItem>
                          <SelectItem value="Suspendido">Suspendido</SelectItem>
                          <SelectItem value="Cesado">Cesado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="financial" className="space-y-4">
                  <div className="border-b pb-4">
                    <h3 className="font-semibold text-slate-900 mb-4">Sistema de Pensiones</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>Sistema de Pensiones</Label>
                        <Select value={formData.pension_system || "Ninguno"} onValueChange={(val) => {
                          setFormData({ ...formData, pension_system: val, afp_id: val === "AFP" ? formData.afp_id : "" });
                        }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Ninguno">Ninguno</SelectItem>
                            <SelectItem value="AFP">AFP</SelectItem>
                            <SelectItem value="ONP">ONP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {formData.pension_system === "AFP" && (
                        <>
                          <div>
                            <Label>AFP Afiliada</Label>
                            <Select value={formData.afp_id || ""} onValueChange={(val) => setFormData({ ...formData, afp_id: val })}>
                              <SelectTrigger><SelectValue placeholder="Seleccionar AFP" /></SelectTrigger>
                              <SelectContent>
                                {afps.map(afp => (
                                  <SelectItem key={afp.id} value={afp.id}>
                                    {afp.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                              Los descuentos AFP se agregarán automáticamente
                            </p>
                          </div>
                          <div>
                            <Label>Fecha Afiliación AFP</Label>
                            <Input
                              type="date"
                              value={formData.afp_affiliation_date}
                              onChange={(e) => setFormData({ ...formData, afp_affiliation_date: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {(formData.pension_system === "AFP" || formData.pension_system === "ONP") && (
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <Label>CUSPP{formData.pension_system === "AFP" ? " (Código Único de Identificación)" : " / N° de Afiliación"}</Label>
                          <Input
                            value={formData.cuspp}
                            onChange={(e) => setFormData({ ...formData, cuspp: e.target.value })}
                            placeholder={formData.pension_system === "AFP" ? "Ingrese CUSPP de 12 dígitos" : "Ingrese número de afiliación ONP"}
                            maxLength={formData.pension_system === "AFP" ? 12 : 20}
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            {formData.pension_system === "AFP" 
                              ? "Código único de 12 dígitos del Sistema Privado de Pensiones" 
                              : "Número de afiliación al Sistema Nacional de Pensiones"}
                          </p>
                        </div>
                        <div>
                          <Label>Salario Base</Label>
                          <Input
                            type="number"
                            value={formData.base_salary}
                            readOnly
                            className="bg-slate-100 cursor-not-allowed"
                          />
                          <p className="text-xs text-slate-500 mt-1">Se obtiene del último contrato vigente</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-semibold text-slate-900 mb-4">Cuenta de Sueldo</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>Banco</Label>
                        <Select value={formData.bank_name} onValueChange={(val) => setFormData({ ...formData, bank_name: val })}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar banco" /></SelectTrigger>
                          <SelectContent>
                            {banks.map(bank => (
                              <SelectItem key={bank.id} value={bank.name}>
                                {bank.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>N° de Cuenta</Label>
                        <Input
                          value={formData.bank_account}
                          onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
                          placeholder="Número de cuenta"
                        />
                      </div>
                      <div>
                        <Label>CCI</Label>
                        <Input
                          value={formData.cci_account}
                          onChange={(e) => setFormData({ ...formData, cci_account: e.target.value })}
                          placeholder="Código CCI (20 dígitos)"
                          maxLength={20}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-semibold text-slate-900 mb-4">Cuenta CTS</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>Banco CTS</Label>
                        <Select value={formData.cts_bank} onValueChange={(val) => setFormData({ ...formData, cts_bank: val })}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar banco" /></SelectTrigger>
                          <SelectContent>
                            {banks.map(bank => (
                              <SelectItem key={bank.id} value={bank.name}>
                                {bank.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>N° de Cuenta CTS</Label>
                        <Input
                          value={formData.cts_account_number}
                          onChange={(e) => setFormData({ ...formData, cts_account_number: e.target.value })}
                          placeholder="Número de cuenta"
                        />
                      </div>
                      <div>
                        <Label>Moneda</Label>
                        <Select value={formData.cts_currency} onValueChange={(val) => setFormData({ ...formData, cts_currency: val })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Soles">Soles</SelectItem>
                            <SelectItem value="Dólares">Dólares</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="emergency" className="space-y-4">
                  <div>
                    <Label>Nombre del Contacto</Label>
                    <Input
                      value={formData.emergency_contact_name}
                      onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Teléfono de Contacto</Label>
                      <Input
                        value={formData.emergency_contact_phone}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Relación</Label>
                      <Input
                        placeholder="Ej: Madre, Esposo/a"
                        value={formData.emergency_contact_relationship}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_relationship: e.target.value })}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-3 mt-6 pt-6 border-t">
                <Button variant="outline" className="flex-1" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmit}
                  disabled={createEmployeeMutation.isPending || updateEmployeeMutation.isPending}
                >
                  {editingEmployee ? "Actualizar" : "Crear"} Empleado
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
          onClick={() => setShowHistory(false)}
        >
          <div 
            className="max-w-4xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <EmployeeHistory changes={employeeChanges} isLoading={historyLoading} />
            <Button
              onClick={() => setShowHistory(false)}
              className="w-full mt-4"
              variant="outline"
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetails && selectedEmployee && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={() => setShowDetails(false)}
        >
          <Card 
            className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                    {selectedEmployee.first_name[0]}{selectedEmployee.last_name[0]}
                  </div>
                  <div>
                    <CardTitle className="text-2xl">
                      {selectedEmployee.first_name} {selectedEmployee.last_name}
                    </CardTitle>
                    <p className="text-slate-600">{selectedEmployee.position}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowDetails(false)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-slate-900 mb-3">Información Personal</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong>Código:</strong> {selectedEmployee.employee_code}</p>
                    <p><strong>Documento:</strong> {selectedEmployee.document_type} {selectedEmployee.document_number}</p>
                    <p><strong>Fecha Nacimiento:</strong> {selectedEmployee.birth_date ? format(new Date(selectedEmployee.birth_date), "dd/MM/yyyy") : "N/A"}</p>
                    <p><strong>Género:</strong> {selectedEmployee.gender === "M" ? "Masculino" : "Femenino"}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900 mb-3">Contacto</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong>Email Personal:</strong> {selectedEmployee.personal_email || "N/A"}</p>
                    <p><strong>Email Laboral:</strong> {selectedEmployee.work_email || "N/A"}</p>
                    <p><strong>Celular:</strong> {selectedEmployee.mobile || "N/A"}</p>
                    <p><strong>Teléfono:</strong> {selectedEmployee.phone || "N/A"}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900 mb-3">Información Laboral</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong>Departamento:</strong> {selectedEmployee.department_name}</p>
                    <p><strong>Sede:</strong> {selectedEmployee.site || "N/A"}</p>
                    <p><strong>Fecha Ingreso:</strong> {selectedEmployee.hire_date ? format(new Date(selectedEmployee.hire_date), "dd/MM/yyyy") : "N/A"}</p>
                    <p><strong>Contrato:</strong> {selectedEmployee.contract_type}</p>
                    <p><strong>Sistema Pensión:</strong> {selectedEmployee.pension_system || "N/A"}</p>
                    {selectedEmployee.cuspp && <p><strong>CUSPP:</strong> {selectedEmployee.cuspp}</p>}
                    <p><strong>Estado:</strong> <Badge className={getStatusConfig(selectedEmployee.status).color}>{selectedEmployee.status}</Badge></p>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900 mb-3">Dirección</h3>
                  <div className="space-y-2 text-sm">
                    <p>{selectedEmployee.address || "N/A"}</p>
                    <p>{selectedEmployee.district && `${selectedEmployee.district}, `}{selectedEmployee.province}</p>
                    <p>{selectedEmployee.department}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}