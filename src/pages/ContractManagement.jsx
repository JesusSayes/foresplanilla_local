import React, { useState } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileText, Plus, Edit, Download, Search, Calendar,
  CheckCircle, AlertCircle, XCircle, Star, PenLine, Shield, Users
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { todayLima, parseDateLima } from "@/lib/dateUtils";
import { toast } from "sonner";
import { generateContractPDF } from "../components/contracts/ContractTemplate";
import { usePermissions } from "../components/hooks/usePermissions";
import { uploadFile } from "@/services/uploadService";

export default function ContractManagement() {
  const { user: currentUser } = useAuth();
  // const employee = currentUser?.employee || null;
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [signatureFilter, setSignatureFilter] = useState("all"); // all | signed | pending
  const [expiryFilter, setExpiryFilter] = useState("all"); // all | 15days | 30days
  const [formData, setFormData] = useState({});
  const [positionSearchTerm, setPositionSearchTerm] = useState("");
  const [departmentSearchTerm, setDepartmentSearchTerm] = useState("");
  const [siteSearchTerm, setSiteSearchTerm] = useState("");
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [conflictingContract, setConflictingContract] = useState(null);
  const [selectedForBulkSign, setSelectedForBulkSign] = useState(new Set());
  const [confirmSign, setConfirmSign] = useState(null); // { mode: 'single'|'bulk', contract?: contract }
  const [isBulkSigning, setIsBulkSigning] = useState(false);
  const [signatureImageUrl, setSignatureImageUrl] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const queryClient = useQueryClient();
  const { hasPermission, employee, loading: loadingPerms } = usePermissions();

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await entitiesAPI.Employee.filter({ status: "Activo" });
    },
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const allPositions = await entitiesAPI.Position.list("name");
      return allPositions.filter(p => p.is_active);
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const allDepartments = await entitiesAPI.Department.list("name");
      return allDepartments.filter(d => d.is_active);
    },
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const allSites = await entitiesAPI.Site.list("name");
      return allSites.filter(s => s.is_active);
    },
  });

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      return await entitiesAPI.Contract.list("-created_date");
    },
  });

  const { data: contractTemplates = [] } = useQuery({
    queryKey: ["contractTemplates"],
    queryFn: async () => {
      const templates = await entitiesAPI.ContractTemplate.list("-created_date");
      return templates.filter(t => t.is_active);
    },
    enabled: !!employee,
  });

  const { data: companyInfo } = useQuery({
    queryKey: ["companyInfo"],
    queryFn: async () => {
      const info = await entitiesAPI.CompanyInfo.list("-created_date");
      return info.length > 0 ? info[0] : null;
    },
    enabled: !!employee,
  });

  const defaultTemplate = contractTemplates.find(t => t.is_default) || contractTemplates[0] || null;

  const createContractMutation = useMutation({
    mutationFn: async (data) => {
      if (!data.contract_number) {
        const year = parseInt(todayLima().substring(0, 4));
        const existing = await entitiesAPI.Contract.list("-created_date");
        const thisYear = existing.filter(c => c.contract_number?.startsWith(`CTR-${year}`));
        data.contract_number = `CTR-${year}-${String(thisYear.length + 1).padStart(3, '0')}`;
      }

      return await entitiesAPI.Contract.create(data);
    },
    onSuccess: (newContract) => {
      queryClient.invalidateQueries(["contracts"]);
      toast.success(`Contrato ${newContract.contract_number} creado correctamente`);
      resetForm();
    },
    onError: () => toast.error("Error al crear el contrato"),
  });

  const updateContractMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await entitiesAPI.Contract.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contracts"]);
      toast.success("Contrato actualizado correctamente");
      resetForm();
    },
    onError: () => toast.error("Error al actualizar el contrato"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      return await entitiesAPI.Contract.update(id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contracts"]);
      toast.success("Estado actualizado");
    },
  });

  const signContractMutation = useMutation({
    mutationFn: ({ id }) => entitiesAPI.Contract.update(id, {
      is_digitally_signed: true,
      digital_signature_date: new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" })).toISOString(),
      digital_signature_by: currentUser?.email || "",
      digital_signature_name: companyInfo?.legal_representative || (employee ? `${employee.first_name} ${employee.last_name}` : ""),
      digital_signature_image_url: companyInfo?.legal_representative_signature_url || signatureImageUrl || "",
    }),
    onSuccess: () => queryClient.invalidateQueries(["contracts"]),
  });

  const initializeForm = (contract = null, emp = null) => {
    const normalizeDate = (d) => {
      if (!d) return "";
      // Si ya es string "yyyy-MM-dd", devolver tal cual (se guardó en Lima)
      if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      // Si es Date object o ISO string, convertir a Lima
      const dt = parseDateLima(typeof d === "string" ? d.substring(0, 10) : new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
      return dt ? dt.toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "";
    };
    const contractType = contract?.contract_type || "Indeterminado";
    let selectedTemplateId = contract?.template_id || "";

    // Si no tiene plantilla asignada, buscar la más adecuada
    if (!selectedTemplateId && contractTemplates.length > 0) {
      // Buscar plantilla específica para el tipo de contrato
      const typeSpecificTemplate = contractTemplates.find(t =>
        t.contract_types?.includes(contractType)
      );
      // Si no hay específica, usar la default
      selectedTemplateId = typeSpecificTemplate?.id || defaultTemplate?.id || "";
    }
    setFormData({
      employee_id: contract?.employee_id || emp?.id || "",
      contract_number: contract?.contract_number || "",
      contract_type: contractType,
      template_id: selectedTemplateId,
      start_date: normalizeDate(contract?.start_date),
      end_date: normalizeDate(contract?.end_date),
      position: contract?.position || emp?.position || "",
      department: contract?.department || emp?.department_name || "",
      work_location: contract?.work_location || emp?.site || "",
      salary: contract?.salary || emp?.base_salary || "",
      activity_cost: contract?.activity_cost || "",
      food_cost: contract?.food_cost || "",
      transport_cost: contract?.transport_cost || "",
      work_schedule: contract?.work_schedule || "Lunes a Viernes de 9:00 AM a 6:00 PM",
      weekly_hours: contract?.weekly_hours || 48,
      functions: contract?.functions || "",
      benefits: contract?.benefits || "",
      trial_period_days: contract?.trial_period_days || 90,
      renewable: contract?.renewable || false,
      status: contract?.status || "Vigente",
      signed_date: normalizeDate(contract?.signed_date) || todayLima(),
      notes: contract?.notes || "",
    });
  };

  const handleCreate = () => {
    setEmployeeSearchTerm(""); setPositionSearchTerm(""); setDepartmentSearchTerm(""); setSiteSearchTerm("");
    initializeForm();
    setEditingContract(null);
    setShowForm(true);
  };

  const handleEdit = (contract) => {
    setEmployeeSearchTerm(""); setPositionSearchTerm(""); setDepartmentSearchTerm(""); setSiteSearchTerm("");
    initializeForm(contract);
    setEditingContract(contract);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.employee_id || !formData.contract_type || !formData.start_date || !formData.position || !formData.salary) {
      toast.error("Completa los campos obligatorios");
      return;
    }
    const dataToSave = {
      ...formData,
      salary: parseFloat(formData.salary) || 0,
      activity_cost: parseFloat(formData.activity_cost) || 0,
      food_cost: parseFloat(formData.food_cost) || 0,
      transport_cost: parseFloat(formData.transport_cost) || 0,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      signed_date: formData.signed_date || null,
    };
    // Regla de negocio
    if (formData.contract_type === "Indeterminado") {
      dataToSave.end_date = null;
    }
    if (editingContract) {
      updateContractMutation.mutate({ id: editingContract.id, data: dataToSave });
    } else {
      const existingActive = contracts.find(c => c.employee_id === formData.employee_id && c.status === "Vigente");
      if (existingActive && formData.status === "Vigente") {
        setConflictingContract(existingActive);
        return;
      }
      createContractMutation.mutate(dataToSave);
    }
  };

  const handleResolveConflict = (newStatus) => {
    updateStatusMutation.mutate({ id: conflictingContract.id, status: newStatus }, {
      onSuccess: () => {
        setConflictingContract(null);
        createContractMutation.mutate(formData);
      }
    });
  };

  const handleGeneratePDF = async (contract) => {
    const emp = allEmployees.find(e => e.id === contract.employee_id);
    if (!emp) { toast.error("Empleado no encontrado"); return; }
    try {
      // Recargar plantillas y datos de empresa antes de generar PDF
      const templates = await entitiesAPI.ContractTemplate.list("-created_date");

      // Buscar la plantilla específica del contrato o usar la default
      let template = contract.template_id ? templates.find(t => t.id === contract.template_id) : null;
      // Buscar plantilla específica para el tipo de contrato
      if (!template) template = templates.find(t => t.contract_types?.includes(contract.contract_type) && t.is_active);
      // Usar la plantilla por defecto
      if (!template) template = templates.find(t => t.is_default && t.is_active);
      if (!template && templates.length > 0) template = templates[0];

      const companyData = companyInfo || {};

      await generateContractPDF(emp, contract, companyData, template);
      toast.success("PDF generado exitosamente");
    } catch (error) {
      toast.error("Error al generar el PDF: " + error.message);
    }
  };

  const handleSignSingle = (contract) => {
    setSignatureImageUrl(companyInfo?.legal_representative_signature_url || "");
    setConfirmSign({ mode: 'single', contract });
  };

  const handleConfirmSign = async () => {
    if (!confirmSign) return;
    if (confirmSign.mode === 'single') {
      await signContractMutation.mutateAsync({ id: confirmSign.contract.id });
      toast.success(`Contrato ${confirmSign.contract.contract_number} firmado digitalmente`);
    } else {
      setIsBulkSigning(true);
      let signed = 0;
      for (const id of selectedForBulkSign) {
        await signContractMutation.mutateAsync({ id });
        signed++;
      }
      setIsBulkSigning(false);
      setSelectedForBulkSign(new Set());
      toast.success(`${signed} contrato(s) firmado(s) digitalmente`);
    }
    setConfirmSign(null);
    setSignatureImageUrl("");
  };

  const toggleBulkSelect = (contractId) => {
    setSelectedForBulkSign(prev => {
      const next = new Set(prev);
      next.has(contractId) ? next.delete(contractId) : next.add(contractId);
      return next;
    });
  };

  const resetForm = () => {
    setFormData({}); setEditingContract(null); setShowForm(false); setConflictingContract(null);
    setEmployeeSearchTerm(""); setPositionSearchTerm(""); setDepartmentSearchTerm(""); setSiteSearchTerm("");
  };

  const pendingSignContracts = contracts.filter(c => !c.is_digitally_signed && c.status === "Vigente");

  // Reset page when filters change
  const handleFilterChange = (setter) => (val) => { setter(val); setCurrentPage(1); };

  const filteredContracts = contracts.filter(c => {
    const emp = allEmployees.find(e => e.id === c.employee_id);
    if (!emp) return false;
    const matchesSearch = !searchTerm || (
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.contract_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesSign = signatureFilter === "all" || (signatureFilter === "signed" && c.is_digitally_signed) || (signatureFilter === "pending" && !c.is_digitally_signed);
    
    // Filtro de vencimiento
    let matchesExpiry = true;
    if (expiryFilter !== "all") {
      // Contratos indeterminados sin fecha fin no tienen vencimiento → excluir del filtro
      if (c.contract_type === "Indeterminado" && !c.end_date) {
        matchesExpiry = false;
      } else if (c.end_date) {
        const today = parseDateLima(todayLima());
        const endDate = parseDateLima(c.end_date.split('T')[0]);
        const daysUntilExpiry = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
        if (expiryFilter === "15days") {
          matchesExpiry = daysUntilExpiry > 0 && daysUntilExpiry <= 15;
        } else if (expiryFilter === "30days") {
          matchesExpiry = daysUntilExpiry > 0 && daysUntilExpiry <= 30;
        }
      } else {
        // Otros tipos de contrato sin fecha fin → también excluir
        matchesExpiry = false;
      }
    }
    
    return matchesSearch && matchesStatus && matchesSign && matchesExpiry;
  });

  const totalPages = Math.ceil(filteredContracts.length / PAGE_SIZE);
  const paginatedContracts = filteredContracts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const stats = {
    total: contracts.length,
    vigentes: contracts.filter(c => c.status === "Vigente").length,
    firmados: contracts.filter(c => c.is_digitally_signed).length,
    pendienteFirma: contracts.filter(c => !c.is_digitally_signed && c.status === "Vigente").length,
  };

  const getStatusConfig = (status) => ({
    "Vigente": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
    "Vencido": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
    "Rescindido": { color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
    "Renovado": { color: "bg-blue-100 text-blue-700 border-blue-200", icon: CheckCircle },
  }[status] || { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle });

  if (loadingPerms) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!employee || (!hasPermission("contracts.view") && !hasPermission("system.admin") && employee.role !== "admin")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md"><CardContent className="p-8 text-center">
          <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
          <p className="text-slate-600">No tienes permisos para gestionar contratos</p>
        </CardContent></Card>
      </div>
    );
  }

  const canManage = hasPermission("contracts.create") || hasPermission("system.admin") || employee.role === "admin";

  // El botón "Firmar" solo se habilita para el representante legal:
  // el DNI del empleado logueado debe coincidir con el DNI del representante legal en CompanyInfo
  const canSign = !!(
    employee &&
    companyInfo?.legal_representative_dni &&
    employee.document_number &&
    employee.document_number.trim() === companyInfo.legal_representative_dni.trim()
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 mb-1">Gestión de Contratos</h1>
          <p className="text-slate-600">Registra, administra y firma digitalmente los contratos laborales</p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, icon: FileText, color: "indigo" },
            { label: "Vigentes", value: stats.vigentes, icon: CheckCircle, color: "green" },
            { label: "Firmados", value: stats.firmados, icon: PenLine, color: "blue" },
            { label: "Pendiente Firma", value: stats.pendienteFirma, icon: AlertCircle, color: "amber" },
          ].map(({ label, value, icon: StatIcon, color }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
              <StatIcon className={`w-5 h-5 text-${color}-600`} />
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">{value}</span>
                <span className="text-sm text-slate-600">{label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Firma masiva - solo si tiene permiso y hay pendientes seleccionados */}
        {canSign && selectedForBulkSign.size > 0 && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenLine className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-800">{selectedForBulkSign.size} contrato(s) seleccionado(s) para firma masiva</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedForBulkSign(new Set())}>Deseleccionar</Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => {
                setSignatureImageUrl(companyInfo?.legal_representative_signature_url || "");
                setConfirmSign({ mode: 'bulk' });
              }}>
                <PenLine className="w-4 h-4 mr-1" /> Firmar {selectedForBulkSign.size} seleccionados
              </Button>
            </div>
          </div>
        )}

        {/* Main Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-slate-50/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-xl font-bold">Contratos Registrados</CardTitle>
              {canManage && (
                <Button onClick={handleCreate} className="bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="w-4 h-4 mr-2" /> Nuevo Contrato
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex-1 min-w-56 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input placeholder="Buscar por empleado o N° contrato..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Vigente">Vigente</SelectItem>
                  <SelectItem value="Vencido">Vencido</SelectItem>
                  <SelectItem value="Rescindido">Rescindido</SelectItem>
                  <SelectItem value="Renovado">Renovado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={signatureFilter} onValueChange={(v) => { setSignatureFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Firma digital" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las firmas</SelectItem>
                  <SelectItem value="signed"><div className="flex items-center gap-2"><PenLine className="w-4 h-4 text-blue-600" />Firmados digitalmente</div></SelectItem>
                  <SelectItem value="pending"><div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-600" />Pendiente de firma</div></SelectItem>
                </SelectContent>
              </Select>
              <Select value={expiryFilter} onValueChange={(v) => { setExpiryFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Por vencer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los contratos</SelectItem>
                  <SelectItem value="15days"><div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-orange-600" />Vencen en 15 días</div></SelectItem>
                  <SelectItem value="30days"><div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-red-600" />Vencen en 30 días</div></SelectItem>
                </SelectContent>
              </Select>
              {canSign && signatureFilter === "pending" && pendingSignContracts.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-indigo-600 border-indigo-200"
                  onClick={() => {
                    const visiblePendingIds = filteredContracts.filter(c => !c.is_digitally_signed && c.status === "Vigente").map(c => c.id);
                    setSelectedForBulkSign(new Set(visiblePendingIds));
                  }}
                >
                  <Users className="w-4 h-4 mr-1" /> Seleccionar todos pendientes
                </Button>
              )}
              {/* Contador y Paginación inline */}
              <div className="flex items-center gap-3 ml-auto">
              <span className="text-sm text-slate-500 whitespace-nowrap">
                {filteredContracts.length === 0 ? "0 registros" : `${Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredContracts.length)}–${Math.min(currentPage * PAGE_SIZE, filteredContracts.length)} de ${filteredContracts.length}`}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 px-2">‹</Button>
                <span className="text-sm text-slate-600 px-2">{currentPage} / {Math.max(totalPages, 1)}</span>
                <Button size="sm" variant="outline" disabled={currentPage >= Math.max(totalPages, 1)} onClick={() => setCurrentPage(p => p + 1)} className="h-8 px-2">›</Button>
              </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredContracts.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No se encontraron contratos</p>
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedContracts.map(contract => {
                  const emp = allEmployees.find(e => e.id === contract.employee_id);
                  if (!emp) return null;
                  const StatusIcon = getStatusConfig(contract.status).icon;
                  const isPendingSign = !contract.is_digitally_signed && contract.status === "Vigente";
                  const isSelected = selectedForBulkSign.has(contract.id);

                  return (
                    <div
                      key={contract.id}
                      className={`p-4 border rounded-lg hover:shadow-md transition-all ${isSelected ? "border-indigo-400 bg-indigo-50/30" : "border-slate-200"}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox para firma masiva solo en pendientes */}
                        {canSign && isPendingSign && (
                          <div className="pt-1">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleBulkSelect(contract.id)}
                            />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          {/* Badges de cabecera */}
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="font-bold text-slate-900 text-sm">
                              {emp.employee_code} - {emp.first_name} {emp.last_name}
                            </h4>
                            <Badge className={getStatusConfig(contract.status).color}>
                              <StatusIcon className="w-3 h-3 mr-1" />{contract.status}
                            </Badge>
                            <Badge variant="outline">{contract.contract_type}</Badge>
                            {contract.contract_number && (
                              <Badge className="bg-purple-100 text-purple-700">#{contract.contract_number}</Badge>
                            )}
                            {/* Badge de firma digital */}
                            {contract.is_digitally_signed ? (
                              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                                <PenLine className="w-3 h-3 mr-1" />
                                Firmado digitalmente
                                {contract.digital_signature_date && (() => {
                                  try {
                                    const d = new Date(contract.digital_signature_date);
                                    if (isNaN(d.getTime())) return null;
                                    return (
                                      <span className="ml-1 opacity-75">
                                        · {format(d, "dd/MM/yy HH:mm")}
                                      </span>
                                    );
                                  } catch {
                                    return null;
                                  }
                                })()}
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                                <AlertCircle className="w-3 h-3 mr-1" />Pendiente firma
                              </Badge>
                            )}
                          </div>

                          {/* Info del contrato */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div><p className="text-slate-500 text-xs">Cargo</p><p className="font-semibold text-slate-900 truncate">{contract.position}</p></div>
                            <div><p className="text-slate-500 text-xs">Inicio</p><p className="font-semibold text-slate-900">{(() => { try { const dateStr = contract.start_date.split('T')[0]; const d = parseDateLima(dateStr); return isNaN(d?.getTime()) ? "Fecha inválida" : format(d, "dd/MM/yyyy"); } catch { return "Fecha inválida"; } })()}</p></div>
                            {contract.end_date && <div><p className="text-slate-500 text-xs">Fin</p><p className="font-semibold text-slate-900">{(() => { try { const dateStr = contract.end_date.split('T')[0]; const d = parseDateLima(dateStr); return isNaN(d?.getTime()) ? "Fecha inválida" : format(d, "dd/MM/yyyy"); } catch { return "Fecha inválida"; } })()}</p></div>}
                            <div><p className="text-slate-500 text-xs">Remuneración</p><p className="font-semibold text-indigo-600">S/ {Number(contract.salary || 0).toFixed(2)}</p></div>
                          </div>

                          {/* Firmante */}
                          {contract.is_digitally_signed && contract.digital_signature_name && (
                            <p className="text-xs text-blue-600 mt-1">
                              <Shield className="w-3 h-3 inline mr-1" />
                              Firmado por: {contract.digital_signature_name} ({contract.digital_signature_by})
                            </p>
                          )}
                        </div>

                        {/* Acciones */}
                        <div className="flex flex-wrap gap-1.5 ml-2 shrink-0">
                          <Select
                            value={contract.status}
                            onValueChange={(newStatus) => updateStatusMutation.mutate({ id: contract.id, status: newStatus })}
                          >
                            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Vigente">Vigente</SelectItem>
                              <SelectItem value="Vencido">Vencido</SelectItem>
                              <SelectItem value="Rescindido">Rescindido</SelectItem>
                              <SelectItem value="Renovado">Renovado</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="outline" onClick={() => handleGeneratePDF(contract)} title="Generar PDF">
                            <Download className="w-4 h-4" />
                          </Button>
                          {canManage && (
                            <Button size="sm" variant="outline" onClick={() => handleEdit(contract)} title="Editar">
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {canSign && !contract.is_digitally_signed && (
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => handleSignSingle(contract)}
                              title="Firmar digitalmente"
                            >
                              <PenLine className="w-4 h-4 mr-1" /> Firmar
                            </Button>
                          )}
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
                <CardTitle className="text-xl font-bold">{editingContract ? "Editar Contrato" : "Nuevo Contrato"}</CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 max-h-[70vh] overflow-y-auto">
              <Tabs defaultValue="basic">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="basic">Datos Básicos</TabsTrigger>
                  <TabsTrigger value="work">Condiciones Laborales</TabsTrigger>
                  <TabsTrigger value="details">Detalles</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  {editingContract && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <span className="text-sm font-medium text-blue-900">N° Contrato: </span>
                      <span className="text-sm font-bold text-blue-700">{formData.contract_number || "N/A"}</span>
                      <p className="text-xs text-blue-600 mt-1">El número se genera automáticamente</p>
                    </div>
                  )}
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
                          <Input placeholder="Buscar empleado..." value={employeeSearchTerm} onChange={(e) => setEmployeeSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Tipo de Contrato *</Label>
                      <Select
                        value={formData.contract_type}
                        onValueChange={(v) => {
                          // Al cambiar tipo de contrato, actualizar plantilla sugerida
                          const typeSpecificTemplate = contractTemplates.find(t =>
                            t.contract_types?.includes(v) && t.is_active
                          );
                          setFormData({
                            ...formData,
                            contract_type: v,
                            template_id: typeSpecificTemplate?.id || defaultTemplate?.id || formData.template_id
                          });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                           {["Indeterminado","Plazo Fijo","Part-Time","Prácticas","SNP"].map(t => (
                             <SelectItem key={t} value={t}>{t}</SelectItem>
                           ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {contractTemplates.length > 0 && (
                      <div>
                        <Label className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />Plantilla
                        </Label>
                        <Select
                          value={formData.template_id}
                          onValueChange={(v) => setFormData({...formData, template_id: v})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar plantilla" />
                          </SelectTrigger>
                          <SelectContent>
                            {contractTemplates.map(t => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.is_default && <Star className="w-3 h-3 inline mr-1 text-amber-500 fill-amber-500" />}{t.template_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><Label>Fecha de Inicio *</Label><Input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} /></div>
                    {formData.contract_type !== "Indeterminado" && (
                      <div><Label>Fecha de Fin</Label><Input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} /></div>
                    )}
                    <div><Label>Fecha de Firma</Label><Input type="date" value={formData.signed_date} onChange={(e) => setFormData({ ...formData, signed_date: e.target.value })} /></div>
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Vigente","Vencido","Rescindido","Renovado"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>

                <TabsContent value="work" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Departamento/Área</Label>
                      <Select value={formData.department} onValueChange={(v) => setFormData({ ...formData, department: v, position: "" })}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar departamento" /></SelectTrigger>
                        <SelectContent>
                          <div className="p-2 border-b"><Input placeholder="Buscar..." value={departmentSearchTerm} onChange={(e) => setDepartmentSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} /></div>
                          {departments.filter(d => d.name.toLowerCase().includes(departmentSearchTerm.toLowerCase())).map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Cargo *</Label>
                      <Select
                        value={formData.position}
                        onValueChange={(v) => setFormData({ ...formData, position: v })}
                        disabled={!formData.department}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={formData.department ? "Seleccionar cargo" : "Selecciona primero un departamento"} />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="p-2 border-b"><Input placeholder="Buscar..." value={positionSearchTerm} onChange={(e) => setPositionSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} /></div>
                          {positions
                            .filter(p => {
                              const matchesDept = !formData.department || p.department === formData.department;
                              const matchesSearch = p.name.toLowerCase().includes(positionSearchTerm.toLowerCase());
                              return matchesDept && matchesSearch;
                            })
                            .map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                          {positions.filter(p => p.department === formData.department).length === 0 && formData.department && (
                            <div className="px-3 py-4 text-sm text-slate-400 text-center">No hay cargos para este departamento</div>
                          )}
                        </SelectContent>
                      </Select>
                      {formData.department && (
                        <p className="text-xs text-slate-500 mt-1">
                          {positions.filter(p => p.department === formData.department).length} cargo(s) disponible(s)
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Sede</Label>
                    <Select value={formData.work_location} onValueChange={(v) => setFormData({ ...formData, work_location: v })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar sede" /></SelectTrigger>
                      <SelectContent>
                        <div className="p-2 border-b"><Input placeholder="Buscar..." value={siteSearchTerm} onChange={(e) => setSiteSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} /></div>
                        {sites.filter(s => s.name.toLowerCase().includes(siteSearchTerm.toLowerCase())).map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><Label>Remuneración (S/) *</Label><Input type="number" step="0.01" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} /></div>
                    <div><Label>Horas Semanales</Label><Input type="number" value={formData.weekly_hours} onChange={(e) => setFormData({ ...formData, weekly_hours: parseInt(e.target.value) })} /></div>
                    <div><Label>Período de Prueba (días)</Label><Input type="number" value={formData.trial_period_days} onChange={(e) => setFormData({ ...formData, trial_period_days: parseInt(e.target.value) })} /></div>
                  </div>

                  <div><Label>Horario de Trabajo</Label><Input value={formData.work_schedule} onChange={(e) => setFormData({ ...formData, work_schedule: e.target.value })} placeholder="Ej: Lunes a Viernes de 9:00 AM a 6:00 PM" /></div>
                  {formData.contract_type !== "Indeterminado" && (
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="renewable" checked={formData.renewable} onChange={(e) => setFormData({ ...formData, renewable: e.target.checked })} className="w-4 h-4 rounded" />
                      <label htmlFor="renewable" className="text-sm">Contrato Renovable</label>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="details" className="space-y-4">
                  <div><Label>Funciones y Responsabilidades</Label><Textarea value={formData.functions} onChange={(e) => setFormData({ ...formData, functions: e.target.value })} rows={4} placeholder="Describe las funciones del cargo..." /></div>
                  <div><Label>Beneficios Adicionales</Label><Textarea value={formData.benefits} onChange={(e) => setFormData({ ...formData, benefits: e.target.value })} rows={3} placeholder="Seguro médico, bono..." /></div>
                  <div><Label>Notas</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} placeholder="Observaciones adicionales..." /></div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-3 mt-6 pt-6 border-t">
                <Button variant="outline" className="flex-1" onClick={resetForm}>Cancelar</Button>
                <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={handleSubmit} disabled={createContractMutation.isPending || updateContractMutation.isPending}>
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
                <div className="p-2 bg-amber-100 rounded-lg"><AlertCircle className="w-6 h-6 text-amber-600" /></div>
                <div>
                  <CardTitle className="text-xl font-bold">Contrato Vigente Detectado</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">Este empleado ya tiene un contrato vigente</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-2">Contrato actual:</p>
                <p className="font-semibold">{conflictingContract.position} - {conflictingContract.contract_type}</p>
                <p className="text-sm text-slate-600">Inicio: {(() => { try { const dateStr = conflictingContract.start_date.split('T')[0]; const d = parseDateLima(dateStr); return isNaN(d?.getTime()) ? "Fecha inválida" : format(d, "dd/MM/yyyy"); } catch { return "Fecha inválida"; } })()}</p>
                <p className="text-sm text-slate-600">Remuneración: S/ {Number((conflictingContract.salary || 0)).toFixed(2)}</p>
              </div>
              <p className="text-sm text-slate-700 mb-4">Para registrar el nuevo contrato, primero cambia el estado del contrato actual:</p>
              <div className="space-y-3">
                {[{ label: "Marcar como Vencido", value: "Vencido", cls: "text-red-700 border-red-200 bg-red-50 hover:bg-red-100" },
                  { label: "Marcar como Rescindido", value: "Rescindido", cls: "text-gray-700 border-gray-200 bg-gray-50 hover:bg-gray-100" },
                  { label: "Marcar como Renovado", value: "Renovado", cls: "text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100" }].map(({ label, value, cls }) => (
                  <Button key={value} className={`w-full justify-start ${cls}`} variant="outline" onClick={() => handleResolveConflict(value)}>{label}</Button>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t"><Button variant="outline" className="w-full" onClick={() => setConflictingContract(null)}>Cancelar</Button></div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirm Sign Modal */}
      {confirmSign && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-6" onClick={() => { setConfirmSign(null); setSignatureImageUrl(""); }}>
          <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b bg-blue-50">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-lg"><PenLine className="w-6 h-6 text-blue-600" /></div>
                <div>
                  <CardTitle className="text-xl font-bold">Confirmar Firma Digital</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">
                    {confirmSign.mode === 'single'
                      ? `Contrato ${confirmSign.contract?.contract_number}`
                      : `${selectedForBulkSign.size} contrato(s) seleccionado(s)`}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 font-medium mb-1">Representante Legal (Firmante):</p>
                <p className="text-sm text-blue-800">{companyInfo?.legal_representative || "No configurado"}</p>
                <p className="text-xs text-blue-700">DNI: {companyInfo?.legal_representative_dni || "-"} · {companyInfo?.legal_representative_position || ""}</p>
                <p className="text-xs text-blue-600 mt-1">Fecha y hora: {new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}</p>
              </div>

              {/* Firma del Representante Legal */}
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  Firma del Representante Legal
                </Label>
                {signatureImageUrl ? (
                  <div className="border border-green-200 rounded-lg p-3 bg-green-50 flex items-center gap-3">
                    <img src={`${import.meta.env.VITE_API_URL}${signatureImageUrl}`} alt="Firma" className="h-16 object-contain bg-white border border-slate-200 rounded px-2" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-green-800">Firma registrada</p>
                      <p className="text-xs text-green-700">{companyInfo?.legal_representative}</p>
                      <p className="text-xs text-green-600">DNI: {companyInfo?.legal_representative_dni}</p>
                    </div>
                  </div>
                ) : (
                  <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
                    No hay firma registrada. Configure la firma en <strong>Información de la Empresa → Representante Legal</strong>.
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-700">
                Al confirmar, se registrará la firma digital de forma permanente en {confirmSign.mode === 'single' ? 'este contrato' : 'todos los contratos seleccionados'}.
                Esta acción no puede deshacerse.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setConfirmSign(null); setSignatureImageUrl(""); }}>Cancelar</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleConfirmSign} disabled={isBulkSigning || signContractMutation.isPending}>
                  {isBulkSigning ? "Firmando..." : <><PenLine className="w-4 h-4 mr-2" /> Confirmar Firma</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
