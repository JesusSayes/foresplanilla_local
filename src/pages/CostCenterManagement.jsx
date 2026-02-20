import React, { useState, useEffect, useMemo } from "react";
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
  Building2, Plus, Edit, Trash2, Users, GitBranch, History, 
  Download, FileSpreadsheet, FileText, DollarSign, Search, Calendar, Grid3x3, List
} from "lucide-react";
import { usePermissions } from "../components/hooks/usePermissions";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { createPageUrl } from "../utils";

export default function CostCenterManagement() {
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showCCForm, setShowCCForm] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [editingCC, setEditingCC] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [selectedCC, setSelectedCC] = useState(null);
  const [ccFormData, setCCFormData] = useState({});
  const [assignmentFormData, setAssignmentFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState(null);
  const [viewMode, setViewMode] = useState("grid");
  const [assignmentSearchTerm, setAssignmentSearchTerm] = useState("");
  const [unassignedSearchTerm, setUnassignedSearchTerm] = useState("");
  const [historySearchTerm, setHistorySearchTerm] = useState("");

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
        const employees = await base44.entities.Employee.filter({ work_email: user.email });
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };
    loadUserData();
  }, []);

  const { data: costCenters = [] } = useQuery({
    queryKey: ["costCenters"],
    queryFn: () => base44.entities.CostCenter.list("code"),
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["costCenterAssignments"],
    queryFn: () => base44.entities.CostCenterAssignment.list("-created_date"),
  });

  const { data: changeLogs = [] } = useQuery({
    queryKey: ["costCenterChangeLogs"],
    queryFn: () => base44.entities.CostCenterChangeLog.list("-change_date", 200),
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      const employees = await base44.entities.Employee.list("first_name");
      return employees.filter(e => e.status === "Activo");
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const allDepts = await base44.entities.Department.list("name");
      return allDepts.filter(d => d.is_active);
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["costCenterCategories"],
    queryFn: async () => {
      const allCategories = await base44.entities.CostCenterCategory.list("code");
      return allCategories.filter(c => c.is_active);
    },
  });

  const createCCMutation = useMutation({
    mutationFn: async (data) => {
      const cc = await base44.entities.CostCenter.create(data);
      await base44.entities.CostCenterChangeLog.create({
        cost_center_id: cc.id,
        change_type: "Creación Centro Costo",
        entity_type: "CostCenter",
        entity_id: cc.id,
        field_changed: "Centro de Costo",
        old_value: "",
        new_value: `${cc.code} - ${cc.name}`,
        changed_by: currentUser?.email || "Sistema",
        change_date: new Date().toISOString(),
      });
      return cc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["costCenters"]);
      queryClient.invalidateQueries(["costCenterChangeLogs"]);
      toast.success("Centro de costos creado");
      setShowCCForm(false);
      resetCCForm();
    },
  });

  const updateCCMutation = useMutation({
    mutationFn: async ({ id, data, oldData }) => {
      const cc = await base44.entities.CostCenter.update(id, data);
      
      Object.keys(data).forEach(async (key) => {
        if (oldData[key] !== data[key]) {
          await base44.entities.CostCenterChangeLog.create({
            cost_center_id: id,
            change_type: "Modificación Centro Costo",
            entity_type: "CostCenter",
            entity_id: id,
            field_changed: key,
            old_value: String(oldData[key] || ""),
            new_value: String(data[key] || ""),
            changed_by: currentUser?.email || "Sistema",
            change_date: new Date().toISOString(),
          });
        }
      });
      
      return cc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["costCenters"]);
      queryClient.invalidateQueries(["costCenterChangeLogs"]);
      toast.success("Centro de costos actualizado");
      resetCCForm();
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async (data) => {
      const assignment = await base44.entities.CostCenterAssignment.create(data);
      
      const cc = costCenters.find(c => c.id === data.cost_center_id);
      const entityName = data.assignment_type === "Empleado" 
        ? allEmployees.find(e => e.id === data.employee_id)?.first_name + " " + allEmployees.find(e => e.id === data.employee_id)?.last_name
        : data.department_name;
      
      await base44.entities.CostCenterChangeLog.create({
        cost_center_id: data.cost_center_id,
        assignment_id: assignment.id,
        change_type: data.assignment_type === "Empleado" ? "Asignación Empleado" : "Asignación Departamento",
        entity_type: "Assignment",
        entity_id: assignment.id,
        field_changed: "Nueva asignación",
        old_value: "",
        new_value: `${entityName} → ${cc?.code} - ${cc?.name}`,
        changed_by: currentUser?.email || "Sistema",
        change_date: new Date().toISOString(),
      });
      
      return assignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["costCenterAssignments"]);
      queryClient.invalidateQueries(["costCenterChangeLogs"]);
      toast.success("Asignación creada");
      resetAssignmentForm();
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data, oldData }) => {
      const assignment = await base44.entities.CostCenterAssignment.update(id, data);
      
      await base44.entities.CostCenterChangeLog.create({
        cost_center_id: data.cost_center_id || oldData.cost_center_id,
        assignment_id: id,
        change_type: "Reasignación",
        entity_type: "Assignment",
        entity_id: id,
        field_changed: "Modificación de asignación",
        old_value: JSON.stringify(oldData),
        new_value: JSON.stringify(data),
        changed_by: currentUser?.email || "Sistema",
        change_date: new Date().toISOString(),
      });
      
      return assignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["costCenterAssignments"]);
      queryClient.invalidateQueries(["costCenterChangeLogs"]);
      toast.success("Asignación actualizada");
      resetAssignmentForm();
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignment) => {
      await base44.entities.CostCenterChangeLog.create({
        cost_center_id: assignment.cost_center_id,
        assignment_id: assignment.id,
        change_type: "Finalización Asignación",
        entity_type: "Assignment",
        entity_id: assignment.id,
        field_changed: "Eliminación",
        old_value: assignment.assignment_type === "Empleado" ? assignment.employee_id : assignment.department_name,
        new_value: "Eliminado",
        changed_by: currentUser?.email || "Sistema",
        change_date: new Date().toISOString(),
      });
      
      return await base44.entities.CostCenterAssignment.delete(assignment.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["costCenterAssignments"]);
      queryClient.invalidateQueries(["costCenterChangeLogs"]);
      toast.success("Asignación eliminada");
    },
  });

  const handleCreateCC = () => {
    setCCFormData({ name: "", code: "", category: "Administración", is_active: true });
    setEditingCC(null);
    setShowCCForm(true);
  };

  const handleEditCC = (cc) => {
    setCCFormData({ ...cc });
    setEditingCC(cc);
    setShowCCForm(true);
  };

  const handleSubmitCC = () => {
    if (!ccFormData.code || !ccFormData.name) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    if (editingCC) {
      updateCCMutation.mutate({ id: editingCC.id, data: ccFormData, oldData: editingCC });
    } else {
      createCCMutation.mutate(ccFormData);
    }
  };

  const resetCCForm = () => {
    setCCFormData({});
    setEditingCC(null);
    setShowCCForm(false);
  };

  const handleCreateAssignment = (cc = null) => {
    setAssignmentFormData({
      cost_center_id: cc?.id || selectedCC?.id || "",
      assignment_type: "Empleado",
      employee_id: "",
      department_name: "",
      percentage: 100,
      start_date: format(new Date(), "yyyy-MM-dd"),
      is_active: true,
      notes: "",
    });
    setEditingAssignment(null);
    setShowAssignmentForm(true);
  };

  const handleEditAssignment = (assignment) => {
    setAssignmentFormData({ ...assignment });
    setEditingAssignment(assignment);
    setShowAssignmentForm(true);
  };

  const handleSubmitAssignment = () => {
    if (!assignmentFormData.cost_center_id || !assignmentFormData.start_date) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    if (assignmentFormData.assignment_type === "Empleado" && !assignmentFormData.employee_id) {
      toast.error("Selecciona un empleado");
      return;
    }

    if (assignmentFormData.assignment_type === "Departamento" && !assignmentFormData.department_name) {
      toast.error("Selecciona un departamento");
      return;
    }

    if (editingAssignment) {
      updateAssignmentMutation.mutate({ 
        id: editingAssignment.id, 
        data: assignmentFormData,
        oldData: editingAssignment 
      });
    } else {
      createAssignmentMutation.mutate(assignmentFormData);
    }
  };

  const resetAssignmentForm = () => {
    setAssignmentFormData({});
    setEditingAssignment(null);
    setShowAssignmentForm(false);
    setEmployeeSearchTerm("");
  };

  const exportToExcel = () => {
    const data = costCenters.map(cc => {
      const ccAssignments = assignments.filter(a => a.cost_center_id === cc.id && a.is_active);
      const employeeAssignments = ccAssignments.filter(a => a.assignment_type === "Empleado");
      const deptAssignments = ccAssignments.filter(a => a.assignment_type === "Departamento");
      
      return {
        'Código': cc.code,
        'Nombre': cc.name,
        'Categoría': cc.category,
        'Estado': cc.is_active ? "Activo" : "Inactivo",
        'Empleados Asignados': employeeAssignments.length,
        'Departamentos Asignados': deptAssignments.length,
        'Total Asignaciones': ccAssignments.length,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Centros de Costo');
    XLSX.writeFile(wb, `CentrosCosto_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Archivo Excel generado");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Reporte de Centros de Costo", 14, 20);
    doc.setFontSize(11);
    doc.text(`Fecha: ${format(new Date(), "dd/MM/yyyy")}`, 14, 28);
    
    const tableData = costCenters.map(cc => {
      const ccAssignments = assignments.filter(a => a.cost_center_id === cc.id && a.is_active);
      return [
        cc.code,
        cc.name,
        cc.category,
        cc.is_active ? "Activo" : "Inactivo",
        ccAssignments.filter(a => a.assignment_type === "Empleado").length,
        ccAssignments.filter(a => a.assignment_type === "Departamento").length,
      ];
    });

    doc.autoTable({
      startY: 35,
      head: [['Código', 'Nombre', 'Categoría', 'Estado', 'Empleados', 'Deptos']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`CentrosCosto_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF generado");
  };

  const filteredCostCenters = costCenters.filter(cc => {
    const matchesSearch = cc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cc.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || cc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = ["Administración", "Ventas", "Transportes", "Oxapampa", "Lima - VES", "Operaciones Generales"];

  // Empleados sin asignación de centro de costo
  const employeesWithoutCC = useMemo(() => {
    return allEmployees.filter(emp => {
      const hasIndividualAssignment = assignments.some(a => 
        a.assignment_type === "Empleado" && 
        a.employee_id === emp.id && 
        a.is_active &&
        (!a.end_date || new Date(a.end_date) >= new Date())
      );
      
      if (hasIndividualAssignment) return false;
      
      const hasDepartmentAssignment = emp.department_name && assignments.some(a => 
        a.assignment_type === "Departamento" && 
        a.department_name === emp.department_name && 
        a.is_active &&
        (!a.end_date || new Date(a.end_date) >= new Date())
      );
      
      return !hasDepartmentAssignment;
    });
  }, [allEmployees, assignments]);

  const filteredHistory = historyFilter 
    ? changeLogs.filter(log => log.cost_center_id === historyFilter)
    : changeLogs;

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

  if (!hasPermission("cost_centers.view")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para ver centros de costos</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canCreate = hasPermission("cost_centers.create");
  const canEdit = hasPermission("cost_centers.edit");
  const canDelete = hasPermission("cost_centers.delete");
  const canAssign = hasPermission("cost_centers.assign");
  const canViewAmounts = hasPermission("cost_centers.view_amounts");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Gestión de Centros de Costo</h1>
            <p className="text-slate-600 text-lg">Administra centros de costo y asignaciones</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => window.location.href = createPageUrl("CostCenterValuation")}
              variant="outline"
              className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Consulta Valorizada
            </Button>
          </div>
        </div>

        <Tabs defaultValue="centers" className="space-y-6">
          <TabsList className="grid w-full max-w-3xl grid-cols-4">
            <TabsTrigger value="centers">Centros de Costo</TabsTrigger>
            <TabsTrigger value="assignments">Asignaciones</TabsTrigger>
            <TabsTrigger value="unassigned">
              Sin Asignar
              {employeesWithoutCC.length > 0 && (
                <Badge className="ml-2 bg-orange-600 text-white">{employeesWithoutCC.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          {/* Centros de Costo Tab */}
          <TabsContent value="centers">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle>Centros de Costo Registrados</CardTitle>
                  <div className="flex gap-2">
                    <div className="flex border rounded-lg overflow-hidden">
                      <Button
                        onClick={() => setViewMode("grid")}
                        variant={viewMode === "grid" ? "default" : "ghost"}
                        size="sm"
                        className={viewMode === "grid" ? "bg-indigo-600" : ""}
                      >
                        <Grid3x3 className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => setViewMode("table")}
                        variant={viewMode === "table" ? "default" : "ghost"}
                        size="sm"
                        className={viewMode === "table" ? "bg-indigo-600" : ""}
                      >
                        <List className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button onClick={exportToExcel} variant="outline" size="sm">
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Excel
                    </Button>
                    <Button onClick={exportToPDF} variant="outline" size="sm">
                      <FileText className="w-4 h-4 mr-2" />
                      PDF
                    </Button>
                    {canCreate && (
                      <Button onClick={handleCreateCC} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Nuevo Centro
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex gap-4 mb-6">
                  <div className="flex-1 relative">
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
                </div>

                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCostCenters.map(cc => {
                      const ccAssignments = assignments.filter(a => a.cost_center_id === cc.id && a.is_active);
                      const employeeCount = ccAssignments.filter(a => a.assignment_type === "Empleado").length;
                      const deptCount = ccAssignments.filter(a => a.assignment_type === "Departamento").length;
                      
                      return (
                        <Card key={cc.id} className="border-2 hover:shadow-lg transition-all">
                          <CardContent className="p-5">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Building2 className="w-5 h-5 text-indigo-600" />
                                  <h3 className="font-bold text-slate-900">{cc.code}</h3>
                                </div>
                                <p className="text-sm text-slate-700 mb-2">{cc.name}</p>
                                <Badge className="bg-blue-100 text-blue-700">{cc.category}</Badge>
                              </div>
                              <Badge className={cc.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                                {cc.is_active ? "Activo" : "Inactivo"}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                              <div className="p-2 bg-purple-50 rounded">
                                <div className="flex items-center gap-1 text-purple-600 mb-1">
                                  <Users className="w-3 h-3" />
                                  <span className="text-xs">Empleados</span>
                                </div>
                                <p className="font-bold text-purple-900">{employeeCount}</p>
                              </div>
                              <div className="p-2 bg-indigo-50 rounded">
                                <div className="flex items-center gap-1 text-indigo-600 mb-1">
                                  <GitBranch className="w-3 h-3" />
                                  <span className="text-xs">Deptos</span>
                                </div>
                                <p className="font-bold text-indigo-900">{deptCount}</p>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              {canAssign && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => {
                                    setSelectedCC(cc);
                                    handleCreateAssignment(cc);
                                  }}
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Asignar
                                </Button>
                              )}
                              {canEdit && (
                                <Button size="sm" variant="outline" onClick={() => handleEditCC(cc)}>
                                  <Edit className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setHistoryFilter(cc.id);
                                  setShowHistory(true);
                                }}
                              >
                                <History className="w-3 h-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 border-b-2">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Código</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Nombre</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Categoría</th>
                          <th className="text-center p-3 font-semibold text-slate-700">Empleados</th>
                          <th className="text-center p-3 font-semibold text-slate-700">Deptos</th>
                          <th className="text-center p-3 font-semibold text-slate-700">Estado</th>
                          <th className="text-center p-3 font-semibold text-slate-700">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCostCenters.map(cc => {
                          const ccAssignments = assignments.filter(a => a.cost_center_id === cc.id && a.is_active);
                          const employeeCount = ccAssignments.filter(a => a.assignment_type === "Empleado").length;
                          const deptCount = ccAssignments.filter(a => a.assignment_type === "Departamento").length;
                          
                          return (
                            <tr key={cc.id} className="border-b hover:bg-slate-50">
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-indigo-600" />
                                  <span className="font-bold text-slate-900">{cc.code}</span>
                                </div>
                              </td>
                              <td className="p-3 text-slate-700">{cc.name}</td>
                              <td className="p-3">
                                <Badge className="bg-blue-100 text-blue-700">{cc.category}</Badge>
                              </td>
                              <td className="p-3 text-center">
                                <Badge className="bg-purple-100 text-purple-700">{employeeCount}</Badge>
                              </td>
                              <td className="p-3 text-center">
                                <Badge className="bg-indigo-100 text-indigo-700">{deptCount}</Badge>
                              </td>
                              <td className="p-3 text-center">
                                <Badge className={cc.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                                  {cc.is_active ? "Activo" : "Inactivo"}
                                </Badge>
                              </td>
                              <td className="p-3">
                                <div className="flex gap-1 justify-center">
                                  {canAssign && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setSelectedCC(cc);
                                        handleCreateAssignment(cc);
                                      }}
                                      title="Asignar"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  )}
                                  {canEdit && (
                                    <Button size="sm" variant="outline" onClick={() => handleEditCC(cc)} title="Editar">
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setHistoryFilter(cc.id);
                                      setShowHistory(true);
                                    }}
                                    title="Historial"
                                  >
                                    <History className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Empleados sin asignar Tab */}
          <TabsContent value="unassigned">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-orange-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-orange-600" />
                      Empleados sin Centro de Costo
                    </CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Empleados activos que no tienen asignación individual ni departamental
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Buscar empleado..."
                    value={unassignedSearchTerm}
                    onChange={(e) => setUnassignedSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {employeesWithoutCC.filter(emp => {
                  if (!unassignedSearchTerm) return true;
                  const searchLower = unassignedSearchTerm.toLowerCase();
                  return (
                    emp.first_name.toLowerCase().includes(searchLower) ||
                    emp.last_name.toLowerCase().includes(searchLower) ||
                    emp.employee_code.toLowerCase().includes(searchLower) ||
                    emp.department_name?.toLowerCase().includes(searchLower)
                  );
                }).length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-green-300 mx-auto mb-4" />
                    <p className="text-slate-600">
                      {unassignedSearchTerm 
                        ? "No se encontraron empleados con ese criterio" 
                        : "Todos los empleados activos tienen centro de costo asignado"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {employeesWithoutCC.filter(emp => {
                      if (!unassignedSearchTerm) return true;
                      const searchLower = unassignedSearchTerm.toLowerCase();
                      return (
                        emp.first_name.toLowerCase().includes(searchLower) ||
                        emp.last_name.toLowerCase().includes(searchLower) ||
                        emp.employee_code.toLowerCase().includes(searchLower) ||
                        emp.department_name?.toLowerCase().includes(searchLower)
                      );
                    }).map(emp => (
                     <div key={emp.id} className="p-4 border-2 border-orange-200 bg-orange-50/30 rounded-lg">
                       <div className="flex items-center justify-between">
                         <div className="flex-1">
                           <div className="flex items-center gap-2 mb-1">
                             <h4 className="font-bold text-slate-900">
                               {emp.first_name} {emp.last_name}
                             </h4>
                             <Badge className={
                               emp.status === "Activo" ? "bg-green-100 text-green-700" :
                               emp.status === "Suspendido" ? "bg-yellow-100 text-yellow-700" :
                               "bg-gray-100 text-gray-700"
                             }>
                               {emp.status}
                             </Badge>
                           </div>
                           <p className="text-sm text-slate-600">
                             {emp.employee_code} • {emp.position} • {emp.department_name || "Sin departamento"}
                           </p>
                         </div>
                          {canAssign && (
                            <Button
                              size="sm"
                              className="bg-indigo-600 hover:bg-indigo-700"
                              onClick={() => {
                                setAssignmentFormData({
                                  cost_center_id: "",
                                  assignment_type: "Empleado",
                                  employee_id: emp.id,
                                  department_name: "",
                                  percentage: 100,
                                  start_date: format(new Date(), "yyyy-MM-dd"),
                                  is_active: true,
                                  notes: "",
                                });
                                setEditingAssignment(null);
                                setShowAssignmentForm(true);
                              }}
                            >
                              <Plus className="w-3 h-3 mr-2" />
                              Asignar Centro de Costo
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Asignaciones Tab */}
          <TabsContent value="assignments">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle>Asignaciones Activas</CardTitle>
                  {canAssign && (
                    <Button onClick={() => handleCreateAssignment()} className="bg-indigo-600 hover:bg-indigo-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Nueva Asignación
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Buscar asignación..."
                    value={assignmentSearchTerm}
                    onChange={(e) => setAssignmentSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="space-y-3">
                  {assignments.filter(a => {
                    if (!a.is_active) return false;
                    if (!assignmentSearchTerm) return true;
                    const cc = costCenters.find(c => c.id === a.cost_center_id);
                    const emp = a.assignment_type === "Empleado" 
                      ? allEmployees.find(e => e.id === a.employee_id)
                      : null;
                    const searchLower = assignmentSearchTerm.toLowerCase();
                    return (
                      cc?.code.toLowerCase().includes(searchLower) ||
                      cc?.name.toLowerCase().includes(searchLower) ||
                      a.department_name?.toLowerCase().includes(searchLower) ||
                      emp?.first_name.toLowerCase().includes(searchLower) ||
                      emp?.last_name.toLowerCase().includes(searchLower) ||
                      emp?.employee_code.toLowerCase().includes(searchLower)
                    );
                  }).map(assignment => {
                    const cc = costCenters.find(c => c.id === assignment.cost_center_id);
                    const emp = assignment.assignment_type === "Empleado" 
                      ? allEmployees.find(e => e.id === assignment.employee_id)
                      : null;
                    
                    return (
                     <div key={assignment.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                       <div className="flex items-center justify-between">
                         <div className="flex-1">
                           <div className="flex items-center gap-3 mb-2">
                             <Badge className={assignment.assignment_type === "Empleado" ? "bg-purple-100 text-purple-700" : "bg-indigo-100 text-indigo-700"}>
                               {assignment.assignment_type}
                             </Badge>
                             <h4 className="font-bold text-slate-900">
                               {assignment.assignment_type === "Empleado" 
                                 ? `${emp?.first_name} ${emp?.last_name}` 
                                 : assignment.department_name}
                             </h4>
                             {assignment.assignment_type === "Empleado" && emp && (
                               <Badge className={
                                 emp.status === "Activo" ? "bg-green-100 text-green-700" :
                                 emp.status === "Suspendido" ? "bg-yellow-100 text-yellow-700" :
                                 "bg-gray-100 text-gray-700"
                               }>
                                 {emp.status}
                               </Badge>
                             )}
                             <span className="text-slate-500">→</span>
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-indigo-600" />
                                <span className="font-semibold text-indigo-600">{cc?.code}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-600">
                              <span>Inicio: {format(new Date(assignment.start_date), "dd/MM/yyyy")}</span>
                              {assignment.end_date && (
                                <span>Fin: {format(new Date(assignment.end_date), "dd/MM/yyyy")}</span>
                              )}
                              <span>Porcentaje: {assignment.percentage}%</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {canEdit && (
                              <Button size="sm" variant="outline" onClick={() => handleEditAssignment(assignment)}>
                                <Edit className="w-3 h-3" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => {
                                  if (confirm("¿Eliminar esta asignación?")) {
                                    deleteAssignmentMutation.mutate(assignment);
                                  }
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Historial Tab */}
          <TabsContent value="history">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle>Historial de Cambios</CardTitle>
                  {showHistory && (
                    <Button onClick={() => { setShowHistory(false); setHistoryFilter(null); }} variant="outline">
                      Ver Todo
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Buscar en historial..."
                    value={historySearchTerm}
                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="space-y-3">
                  {filteredHistory.filter(log => {
                    if (!historySearchTerm) return true;
                    const cc = costCenters.find(c => c.id === log.cost_center_id);
                    const searchLower = historySearchTerm.toLowerCase();
                    return (
                      cc?.code.toLowerCase().includes(searchLower) ||
                      cc?.name.toLowerCase().includes(searchLower) ||
                      log.change_type.toLowerCase().includes(searchLower) ||
                      log.field_changed.toLowerCase().includes(searchLower) ||
                      log.changed_by.toLowerCase().includes(searchLower)
                    );
                  }).slice(0, 50).map(log => {
                    const cc = costCenters.find(c => c.id === log.cost_center_id);
                    return (
                      <div key={log.id} className="p-4 border border-slate-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-indigo-100 text-indigo-700">{log.change_type}</Badge>
                              {cc && (
                                <span className="text-sm font-semibold text-slate-700">
                                  {cc.code} - {cc.name}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 mb-1">
                              <strong>Campo:</strong> {log.field_changed}
                            </p>
                            {log.old_value && (
                              <p className="text-sm text-slate-600">
                                <strong>Anterior:</strong> {log.old_value} → <strong>Nuevo:</strong> {log.new_value}
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                              <span>{log.changed_by}</span>
                              <span>•</span>
                              <span>{format(new Date(log.change_date), "dd MMM yyyy HH:mm", { locale: es })}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Centro de Costo Form Modal */}
      {showCCForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={resetCCForm}>
          <Card className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <CardTitle>{editingCC ? "Editar Centro de Costo" : "Nuevo Centro de Costo"}</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Código *</Label>
                  <Input
                    value={ccFormData.code}
                    onChange={(e) => setCCFormData({ ...ccFormData, code: e.target.value })}
                    placeholder="Ej: CC-001"
                  />
                </div>
                <div>
                  <Label>Categoría Operacional *</Label>
                  <Select value={ccFormData.category} onValueChange={(v) => setCCFormData({ ...ccFormData, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={ccFormData.name}
                  onChange={(e) => setCCFormData({ ...ccFormData, name: e.target.value })}
                  placeholder="Nombre descriptivo del centro de costo"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ccFormData.is_active}
                  onChange={(e) => setCCFormData({ ...ccFormData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label>Activo</Label>
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={resetCCForm}>Cancelar</Button>
                <Button className="flex-1 bg-indigo-600" onClick={handleSubmitCC}>
                  {editingCC ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Asignación Form Modal */}
      {showAssignmentForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={resetAssignmentForm}>
          <Card className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <CardTitle>{editingAssignment ? "Editar Asignación" : "Nueva Asignación"}</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label>Centro de Costo *</Label>
                <Select 
                  value={assignmentFormData.cost_center_id} 
                  onValueChange={(v) => setAssignmentFormData({ ...assignmentFormData, cost_center_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar centro" /></SelectTrigger>
                  <SelectContent>
                    {costCenters.filter(c => c.is_active).map(cc => (
                      <SelectItem key={cc.id} value={cc.id}>
                        {cc.code} - {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tipo de Asignación *</Label>
                <Select 
                  value={assignmentFormData.assignment_type} 
                  onValueChange={(v) => setAssignmentFormData({ ...assignmentFormData, assignment_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Empleado">Empleado Individual</SelectItem>
                    <SelectItem value="Departamento">Departamento Completo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {assignmentFormData.assignment_type === "Empleado" && (
                <div>
                  <Label>Empleado *</Label>
                  <Select 
                    value={assignmentFormData.employee_id} 
                    onValueChange={(v) => setAssignmentFormData({ ...assignmentFormData, employee_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-2 border-b sticky top-0 bg-white">
                        <Input
                          placeholder="Buscar..."
                          value={employeeSearchTerm}
                          onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                          className="h-8"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      {allEmployees
                        .filter(e => 
                          e.first_name.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
                          e.last_name.toLowerCase().includes(employeeSearchTerm.toLowerCase())
                        )
                        .map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.employee_code} - {emp.first_name} {emp.last_name} ({emp.status})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {assignmentFormData.assignment_type === "Departamento" && (
                <div>
                  <Label>Departamento *</Label>
                  <Select 
                    value={assignmentFormData.department_name} 
                    onValueChange={(v) => setAssignmentFormData({ ...assignmentFormData, department_name: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleccionar departamento" /></SelectTrigger>
                    <SelectContent>
                      {departments.map(dept => (
                        <SelectItem key={dept.id} value={dept.name}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Fecha Inicio *</Label>
                  <Input
                    type="date"
                    value={assignmentFormData.start_date}
                    onChange={(e) => setAssignmentFormData({ ...assignmentFormData, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fecha Fin</Label>
                  <Input
                    type="date"
                    value={assignmentFormData.end_date}
                    onChange={(e) => setAssignmentFormData({ ...assignmentFormData, end_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Porcentaje %</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={assignmentFormData.percentage}
                    onChange={(e) => setAssignmentFormData({ ...assignmentFormData, percentage: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <Label>Notas</Label>
                <Textarea
                  value={assignmentFormData.notes}
                  onChange={(e) => setAssignmentFormData({ ...assignmentFormData, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={resetAssignmentForm}>Cancelar</Button>
                <Button className="flex-1 bg-indigo-600" onClick={handleSubmitAssignment}>
                  {editingAssignment ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}