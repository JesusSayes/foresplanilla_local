import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
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
  Building, MapPin, Briefcase, CreditCard, Plus, Edit, Trash2, Search, DollarSign, Target, Shield
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "../components/hooks/usePermissions";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";
import MasterDataFormModal from "../components/master/MasterDataFormModal";

export default function MasterDataManagement() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [activeTab, setActiveTab] = useState("sites");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [elementoFilter, setElementoFilter] = useState("all");

  const { hasAnyPermission, loading: permissionsLoading } = usePermissions();
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

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => await entitiesAPI.Site.list("name"),
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions"],
    queryFn: async () => await entitiesAPI.Position.list("name"),
  });

  const { data: banks = [] } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => await entitiesAPI.Bank.list("name"),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => await entitiesAPI.Department.list("name"),
  });

  const { data: rmvRecords = [] } = useQuery({
    queryKey: ["rmvs"],
    queryFn: async () => await entitiesAPI.RMV.list("-effective_date"),
  });

  const { data: afps = [] } = useQuery({
    queryKey: ["afps"],
    queryFn: async () => await entitiesAPI.AFP.list("name"),
  });

  const { data: professions = [] } = useQuery({
    queryKey: ["professions"],
    queryFn: async () => await entitiesAPI.Profession.list("name"),
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ["costcenters"],
    queryFn: async () => await entitiesAPI.CostCenter.list("code"),
  });

  const { data: seguroVidaLey = [] } = useQuery({
    queryKey: ["segurovida"],
    queryFn: async () => await entitiesAPI.SeguroVidaLey.list("age_range_start"),
  });

  const { data: uitRecords = [] } = useQuery({
    queryKey: ["uit"],
    queryFn: async () => await entitiesAPI.UIT.list("-year"),
  });

  const { data: accountingAccounts = [] } = useQuery({
    queryKey: ["accountingaccounts"],
    queryFn: async () => await entitiesAPI.AccountingAccount.list("cuenta"),
  });

  const { data: areaUnidadCargos = [] } = useQuery({
    queryKey: ["areaunidadcargos"],
    queryFn: async () => await entitiesAPI.AreaUnidadCargo.list("area"),
  });

  const createMutation = useMutation({
    mutationFn: async ({ entity, data }) => {
      return await entitiesAPI[entity].create(data);
    },
    onSuccess: (_, { entity }) => {
      queryClient.invalidateQueries([entity.toLowerCase() + "s"]);
      toast.success("Registro creado correctamente");
      resetForm();
    },
    onError: () => toast.error("Error al crear el registro"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ entity, id, data }) => {
      return await entitiesAPI[entity].update(id, data);
    },
    onSuccess: (_, { entity }) => {
      queryClient.invalidateQueries([entity.toLowerCase() + "s"]);
      toast.success("Registro actualizado correctamente");
      resetForm();
    },
    onError: () => toast.error("Error al actualizar el registro"),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ entity, id }) => {
      return await entitiesAPI[entity].delete(id);
    },
    onSuccess: (_, { entity }) => {
      queryClient.invalidateQueries([entity.toLowerCase() + "s"]);
      toast.success("Registro eliminado correctamente");
    },
    onError: () => toast.error("Error al eliminar el registro"),
  });

  const handleCreate = (tab) => {
    setActiveTab(tab);
    setEditingItem(null);
    setFormData({});
    setShowForm(true);
  };

  const handleEdit = (item, tab) => {
    setActiveTab(tab);
    setEditingItem(item);
    setFormData(item);
    setShowForm(true);
  };

  const handleDelete = (item, entity) => {
    if (confirm(`¿Eliminar este registro?`)) {
      deleteMutation.mutate({ entity, id: item.id });
    }
  };

  const filteredAreaUnidadCargo = areaUnidadCargos.filter(a =>
    a.area?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.unidad?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.cargo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSoftDelete = (item, entity) => {
    if (confirm(`¿Desactivar este registro?`)) {
      updateMutation.mutate({ entity, id: item.id, data: { is_active: false } });
    }
  };

  const handleSubmit = async () => {
    const entityMap = {
      sites: "Site",
      positions: "Position",
      departments: "Department",
      banks: "Bank",
      rmv: "RMV",
      afp: "AFP",
      professions: "Profession",
      costcenters: "CostCenter",
      segurovida: "SeguroVidaLey",
      uit: "UIT",
      accountingaccounts: "AccountingAccount",
      areaunidadcargo: "AreaUnidadCargo",
    };
    const entity = entityMap[activeTab];

    // Para RMV, desactivar todos los registros anteriores antes de crear uno nuevo
    if (activeTab === "rmv" && !editingItem) {
      try {
        const activeRMVs = rmvRecords.filter(r => r.is_active);
        for (const rmv of activeRMVs) {
          await entitiesAPI.RMV.update(rmv.id, { is_active: false });
        }
        queryClient.invalidateQueries(["rmvs"]);
      } catch (error) {
        console.error("Error al desactivar RMV anteriores:", error);
      }
    }

    if (editingItem) {
      updateMutation.mutate({ entity, id: editingItem.id, data: formData });
    } else {
      createMutation.mutate({ entity, data: formData });
    }
  };

  const resetForm = () => {
    setFormData({});
    setEditingItem(null);
    setShowForm(false);
  };

  const filteredSites = sites.filter(s =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPositions = positions.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDepartments = departments.filter(d =>
    d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBanks = banks.filter(b =>
    b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRMVs = rmvRecords.filter(r =>
    r.amount?.toString().includes(searchTerm) ||
    r.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeRMV = rmvRecords.find(r => r.is_active);

  const filteredAFPs = afps.filter(a =>
    a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProfessions = professions.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCostCenters = costCenters.filter(c =>
    c.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSeguroVida = seguroVidaLey.filter(s =>
    s.age_range_start?.toString().includes(searchTerm) ||
    s.age_range_end?.toString().includes(searchTerm)
  );

  const filteredUIT = uitRecords.filter(u =>
    u.year?.toString().includes(searchTerm) ||
    u.amount?.toString().includes(searchTerm)
  );

  const activeUIT = uitRecords.find(u => u.year === new Date().getFullYear());

  const filteredAccountingAccounts = accountingAccounts.filter(a => {
    const matchesSearch = a.cuenta?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.elemento?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesElemento = elementoFilter === "all" || a.elemento === elementoFilter;
    return matchesSearch && matchesElemento;
  });

  if (!employee || permissionsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasAccess = hasAnyPermission([
    "sites.view", "sites.manage",
    "positions.view", "positions.manage",
    "banks.view", "system.admin"
  ]);

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para ver datos maestros</p>
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
            Gestión de Datos Maestros
          </h1>
          <p className="text-slate-600 text-lg">
            Administra sedes, cargos, bancos y otros datos del sistema
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-11 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <MapPin className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {sites.length}
              </div>
              <p className="text-slate-600 text-sm">Sedes</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Briefcase className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {positions.length}
              </div>
              <p className="text-slate-600 text-sm">Cargos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-orange-100 rounded-xl">
                  <Building className="w-6 h-6 text-orange-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {departments.length}
              </div>
              <p className="text-slate-600 text-sm">Departamentos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <CreditCard className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {banks.length}
              </div>
              <p className="text-slate-600 text-sm">Bancos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <DollarSign className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {activeRMV ? `S/ ${activeRMV.amount.toFixed(2)}` : "N/A"}
              </div>
              <p className="text-slate-600 text-sm">RMV</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-teal-100 rounded-xl">
                  <Building className="w-6 h-6 text-teal-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {afps.length}
              </div>
              <p className="text-slate-600 text-sm">AFPs</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-cyan-100 rounded-xl">
                  <Briefcase className="w-6 h-6 text-cyan-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {professions.length}
              </div>
              <p className="text-slate-600 text-sm">Profesiones</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-rose-100 rounded-xl">
                  <Target className="w-6 h-6 text-rose-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {costCenters.length}
              </div>
              <p className="text-slate-600 text-sm">Centros Costos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-red-100 rounded-xl">
                  <Shield className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {seguroVidaLey.length}
              </div>
              <p className="text-slate-600 text-sm">Seguro Vida</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-yellow-100 rounded-xl">
                  <DollarSign className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {activeUIT ? `S/ ${activeUIT.amount.toFixed(0)}` : "N/A"}
              </div>
              <p className="text-slate-600 text-sm">UIT {new Date().getFullYear()}</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-emerald-100 rounded-xl">
                  <DollarSign className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {accountingAccounts.length}
              </div>
              <p className="text-slate-600 text-sm">Cuentas</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-violet-100 rounded-xl">
                  <Briefcase className="w-6 h-6 text-violet-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {areaUnidadCargos.filter(a => a.is_active !== false).length}
              </div>
              <p className="text-slate-600 text-sm">Área/Unidad/Cargo</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-7xl grid-cols-12">
            <TabsTrigger value="areaunidadcargo">Área/Unidad</TabsTrigger>
            <TabsTrigger value="sites">Sedes</TabsTrigger>
            <TabsTrigger value="positions">Cargos</TabsTrigger>
            <TabsTrigger value="departments">Departamentos</TabsTrigger>
            <TabsTrigger value="banks">Bancos</TabsTrigger>
            <TabsTrigger value="rmv">RMV</TabsTrigger>
            <TabsTrigger value="afp">AFP</TabsTrigger>
            <TabsTrigger value="professions">Profesiones</TabsTrigger>
            <TabsTrigger value="costcenters">Centros Costos</TabsTrigger>
            <TabsTrigger value="segurovida">Seguro Vida</TabsTrigger>
            <TabsTrigger value="uit">UIT</TabsTrigger>
            <TabsTrigger value="accountingaccounts">Cuentas</TabsTrigger>
          </TabsList>

          <TabsContent value="areaunidadcargo" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Área / Unidad / Cargo</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">Tabla maestra jerárquica. La eliminación es lógica (desactiva el registro).</p>
                  </div>
                  {hasAnyPermission(["system.admin"]) && (
                    <Button onClick={() => handleCreate("areaunidadcargo")} className="bg-indigo-600 hover:bg-indigo-700"><Plus className="w-4 h-4 mr-2" />Nuevo</Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-4 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" /><Input placeholder="Buscar área, unidad o cargo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" /></div>
                {[...new Set(filteredAreaUnidadCargo.map(a => a.area))].sort().map(area => (
                  <div key={area} className="mb-5">
                    <h3 className="text-sm font-bold text-indigo-700 mb-2 pb-1 border-b border-indigo-100 flex items-center gap-2">
                      <Building className="w-4 h-4" />{area} <span className="text-xs font-normal text-slate-400">({filteredAreaUnidadCargo.filter(a=>a.area===area).length})</span>
                    </h3>
                    <div className="space-y-1.5">
                      {filteredAreaUnidadCargo.filter(a => a.area === area).map(item => (
                        <div key={item.id} className="p-2.5 border border-slate-200 rounded-lg flex items-center justify-between hover:shadow-sm">
                          <div className="flex items-center gap-3">
                            <Badge className="bg-violet-100 text-violet-700 text-xs">{item.unidad}</Badge>
                            <span className="text-sm font-medium text-slate-900">{item.cargo}</span>
                            {item.is_active === false && <Badge className="bg-red-100 text-red-700 text-xs">Inactivo</Badge>}
                          </div>
                          <div className="flex gap-1.5">
                            {hasAnyPermission(["system.admin"]) && (
                              <Button size="sm" variant="outline" onClick={() => handleEdit(item, "areaunidadcargo")}><Edit className="w-3.5 h-3.5" /></Button>
                            )}
                            {hasAnyPermission(["system.admin"]) && item.is_active !== false && (
                              <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleSoftDelete(item, "AreaUnidadCargo")}><Trash2 className="w-3.5 h-3.5" /></Button>
                            )}
                            {hasAnyPermission(["system.admin"]) && item.is_active === false && (
                              <Button size="sm" variant="outline" className="text-green-600 text-xs px-2" onClick={() => updateMutation.mutate({ entity: "AreaUnidadCargo", id: item.id, data: { is_active: true } })}>Reactivar</Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sites" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Sedes</CardTitle>
                  {hasAnyPermission(["sites.create", "sites.manage", "system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("sites")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nueva Sede
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="Buscar sede..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredSites.map(site => (
                    <div key={site.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-slate-900 text-lg">{site.name}</h4>
                            <Badge className="bg-blue-100 text-blue-700">{site.code}</Badge>
                            {!site.is_active && (
                              <Badge className="bg-red-100 text-red-700">Inactivo</Badge>
                            )}
                          </div>
                          {site.address && (
                            <p className="text-sm text-slate-600">{site.address}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {hasAnyPermission(["sites.edit", "sites.manage", "system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(site, "sites")}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasAnyPermission(["sites.delete", "sites.manage", "system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(site, "Site")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="positions" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Cargos</CardTitle>
                  {hasAnyPermission(["positions.create", "positions.manage", "system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("positions")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo Cargo
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="Buscar cargo..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredPositions.map(pos => (
                    <div key={pos.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-slate-900 text-lg">{pos.name}</h4>
                            {pos.level && (
                              <Badge className="bg-purple-100 text-purple-700">{pos.level}</Badge>
                            )}
                            {!pos.is_active && (
                              <Badge className="bg-red-100 text-red-700">Inactivo</Badge>
                            )}
                          </div>
                          {pos.department && (
                            <p className="text-sm text-slate-600 mb-1">
                              <strong>Departamento:</strong> {pos.department}
                            </p>
                          )}
                          {pos.description && (
                            <p className="text-sm text-slate-600">{pos.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {hasAnyPermission(["positions.edit", "positions.manage", "system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(pos, "positions")}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasAnyPermission(["positions.delete", "positions.manage", "system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(pos, "Position")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="departments" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Departamentos</CardTitle>
                  {hasAnyPermission(["departments.create", "system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("departments")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo Departamento
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="Buscar departamento..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredDepartments.map(dept => (
                    <div key={dept.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-slate-900 text-lg">{dept.name}</h4>
                            {dept.code && (
                              <Badge className="bg-orange-100 text-orange-700">{dept.code}</Badge>
                            )}
                            {!dept.is_active && (
                              <Badge className="bg-red-100 text-red-700">Inactivo</Badge>
                            )}
                          </div>
                          {dept.description && (
                            <p className="text-sm text-slate-600">{dept.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {hasAnyPermission(["departments.edit", "system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(dept, "departments")}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasAnyPermission(["departments.delete", "system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(dept, "Department")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banks" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Bancos</CardTitle>
                  {hasAnyPermission(["banks.create", "system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("banks")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo Banco
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="Buscar banco..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredBanks.map(bank => (
                    <div key={bank.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-slate-900 text-lg">{bank.name}</h4>
                            {bank.code && (
                              <Badge className="bg-green-100 text-green-700">{bank.code}</Badge>
                            )}
                            {!bank.is_active && (
                              <Badge className="bg-red-100 text-red-700">Inactivo</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {hasAnyPermission(["banks.edit", "system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(bank, "banks")}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasAnyPermission(["banks.delete", "system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(bank, "Bank")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rmv" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Remuneración Mínima Vital (RMV)</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Solo puede haber un valor activo a la vez. Al crear un nuevo registro, los anteriores se desactivan automáticamente.
                    </p>
                  </div>
                  {hasAnyPermission(["system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("rmv")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nueva RMV
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="Buscar RMV..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredRMVs.map(rmv => (
                    <div key={rmv.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-slate-900 text-xl">S/ {rmv.amount.toFixed(2)}</h4>
                            {rmv.is_active ? (
                              <Badge className="bg-green-100 text-green-700">Vigente</Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-700">Histórico</Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 mb-1">
                            <strong>Fecha de vigencia:</strong> {new Date(rmv.effective_date).toLocaleDateString('es-PE')}
                          </p>
                          {rmv.notes && (
                            <p className="text-sm text-slate-600">{rmv.notes}</p>
                          )}
                          {rmv.is_active && (
                            <p className="text-xs text-indigo-600 mt-2">
                              Asignación Familiar (10% RMV): S/ {(rmv.amount * 0.10).toFixed(2)}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {hasAnyPermission(["system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(rmv, "rmv")}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasAnyPermission(["system.admin"]) && !rmv.is_active && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(rmv, "RMV")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="afp" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Administradoras de Fondos de Pensiones (AFP)</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Configura las AFPs con sus respectivos porcentajes de comisión, aporte y seguro
                    </p>
                  </div>
                  {hasAnyPermission(["system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("afp")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nueva AFP
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="Buscar AFP..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredAFPs.map(afp => (
                    <div key={afp.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <h4 className="font-bold text-slate-900 text-lg">{afp.name}</h4>
                            {afp.code && (
                              <Badge className="bg-teal-100 text-teal-700">{afp.code}</Badge>
                            )}
                            {!afp.is_active && (
                              <Badge className="bg-red-100 text-red-700">Inactiva</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="p-2 bg-blue-50 rounded">
                              <p className="text-xs text-slate-600 mb-1">Comisión</p>
                              <p className="font-bold text-blue-700">{afp.commission_percentage}%</p>
                            </div>
                            <div className="p-2 bg-green-50 rounded">
                              <p className="text-xs text-slate-600 mb-1">Aporte Obligatorio</p>
                              <p className="font-bold text-green-700">{afp.obligatory_contribution_percentage}%</p>
                            </div>
                            <div className="p-2 bg-purple-50 rounded">
                              <p className="text-xs text-slate-600 mb-1">Seguro</p>
                              <p className="font-bold text-purple-700">{afp.insurance_percentage}%</p>
                            </div>
                          </div>
                          {afp.notes && (
                            <p className="text-sm text-slate-600 mt-2">{afp.notes}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {hasAnyPermission(["system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(afp, "afp")}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasAnyPermission(["system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(afp, "AFP")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="professions" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Profesiones</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Catálogo de profesiones para registro de empleados
                    </p>
                  </div>
                  {hasAnyPermission(["system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("professions")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nueva Profesión
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="Buscar profesión..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredProfessions.map(prof => (
                    <div key={prof.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-slate-900 text-lg">{prof.name}</h4>
                            {prof.category && (
                              <Badge className="bg-cyan-100 text-cyan-700">{prof.category}</Badge>
                            )}
                            {!prof.is_active && (
                              <Badge className="bg-red-100 text-red-700">Inactiva</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {hasAnyPermission(["system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(prof, "professions")}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasAnyPermission(["system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(prof, "Profession")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="costcenters" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Centros de Costos</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Gestión de centros de costos por categoría operacional
                    </p>
                  </div>
                  {hasAnyPermission(["system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("costcenters")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo Centro de Costos
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <Input
                      placeholder="Buscar centro de costos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {["Administración", "Ventas", "Transportes", "Oxapampa", "Lima - VES", "Operaciones Generales"].map(category => {
                  const categoryCenters = filteredCostCenters.filter(c => c.category === category);
                  if (categoryCenters.length === 0) return null;

                  return (
                    <div key={category} className="mb-6">
                      <h3 className="text-lg font-bold text-slate-900 mb-3 pb-2 border-b border-slate-200">
                        {category}
                      </h3>
                      <div className="space-y-2">
                        {categoryCenters.map(cc => (
                          <div key={cc.id} className="p-3 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Badge className="bg-rose-100 text-rose-700 font-mono">{cc.code}</Badge>
                                <span className="font-medium text-slate-900">{cc.name}</span>
                                {!cc.is_active && (
                                  <Badge className="bg-red-100 text-red-700">Inactivo</Badge>
                                )}
                              </div>
                              <div className="flex gap-2">
                                {hasAnyPermission(["system.admin"]) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEdit(cc, "costcenters")}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                )}
                                {hasAnyPermission(["system.admin"]) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600"
                                    onClick={() => handleDelete(cc, "CostCenter")}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="segurovida" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Seguro Vida Ley</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Tasas comerciales por rango de edad
                    </p>
                  </div>
                  {hasAnyPermission(["system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("segurovida")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo Rango
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {filteredSeguroVida.map(seguro => (
                    <div key={seguro.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-slate-900 text-lg">
                              {seguro.age_range_start}-{seguro.age_range_end === 1000 ? "más" : seguro.age_range_end} años
                            </h4>
                            <Badge className="bg-red-100 text-red-700">{seguro.commercial_rate}%</Badge>
                            {!seguro.is_active && (
                              <Badge className="bg-gray-100 text-gray-700">Inactivo</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {hasAnyPermission(["system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(seguro, "segurovida")}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasAnyPermission(["system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(seguro, "SeguroVidaLey")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="uit" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Unidad Impositiva Tributaria (UIT)</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Valores históricos de UIT por año
                    </p>
                  </div>
                  {hasAnyPermission(["system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("uit")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nueva UIT
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {filteredUIT.map(uit => (
                    <div key={uit.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-slate-900 text-xl">Año {uit.year}</h4>
                            <Badge className="bg-yellow-100 text-yellow-700 text-lg">S/ {uit.amount.toFixed(2)}</Badge>
                            {uit.year === new Date().getFullYear() && (
                              <Badge className="bg-green-100 text-green-700">Vigente</Badge>
                            )}
                            {!uit.is_active && (
                              <Badge className="bg-gray-100 text-gray-700">Inactivo</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {hasAnyPermission(["system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(uit, "uit")}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {hasAnyPermission(["system.admin"]) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(uit, "UIT")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accountingaccounts" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Cuentas Contables</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Plan contable con elementos, cuentas y nombres
                    </p>
                  </div>
                  {hasAnyPermission(["system.admin"]) && (
                    <Button
                      onClick={() => handleCreate("accountingaccounts")}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nueva Cuenta
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-64">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <Input
                          placeholder="Buscar cuenta contable..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <Select value={elementoFilter} onValueChange={setElementoFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Elemento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los elementos</SelectItem>
                        <SelectItem value="Activos">Activos</SelectItem>
                        <SelectItem value="Pasivos">Pasivos</SelectItem>
                        <SelectItem value="Patrimonio">Patrimonio</SelectItem>
                        <SelectItem value="Ingresos">Ingresos</SelectItem>
                        <SelectItem value="Gastos">Gastos</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <p className="text-sm font-medium text-emerald-900">
                        {filteredAccountingAccounts.length} / {accountingAccounts.length}
                      </p>
                    </div>
                  </div>
                </div>

                {["Activos", "Pasivos", "Patrimonio", "Ingresos", "Gastos"].map(elemento => {
                  const elementoAccounts = filteredAccountingAccounts.filter(a => a.elemento === elemento);
                  if (elementoAccounts.length === 0) return null;

                  return (
                    <div key={elemento} className="mb-6">
                      <h3 className="text-lg font-bold text-slate-900 mb-3 pb-2 border-b border-slate-200">
                        {elemento}
                      </h3>
                      <div className="space-y-2">
                        {elementoAccounts.map(acc => (
                          <div key={acc.id} className="p-3 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Badge className="bg-emerald-100 text-emerald-700 font-mono">{acc.cuenta}</Badge>
                                <span className="font-medium text-slate-900">{acc.nombre}</span>
                                {!acc.is_active && (
                                  <Badge className="bg-red-100 text-red-700">Inactiva</Badge>
                                )}
                              </div>
                              <div className="flex gap-2">
                                {hasAnyPermission(["system.admin"]) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEdit(acc, "accountingaccounts")}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                )}
                                {hasAnyPermission(["system.admin"]) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600"
                                    onClick={() => handleDelete(acc, "AccountingAccount")}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
          </Tabs>
          </div>

       {/* Form Modal rendered via extracted component */}
       {showForm && <MasterDataFormModal activeTab={activeTab} editingItem={editingItem} formData={formData} setFormData={setFormData} onSubmit={handleSubmit} onCancel={resetForm} isSaving={createMutation.isPending || updateMutation.isPending} />}

       {false && (<div><div>
                {activeTab === "sites" && (
                  <>
                    <div>
                      <Label>Nombre *</Label>
                      <Input
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Sede Central"
                      />
                    </div>
                    <div>
                      <Label>Código *</Label>
                      <Input
                        value={formData.code || ""}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        placeholder="Ej: VES"
                      />
                    </div>
                    <div>
                      <Label>Dirección</Label>
                      <Input
                        value={formData.address || ""}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_site"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_site" className="text-sm">Activo</label>
                    </div>
                  </>
                )}

                {activeTab === "positions" && (
                  <>
                    <div>
                      <Label>Nombre *</Label>
                      <Input
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Gerente de Ventas"
                      />
                    </div>
                    <div>
                      <Label>Departamento</Label>
                      <Input
                        value={formData.department || ""}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Nivel Jerárquico</Label>
                      <Select
                        value={formData.level || ""}
                        onValueChange={(val) => setFormData({ ...formData, level: val })}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Directivo">Directivo</SelectItem>
                          <SelectItem value="Gerencial">Gerencial</SelectItem>
                          <SelectItem value="Jefatura">Jefatura</SelectItem>
                          <SelectItem value="Supervisor">Supervisor</SelectItem>
                          <SelectItem value="Operativo">Operativo</SelectItem>
                          <SelectItem value="Administrativo">Administrativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Descripción</Label>
                      <Textarea
                        value={formData.description || ""}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_pos"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_pos" className="text-sm">Activo</label>
                    </div>
                  </>
                )}

                {activeTab === "departments" && (
                  <>
                    <div>
                      <Label>Nombre *</Label>
                      <Input
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Recursos Humanos"
                      />
                    </div>
                    <div>
                      <Label>Código</Label>
                      <Input
                        value={formData.code || ""}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        placeholder="Ej: RRHH"
                      />
                    </div>
                    <div>
                      <Label>Descripción</Label>
                      <Textarea
                        value={formData.description || ""}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_dept"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_dept" className="text-sm">Activo</label>
                    </div>
                  </>
                )}

                {activeTab === "banks" && (
                  <>
                    <div>
                      <Label>Nombre *</Label>
                      <Input
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Banco de Crédito del Perú"
                      />
                    </div>
                    <div>
                      <Label>Código</Label>
                      <Input
                        value={formData.code || ""}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        placeholder="Ej: BCP"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_bank"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_bank" className="text-sm">Activo</label>
                    </div>
                  </>
                )}

                {activeTab === "rmv" && (
                  <>
                    <div>
                      <Label>Monto de RMV (S/) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.amount || ""}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                        placeholder="Ej: 1025.00"
                      />
                      {formData.amount && (
                        <p className="text-xs text-slate-600 mt-1">
                          Asignación Familiar (10%): S/ {(formData.amount * 0.10).toFixed(2)}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Fecha de Vigencia *</Label>
                      <Input
                        type="date"
                        value={formData.effective_date ? formData.effective_date.toString().slice(0, 10) : ""}
                        onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Notas</Label>
                      <Textarea
                        value={formData.notes || ""}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                        placeholder="Observaciones sobre esta RMV..."
                      />
                    </div>
                    {editingItem && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="is_active_rmv"
                          checked={formData.is_active !== false}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          className="w-4 h-4 rounded"
                        />
                        <label htmlFor="is_active_rmv" className="text-sm">Vigente</label>
                      </div>
                    )}
                    {!editingItem && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs text-amber-800">
                          Al crear esta RMV, todos los registros anteriores se marcarán automáticamente como históricos.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {activeTab === "afp" && (
                  <>
                    <div>
                      <Label>Nombre de la AFP *</Label>
                      <Input
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: AFP Integra"
                      />
                    </div>
                    <div>
                      <Label>Código</Label>
                      <Input
                        value={formData.code || ""}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        placeholder="Ej: INTEGRA"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>% Comisión *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.commission_percentage || ""}
                          onChange={(e) => setFormData({ ...formData, commission_percentage: parseFloat(e.target.value) })}
                          placeholder="Ej: 1.47"
                        />
                      </div>
                      <div>
                        <Label>% Aporte Obligatorio *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.obligatory_contribution_percentage || 10}
                          onChange={(e) => setFormData({ ...formData, obligatory_contribution_percentage: parseFloat(e.target.value) })}
                          placeholder="Ej: 10.00"
                        />
                      </div>
                      <div>
                        <Label>% Seguro *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.insurance_percentage || ""}
                          onChange={(e) => setFormData({ ...formData, insurance_percentage: parseFloat(e.target.value) })}
                          placeholder="Ej: 1.33"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Notas</Label>
                      <Textarea
                        value={formData.notes || ""}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={2}
                        placeholder="Observaciones sobre esta AFP..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_afp"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_afp" className="text-sm">Activa</label>
                    </div>
                  </>
                )}

                {activeTab === "professions" && (
                  <>
                    <div>
                      <Label>Nombre de la Profesión *</Label>
                      <Input
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Ingeniero Civil"
                      />
                    </div>
                    <div>
                      <Label>Categoría</Label>
                      <Input
                        value={formData.category || ""}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        placeholder="Ej: Ingeniería"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_profession"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_profession" className="text-sm">Activa</label>
                    </div>
                  </>
                )}

                {activeTab === "costcenters" && (
                  <>
                    <div>
                      <Label>Código *</Label>
                      <Input
                        value={formData.code || ""}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        placeholder="Ej: 101"
                      />
                    </div>
                    <div>
                      <Label>Nombre del Centro de Costos *</Label>
                      <Input
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Directorio"
                      />
                    </div>
                    <div>
                      <Label>Categoría *</Label>
                      <Select
                        value={formData.category || ""}
                        onValueChange={(val) => setFormData({ ...formData, category: val })}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Administración">Administración</SelectItem>
                          <SelectItem value="Ventas">Ventas</SelectItem>
                          <SelectItem value="Transportes">Transportes</SelectItem>
                          <SelectItem value="Oxapampa">Oxapampa</SelectItem>
                          <SelectItem value="Lima - VES">Lima - VES</SelectItem>
                          <SelectItem value="Operaciones Generales">Operaciones Generales</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_costcenter"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_costcenter" className="text-sm">Activo</label>
                    </div>
                  </>
                )}

                {activeTab === "segurovida" && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Edad Inicio *</Label>
                        <Input
                          type="number"
                          value={formData.age_range_start || ""}
                          onChange={(e) => setFormData({ ...formData, age_range_start: parseInt(e.target.value) })}
                          placeholder="Ej: 18"
                        />
                      </div>
                      <div>
                        <Label>Edad Fin *</Label>
                        <Input
                          type="number"
                          value={formData.age_range_end || ""}
                          onChange={(e) => setFormData({ ...formData, age_range_end: parseInt(e.target.value) })}
                          placeholder="Ej: 36 (use 1000 para 'más')"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Tasa Comercial (%) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.commercial_rate || ""}
                        onChange={(e) => setFormData({ ...formData, commercial_rate: parseFloat(e.target.value) })}
                        placeholder="Ej: 0.12"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_seguro"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_seguro" className="text-sm">Activo</label>
                    </div>
                  </>
                )}

                {activeTab === "uit" && (
                  <>
                    <div>
                      <Label>Año *</Label>
                      <Input
                        type="number"
                        value={formData.year || ""}
                        onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                        placeholder="Ej: 2026"
                      />
                    </div>
                    <div>
                      <Label>Monto (S/) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.amount || ""}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                        placeholder="Ej: 5150.00"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_uit"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_uit" className="text-sm">Activo</label>
                    </div>
                  </>
                )}

                {activeTab === "accountingaccounts" && (
                  <>
                    <div>
                      <Label>Elemento *</Label>
                      <Select
                        value={formData.elemento || ""}
                        onValueChange={(val) => setFormData({ ...formData, elemento: val })}
                      >
                        <SelectTrigger><SelectValue placeholder="Seleccionar elemento" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Activos">Activos</SelectItem>
                          <SelectItem value="Pasivos">Pasivos</SelectItem>
                          <SelectItem value="Patrimonio">Patrimonio</SelectItem>
                          <SelectItem value="Ingresos">Ingresos</SelectItem>
                          <SelectItem value="Gastos">Gastos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Código de Cuenta *</Label>
                      <Input
                        value={formData.cuenta || ""}
                        onChange={(e) => setFormData({ ...formData, cuenta: e.target.value })}
                        placeholder="Ej: 2011100"
                      />
                    </div>
                    <div>
                      <Label>Nombre de la Cuenta *</Label>
                      <Input
                        value={formData.nombre || ""}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        placeholder="Ej: MERCADERIAS COSTO"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_accounting"
                        checked={formData.is_active !== false}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor="is_active_accounting" className="text-sm">Activa</label>
                    </div>
                  </>
                )}

                {activeTab === "areaunidadcargo" && (
                  <>
                    <div>
                      <Label>Área *</Label>
                      <Input value={formData.area || ""} onChange={(e) => setFormData({ ...formData, area: e.target.value })} placeholder="Ej: ADMINISTRACION" />
                    </div>
                    <div>
                      <Label>Unidad de Trabajo *</Label>
                      <Input value={formData.unidad || ""} onChange={(e) => setFormData({ ...formData, unidad: e.target.value })} placeholder="Ej: CONTABILIDAD" />
                    </div>
                    <div>
                      <Label>Cargo *</Label>
                      <Input value={formData.cargo || ""} onChange={(e) => setFormData({ ...formData, cargo: e.target.value })} placeholder="Ej: ANALISTA" />
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="is_active_auc" checked={formData.is_active !== false} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="w-4 h-4 rounded" />
                      <label htmlFor="is_active_auc" className="text-sm">Activo</label>
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={resetForm}>
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    onClick={handleSubmit}
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {editingItem ? "Actualizar" : "Crear"}
                  </Button>
                </div>
                </div>
                </div>
                )}
    </div>
  );
}
