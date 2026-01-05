import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileText, Plus, Edit, Download, Search, Calendar,
  CheckCircle, AlertCircle, XCircle, Users, Star
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { generateContractPDF } from "../components/contracts/ContractTemplate";

export default function ContractManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formData, setFormData] = useState({});
  const [positionSearchTerm, setPositionSearchTerm] = useState("");
  const [departmentSearchTerm, setDepartmentSearchTerm] = useState("");
  const [siteSearchTerm, setSiteSearchTerm] = useState("");
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [conflictingContract, setConflictingContract] = useState(null);

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

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const allSites = await base44.entities.Site.list("name");
      return allSites.filter(s => s.is_active);
    },
  });

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      return await base44.entities.Contract.list("-created_date");
    },
  });

  const { data: contractTemplates = [] } = useQuery({
    queryKey: ["contractTemplates"],
    queryFn: async () => {
      const templates = await base44.entities.ContractTemplate.list("-created_date");
      return templates.filter(t => t.is_active);
    },
    enabled: !!employee,
  });

  // Obtener la plantilla por defecto
  const defaultTemplate = contractTemplates.find(t => t.is_default) || contractTemplates[0] || null;

  const { data: companyInfo } = useQuery({
    queryKey: ["companyInfo"],
    queryFn: async () => {
      const info = await base44.entities.CompanyInfo.list("-created_date");
      return info.length > 0 ? info[0] : null;
    },
    enabled: !!employee,
  });

  const createContractMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Contract.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contracts"]);
      toast.success("Contrato creado correctamente");
      resetForm();
    },
    onError: () => {
      toast.error("Error al crear el contrato");
    },
  });

  const updateContractMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.Contract.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contracts"]);
      toast.success("Contrato actualizado correctamente");
      resetForm();
    },
    onError: () => {
      toast.error("Error al actualizar el contrato");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      return await base44.entities.Contract.update(id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contracts"]);
      toast.success("Estado actualizado correctamente");
    },
    onError: () => {
      toast.error("Error al actualizar el estado");
    },
  });

  const initializeForm = (contract = null, emp = null) => {
    // Normalizar fechas para asegurar formato consistente (YYYY-MM-DD)
    const normalizeDate = (dateStr) => {
      if (!dateStr) return "";
      const date = new Date(dateStr);
      // Obtener la fecha local sin conversión de zona horaria
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setFormData({
      employee_id: contract?.employee_id || emp?.id || "",
      contract_number: contract?.contract_number || "",
      contract_type: contract?.contract_type || "Indeterminado",
      start_date: normalizeDate(contract?.start_date),
      end_date: normalizeDate(contract?.end_date),
      position: contract?.position || emp?.position || "",
      department: contract?.department || emp?.department_name || "",
      work_location: contract?.work_location || emp?.site || "",
      salary: contract?.salary || emp?.base_salary || "",
      work_schedule: contract?.work_schedule || "Lunes a Viernes de 9:00 AM a 6:00 PM",
      weekly_hours: contract?.weekly_hours || 48,
      functions: contract?.functions || "",
      benefits: contract?.benefits || "",
      trial_period_days: contract?.trial_period_days || 90,
      renewable: contract?.renewable || false,
      status: contract?.status || "Vigente",
      signed_date: normalizeDate(contract?.signed_date) || new Date().toISOString().split('T')[0],
      notes: contract?.notes || "",
    });
  };

  const handleCreate = () => {
    initializeForm();
    setEditingContract(null);
    setShowForm(true);
  };

  const handleEdit = (contract) => {
    initializeForm(contract);
    setEditingContract(contract);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.employee_id || !formData.contract_type || !formData.start_date || !formData.position || !formData.salary) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    if (editingContract) {
      updateContractMutation.mutate({ id: editingContract.id, data: formData });
    } else {
      // Verificar si hay contratos vigentes para este empleado
      const existingActiveContract = contracts.find(
        c => c.employee_id === formData.employee_id && c.status === "Vigente"
      );

      if (existingActiveContract && formData.status === "Vigente") {
        setConflictingContract(existingActiveContract);
        return;
      }

      createContractMutation.mutate(formData);
    }
  };

  const handleResolveConflict = (newStatus) => {
    updateStatusMutation.mutate(
      { id: conflictingContract.id, status: newStatus },
      {
        onSuccess: () => {
          setConflictingContract(null);
          createContractMutation.mutate(formData);
        }
      }
    );
  };

  const handleGeneratePDF = async (contract) => {
    const emp = allEmployees.find(e => e.id === contract.employee_id);
    if (!emp) {
      toast.error("Empleado no encontrado");
      return;
    }

    try {
      // Recargar plantilla y datos de empresa antes de generar PDF
      const templates = await base44.entities.ContractTemplate.list("-created_date");
      const template = templates.length > 0 ? templates[0] : null;
      
      const companyData = companyInfo || {};
      
      await generateContractPDF(emp, contract, companyData, template);
      toast.success("PDF generado exitosamente");
    } catch (error) {
      console.error("Error generando PDF:", error);
      toast.error("Error al generar el PDF");
    }
  };

  const resetForm = () => {
    setFormData({});
    setEditingContract(null);
    setShowForm(false);
    setConflictingContract(null);
  };

  const filteredContracts = contracts.filter(c => {
    const emp = allEmployees.find(e => e.id === c.employee_id);
    if (!emp) return false;

    const matchesSearch = searchTerm ? (
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.contract_number?.toLowerCase().includes(searchTerm.toLowerCase())
    ) : true;

    const matchesStatus = statusFilter === "all" || c.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: contracts.length,
    vigentes: contracts.filter(c => c.status === "Vigente").length,
    vencidos: contracts.filter(c => c.status === "Vencido").length,
    indeterminados: contracts.filter(c => c.contract_type === "Indeterminado").length,
  };

  const getStatusConfig = (status) => {
    const configs = {
      "Vigente": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
      "Vencido": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
      "Rescindido": { color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
      "Renovado": { color: "bg-blue-100 text-blue-700 border-blue-200", icon: CheckCircle },
    };
    return configs[status] || configs["Vigente"];
  };

  if (!employee || employee.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden gestionar contratos</p>
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
            Gestión de Contratos
          </h1>
          <p className="text-slate-600 text-lg">
            Registra y administra los contratos laborales de los empleados
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <FileText className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.total}</div>
              <p className="text-slate-600 text-sm">Total Contratos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.vigentes}</div>
              <p className="text-slate-600 text-sm">Vigentes</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-red-100 rounded-xl">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.vencidos}</div>
              <p className="text-slate-600 text-sm">Vencidos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.indeterminados}</div>
              <p className="text-slate-600 text-sm">Indeterminados</p>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <Card className="border-0 shadow-lg mb-8">
          <CardHeader className="border-b bg-slate-50/50">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <CardTitle className="text-xl font-bold">Contratos Registrados</CardTitle>
              <Button
                onClick={handleCreate}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Contrato
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="flex-1 min-w-64 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <Input
                  placeholder="Buscar por empleado o número de contrato..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Vigente">Vigente</SelectItem>
                  <SelectItem value="Vencido">Vencido</SelectItem>
                  <SelectItem value="Rescindido">Rescindido</SelectItem>
                  <SelectItem value="Renovado">Renovado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredContracts.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No se encontraron contratos</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredContracts.map(contract => {
                  const emp = allEmployees.find(e => e.id === contract.employee_id);
                  if (!emp) return null;

                  const StatusIcon = getStatusConfig(contract.status).icon;

                  return (
                    <div key={contract.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-slate-900">
                              {emp.employee_code} - {emp.first_name} {emp.last_name}
                            </h4>
                            <Badge className={getStatusConfig(contract.status).color}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {contract.status}
                            </Badge>
                            <Badge variant="outline">{contract.contract_type}</Badge>
                            {contract.contract_number && (
                              <Badge className="bg-purple-100 text-purple-700">
                                #{contract.contract_number}
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-slate-600">Cargo</p>
                              <p className="font-semibold text-slate-900">{contract.position}</p>
                            </div>
                            <div>
                              <p className="text-slate-600">Inicio</p>
                              <p className="font-semibold text-slate-900">
                                {format(new Date(contract.start_date), "dd/MM/yyyy")}
                              </p>
                            </div>
                            {contract.end_date && (
                              <div>
                                <p className="text-slate-600">Fin</p>
                                <p className="font-semibold text-slate-900">
                                  {format(new Date(contract.end_date), "dd/MM/yyyy")}
                                </p>
                              </div>
                            )}
                            <div>
                              <p className="text-slate-600">Remuneración</p>
                              <p className="font-semibold text-indigo-600">
                                S/ {contract.salary.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 ml-4">
                          <Select 
                            value={contract.status} 
                            onValueChange={(newStatus) => updateStatusMutation.mutate({ id: contract.id, status: newStatus })}
                          >
                            <SelectTrigger className="w-32 h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Vigente">Vigente</SelectItem>
                              <SelectItem value="Vencido">Vencido</SelectItem>
                              <SelectItem value="Rescindido">Rescindido</SelectItem>
                              <SelectItem value="Renovado">Renovado</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGeneratePDF(contract)}
                            title="Generar PDF"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(contract)}
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
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
            className="max-w-4xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingContract ? "Editar Contrato" : "Nuevo Contrato"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 max-h-[70vh] overflow-y-auto">
              <Tabs defaultValue="basic" className="space-y-6">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Datos Básicos</TabsTrigger>
                  <TabsTrigger value="work">Condiciones Laborales</TabsTrigger>
                  <TabsTrigger value="details">Detalles</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <div>
                    <Label>Empleado *</Label>
                    <Select 
                      value={formData.employee_id} 
                      onValueChange={(v) => {
                        const emp = allEmployees.find(e => e.id === v);
                        initializeForm(null, emp);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar empleado" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2 border-b sticky top-0 bg-white z-10">
                          <Input
                            placeholder="Buscar empleado..."
                            value={employeeSearchTerm}
                            onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                            className="h-8"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        {allEmployees
                          .filter(emp => 
                            emp.first_name.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
                            emp.last_name.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
                            emp.employee_code.toLowerCase().includes(employeeSearchTerm.toLowerCase())
                          )
                          .map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.employee_code} - {emp.first_name} {emp.last_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Número de Contrato</Label>
                      <Input
                        value={formData.contract_number}
                        onChange={(e) => setFormData({...formData, contract_number: e.target.value})}
                        placeholder="Ej: CTR-2024-001"
                      />
                    </div>
                    <div>
                      <Label>Tipo de Contrato *</Label>
                      <Select value={formData.contract_type} onValueChange={(v) => setFormData({...formData, contract_type: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Indeterminado">Indeterminado</SelectItem>
                          <SelectItem value="Plazo Fijo">Plazo Fijo</SelectItem>
                          <SelectItem value="Part-Time">Part-Time</SelectItem>
                          <SelectItem value="Prácticas">Prácticas</SelectItem>
                          <SelectItem value="Obra o Servicio">Obra o Servicio</SelectItem>
                          <SelectItem value="Intermitente">Intermitente</SelectItem>
                          <SelectItem value="Temporal">Temporal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Fecha de Inicio *</Label>
                      <Input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                      />
                    </div>
                    {formData.contract_type !== "Indeterminado" && (
                      <div>
                        <Label>Fecha de Fin</Label>
                        <Input
                          type="date"
                          value={formData.end_date}
                          onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                        />
                      </div>
                    )}
                    <div>
                      <Label>Fecha de Firma</Label>
                      <Input
                        type="date"
                        value={formData.signed_date}
                        onChange={(e) => setFormData({...formData, signed_date: e.target.value})}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Estado</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Vigente">Vigente</SelectItem>
                        <SelectItem value="Vencido">Vencido</SelectItem>
                        <SelectItem value="Rescindido">Rescindido</SelectItem>
                        <SelectItem value="Renovado">Renovado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>

                <TabsContent value="work" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Cargo *</Label>
                      <Select value={formData.position} onValueChange={(val) => setFormData({ ...formData, position: val })}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar cargo" /></SelectTrigger>
                        <SelectContent>
                          <div className="p-2 border-b">
                            <Input
                              placeholder="Buscar cargo..."
                              value={positionSearchTerm}
                              onChange={(e) => setPositionSearchTerm(e.target.value)}
                              className="h-8"
                              onClick={(e) => e.stopPropagation()}
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
                      <Label>Departamento/Área</Label>
                      <Select value={formData.department} onValueChange={(val) => setFormData({ ...formData, department: val })}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar departamento" /></SelectTrigger>
                        <SelectContent>
                          <div className="p-2 border-b">
                            <Input
                              placeholder="Buscar departamento..."
                              value={departmentSearchTerm}
                              onChange={(e) => setDepartmentSearchTerm(e.target.value)}
                              className="h-8"
                              onClick={(e) => e.stopPropagation()}
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
                  </div>

                  <div>
                    <Label>Sede</Label>
                    <Select value={formData.work_location} onValueChange={(val) => setFormData({ ...formData, work_location: val })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar sede" /></SelectTrigger>
                      <SelectContent>
                        <div className="p-2 border-b">
                          <Input
                            placeholder="Buscar sede..."
                            value={siteSearchTerm}
                            onChange={(e) => setSiteSearchTerm(e.target.value)}
                            className="h-8"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        {sites
                          .filter(site => site.name.toLowerCase().includes(siteSearchTerm.toLowerCase()))
                          .map(site => (
                            <SelectItem key={site.id} value={site.name}>
                              {site.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Remuneración Mensual (S/) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.salary}
                        onChange={(e) => setFormData({...formData, salary: parseFloat(e.target.value)})}
                      />
                    </div>
                    <div>
                      <Label>Horas Semanales</Label>
                      <Input
                        type="number"
                        value={formData.weekly_hours}
                        onChange={(e) => setFormData({...formData, weekly_hours: parseInt(e.target.value)})}
                      />
                    </div>
                    <div>
                      <Label>Periodo de Prueba (días)</Label>
                      <Input
                        type="number"
                        value={formData.trial_period_days}
                        onChange={(e) => setFormData({...formData, trial_period_days: parseInt(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Horario de Trabajo</Label>
                    <Input
                      value={formData.work_schedule}
                      onChange={(e) => setFormData({...formData, work_schedule: e.target.value})}
                      placeholder="Ej: Lunes a Viernes de 9:00 AM a 6:00 PM"
                    />
                  </div>

                  {formData.contract_type !== "Indeterminado" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="renewable"
                        checked={formData.renewable}
                        onChange={(e) => setFormData({...formData, renewable: e.target.checked})}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="renewable" className="text-sm">Contrato Renovable</label>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="details" className="space-y-4">
                  <div>
                    <Label>Funciones y Responsabilidades</Label>
                    <Textarea
                      value={formData.functions}
                      onChange={(e) => setFormData({...formData, functions: e.target.value})}
                      rows={4}
                      placeholder="Describe las funciones principales del cargo..."
                    />
                  </div>

                  <div>
                    <Label>Beneficios Adicionales</Label>
                    <Textarea
                      value={formData.benefits}
                      onChange={(e) => setFormData({...formData, benefits: e.target.value})}
                      rows={3}
                      placeholder="Ej: Seguro médico privado, bono por desempeño..."
                    />
                  </div>

                  <div>
                    <Label>Notas</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      rows={3}
                      placeholder="Observaciones adicionales..."
                    />
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
                  disabled={createContractMutation.isPending || updateContractMutation.isPending}
                >
                  {editingContract ? "Actualizar" : "Crear"} Contrato
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Conflict Modal */}
      {conflictingContract && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-6"
          onClick={() => setConflictingContract(null)}
        >
          <Card 
            className="max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b bg-amber-50">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">
                    Contrato Vigente Detectado
                  </CardTitle>
                  <p className="text-sm text-slate-600 mt-1">
                    Este empleado ya tiene un contrato vigente
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-2">Contrato actual:</p>
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">
                    {conflictingContract.position} - {conflictingContract.contract_type}
                  </p>
                  <p className="text-sm text-slate-600">
                    Inicio: {format(new Date(conflictingContract.start_date), "dd/MM/yyyy")}
                  </p>
                  <p className="text-sm text-slate-600">
                    Remuneración: S/ {conflictingContract.salary.toFixed(2)}
                  </p>
                </div>
              </div>

              <p className="text-sm text-slate-700 mb-4">
                Para registrar el nuevo contrato, primero debes cambiar el estado del contrato actual.
                Selecciona el nuevo estado:
              </p>

              <div className="space-y-3">
                <Button
                  className="w-full justify-start bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                  variant="outline"
                  onClick={() => handleResolveConflict("Vencido")}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Marcar como Vencido
                </Button>
                <Button
                  className="w-full justify-start bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
                  variant="outline"
                  onClick={() => handleResolveConflict("Rescindido")}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Marcar como Rescindido
                </Button>
                <Button
                  className="w-full justify-start bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                  variant="outline"
                  onClick={() => handleResolveConflict("Renovado")}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Marcar como Renovado
                </Button>
              </div>

              <div className="mt-6 pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setConflictingContract(null)}
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}