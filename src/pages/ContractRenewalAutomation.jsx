import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Calendar, Plus, Edit, Trash2, Bell, FileText, 
  AlertTriangle, Settings
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { usePermissions } from "@/components/hooks/usePermissions";
import ProcessRenewalModal from "@/components/contracts/ProcessRenewalModal";

export default function ContractRenewalAutomation() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleData, setRuleData] = useState({
    name: "",
    is_active: true,
    days_before_expiration: 30,
    contract_types: ["Plazo Fijo"],
    send_notification: true,
    notification_emails: [],
    auto_create_draft: false,
    only_renewable: true,
    draft_extension_months: 12,
  });
  const [emailInput, setEmailInput] = useState("");
  const [showProcessModal, setShowProcessModal] = useState(false);

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

  const { data: rules = [] } = useQuery({
    queryKey: ["contractRenewalRules"],
    queryFn: async () => {
      return await base44.entities.ContractRenewalRule.list("-created_date");
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["allContracts"],
    queryFn: async () => {
      return await base44.entities.Contract.list("-created_date");
    },
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await base44.entities.Employee.list("-created_date", 500);
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.ContractRenewalRule.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractRenewalRules"]);
      toast.success("Regla creada correctamente");
      resetForm();
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.ContractRenewalRule.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractRenewalRules"]);
      toast.success("Regla actualizada correctamente");
      resetForm();
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.ContractRenewalRule.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractRenewalRules"]);
      toast.success("Regla eliminada correctamente");
    },
  });

  const handleSubmit = () => {
    if (!ruleData.name) {
      toast.error("Ingresa un nombre para la regla");
      return;
    }

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: ruleData });
    } else {
      createRuleMutation.mutate(ruleData);
    }
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setRuleData(rule);
    setShowRuleForm(true);
  };

  const handleDelete = (id) => {
    if (confirm("¿Eliminar esta regla de automatización?")) {
      deleteRuleMutation.mutate(id);
    }
  };

  const resetForm = () => {
    setRuleData({
      name: "",
      is_active: true,
      days_before_expiration: 30,
      contract_types: ["Plazo Fijo"],
      send_notification: true,
      notification_emails: [],
      auto_create_draft: false,
      only_renewable: true,
      draft_extension_months: 12,
    });
    setEditingRule(null);
    setShowRuleForm(false);
    setEmailInput("");
  };

  const handleAddEmail = () => {
    if (emailInput && emailInput.includes("@")) {
      setRuleData({
        ...ruleData,
        notification_emails: [...(ruleData.notification_emails || []), emailInput]
      });
      setEmailInput("");
    } else {
      toast.error("Email inválido");
    }
  };

  const handleRemoveEmail = (email) => {
    setRuleData({
      ...ruleData,
      notification_emails: ruleData.notification_emails.filter(e => e !== email)
    });
  };

  const handleProcessAutomation = () => {
    setShowProcessModal(true);
  };

  const handleProcessCompleted = () => {
    queryClient.invalidateQueries(["allContracts"]);
  };

  const getExpiringContracts = () => {
    const today = new Date();
    return contracts.filter(c => {
      if (!c.end_date || c.status !== "Vigente") return false;
      const endDate = new Date(c.end_date);
      const daysUntilExpiration = differenceInDays(endDate, today);
      return daysUntilExpiration <= 60 && daysUntilExpiration > 0;
    }).sort((a, b) => new Date(a.end_date) - new Date(b.end_date));
  };

  const expiringContracts = getExpiringContracts();

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasPermission("contracts.renewal")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para configurar la automatización de renovación</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Automatización de Renovación de Contratos
            </h1>
            <p className="text-slate-600 text-lg">
              Configura reglas para notificaciones y generación automática de borradores
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleProcessAutomation}
              variant="outline"
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Settings className="w-4 h-4 mr-2" />
              Procesar Ahora
            </Button>
            <Button
              onClick={() => setShowRuleForm(true)}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Regla
            </Button>
          </div>
        </div>

        {/* Contratos próximos a vencer */}
        {expiringContracts.length > 0 && (
          <Card className="border-0 shadow-lg mb-8 bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
            <CardHeader className="border-b bg-orange-100/50">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
                <CardTitle className="text-xl font-bold text-orange-900">
                  {expiringContracts.length} Contrato{expiringContracts.length !== 1 ? 's' : ''} Próximo{expiringContracts.length !== 1 ? 's' : ''} a Vencer
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {expiringContracts.slice(0, 5).map(contract => {
                  const emp = allEmployees.find(e => e.id === contract.employee_id);
                  if (!emp) return null;

                  const daysLeft = differenceInDays(new Date(contract.end_date), new Date());

                  return (
                    <div key={contract.id} className="p-4 bg-white rounded-lg border border-orange-200 flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-900 mb-1">
                          {emp.first_name} {emp.last_name}
                        </h4>
                        <p className="text-sm text-slate-600">
                          {contract.position} • {contract.contract_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge className={daysLeft <= 15 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}>
                          {daysLeft} día{daysLeft !== 1 ? 's' : ''}
                        </Badge>
                        <p className="text-xs text-slate-600 mt-1">
                          Vence: {format(new Date(contract.end_date), "dd/MM/yyyy")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reglas de Automatización */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-xl font-bold">Reglas Configuradas</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {rules.length === 0 ? (
              <div className="text-center py-12">
                <Settings className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No hay reglas configuradas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rules.map(rule => (
                  <div key={rule.id} className="p-4 border border-slate-200 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-bold text-slate-900">{rule.name}</h4>
                          <Badge className={rule.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                            {rule.is_active ? "Activa" : "Inactiva"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-slate-600">Días antes</p>
                            <p className="font-semibold text-slate-900">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              {rule.days_before_expiration}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600">Tipos de contrato</p>
                            <p className="font-semibold text-slate-900">{rule.contract_types?.join(", ")}</p>
                          </div>
                          <div>
                            <p className="text-slate-600">Notificación</p>
                            <p className="font-semibold text-slate-900">
                              <Bell className="w-3 h-3 inline mr-1" />
                              {rule.send_notification ? "Sí" : "No"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600">Crear borrador</p>
                            <p className="font-semibold text-slate-900">
                              <FileText className="w-3 h-3 inline mr-1" />
                              {rule.auto_create_draft ? "Sí" : "No"}
                            </p>
                          </div>
                        </div>
                        {rule.notification_emails?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-slate-600">
                              Emails: {rule.notification_emails.join(", ")}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(rule)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(rule.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Procesamiento */}
      <ProcessRenewalModal
        open={showProcessModal}
        onClose={() => setShowProcessModal(false)}
        rules={rules}
        contracts={contracts}
        allEmployees={allEmployees}
        currentUser={currentUser}
        onCompleted={handleProcessCompleted}
      />

      {/* Form Modal */}
      {showRuleForm && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={resetForm}
        >
          <Card 
            className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingRule ? "Editar Regla" : "Nueva Regla de Automatización"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div>
                <Label>Nombre de la Regla *</Label>
                <Input
                  value={ruleData.name}
                  onChange={(e) => setRuleData({ ...ruleData, name: e.target.value })}
                  placeholder="Ej: Renovación Contratos Plazo Fijo"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Regla Activa</Label>
                  <p className="text-sm text-slate-600">Activar o desactivar esta regla</p>
                </div>
                <Switch
                  checked={ruleData.is_active}
                  onCheckedChange={(checked) => setRuleData({ ...ruleData, is_active: checked })}
                />
              </div>

              <div>
                <Label>Días antes del vencimiento</Label>
                <Input
                  type="number"
                  value={ruleData.days_before_expiration}
                  onChange={(e) => setRuleData({ ...ruleData, days_before_expiration: parseInt(e.target.value) })}
                />
                <p className="text-xs text-slate-500 mt-1">
                  La regla se activará cuando falten <strong>menos</strong> de estos días para el vencimiento (ej: 16 = contratos con menos de 16 días restantes)
                </p>
              </div>

              <div>
                <Label>Tipos de Contrato</Label>
                <p className="text-xs text-slate-500 mb-2">
                  No incluye contratos Indeterminados (sin fecha de vencimiento)
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["Plazo Fijo", "Part-Time", "Prácticas", "SNP"].map(type => (
                    <Badge
                      key={type}
                      className={`cursor-pointer ${ruleData.contract_types?.includes(type) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                      onClick={() => {
                        const types = ruleData.contract_types || [];
                        if (types.includes(type)) {
                          setRuleData({ ...ruleData, contract_types: types.filter(t => t !== type) });
                        } else {
                          setRuleData({ ...ruleData, contract_types: [...types, type] });
                        }
                      }}
                    >
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Solo Contratos Renovables</Label>
                  <p className="text-sm text-slate-600">Aplicar solo a contratos marcados como renovables</p>
                </div>
                <Switch
                  checked={ruleData.only_renewable}
                  onCheckedChange={(checked) => setRuleData({ ...ruleData, only_renewable: checked })}
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="font-bold text-slate-900 mb-4">Notificaciones</h3>
                
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Label>Enviar Notificaciones</Label>
                    <p className="text-sm text-slate-600">Notificar a RRHH cuando se active la regla</p>
                  </div>
                  <Switch
                    checked={ruleData.send_notification}
                    onCheckedChange={(checked) => setRuleData({ ...ruleData, send_notification: checked })}
                  />
                </div>

                {ruleData.send_notification && (
                  <div>
                    <Label>Emails Adicionales</Label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="ejemplo@empresa.com"
                        onKeyPress={(e) => e.key === "Enter" && handleAddEmail()}
                      />
                      <Button onClick={handleAddEmail} size="sm">Agregar</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ruleData.notification_emails?.map(email => (
                        <Badge key={email} variant="outline">
                          {email}
                          <button
                            onClick={() => handleRemoveEmail(email)}
                            className="ml-2 text-red-600 hover:text-red-800"
                          >
                            ✕
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t pt-6">
                <h3 className="font-bold text-slate-900 mb-4">Generación Automática</h3>
                
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Label>Crear Borrador Automáticamente</Label>
                    <p className="text-sm text-slate-600">Generar borrador de nuevo contrato</p>
                  </div>
                  <Switch
                    checked={ruleData.auto_create_draft}
                    onCheckedChange={(checked) => setRuleData({ ...ruleData, auto_create_draft: checked })}
                  />
                </div>

                {ruleData.auto_create_draft && (
                  <div>
                    <Label>Duración del Nuevo Contrato (meses)</Label>
                    <Input
                      type="number"
                      value={ruleData.draft_extension_months}
                      onChange={(e) => setRuleData({ ...ruleData, draft_extension_months: parseInt(e.target.value) })}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      El borrador se creará con esta duración desde el día siguiente al vencimiento
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-6 border-t">
                <Button variant="outline" className="flex-1" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmit}
                  disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
                >
                  {editingRule ? "Actualizar" : "Crear"} Regla
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}