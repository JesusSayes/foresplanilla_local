import React, { useState } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Plus, X, ArrowRight, Wallet } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function AFPChangeHistoryPanel({ employee, afps = [], canEdit = false }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    change_date: format(new Date(), "yyyy-MM-dd"),
    new_pension_system: "AFP",
    new_afp_id: "",
    new_commission_type: "",
    new_cuspp: "",
    change_type: "Cambio de AFP",
    change_reason: "",
    notes: "",
  });
  const queryClient = useQueryClient();

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["afpChangeHistory", employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      return await entitiesAPI.AFPChangeHistory.filter(
        { employee_id: employee.id },
        "-change_date"
      );
    },
    enabled: !!employee?.id,
  });

  const createChangeMutation = useMutation({
    mutationFn: async (data) => {
      const updateData = {
        pension_system: data.new_pension_system,
        afp_change: {
          change_date: data.change_date,
          change_type: data.change_type,
          change_reason: data.change_reason || "Cambio registrado desde historial AFP",
          notes: data.notes || "",
        },
      };
      if (data.new_pension_system === "AFP") {
        if (data.new_afp_id) updateData.afp_id = data.new_afp_id;
        if (data.new_commission_type) updateData.afp_commission_type = data.new_commission_type;
        if (data.new_cuspp) updateData.cuspp = data.new_cuspp;
        if (!employee.afp_affiliation_date) updateData.afp_affiliation_date = data.change_date;
      } else {
        updateData.afp_id = null;
        updateData.afp_commission_type = null;
        updateData.cuspp = null;
      }
      return await entitiesAPI.Employee.update(employee.id, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["afpChangeHistory", employee?.id] });
      queryClient.invalidateQueries({ queryKey: ["allEmployees"] });
      toast.success("✅ Cambio de AFP registrado correctamente");
      setShowForm(false);
      setFormData({
        change_date: format(new Date(), "yyyy-MM-dd"),
        new_pension_system: "AFP",
        new_afp_id: "",
        new_commission_type: "",
        new_cuspp: "",
        change_type: "Cambio de AFP",
        change_reason: "",
        notes: "",
      });
    },
    onError: (error) => {
      toast.error(`Error: ${error?.message || "No se pudo registrar el cambio"}`);
    },
  });

  const handleSubmit = () => {
    if (!formData.change_date) {
      toast.error("La fecha del cambio es obligatoria");
      return;
    }
    if (formData.new_pension_system === "AFP" && !formData.new_afp_id) {
      toast.error("Debe seleccionar la nueva AFP");
      return;
    }
    if (formData.new_pension_system === "AFP" && !formData.new_commission_type) {
      toast.error("Debe seleccionar el tipo de comisión AFP");
      return;
    }
    createChangeMutation.mutate(formData);
  };

  const currentAFPName = afps.find(a => a.id === employee?.afp_id)?.name || "N/A";

  const getChangeTypeColor = (type) => {
    const colors = {
      "Cambio de AFP": "bg-blue-100 text-blue-700 border-blue-300",
      "Cambio de Comisión": "bg-purple-100 text-purple-700 border-purple-300",
      "Cambio de CUSPP": "bg-amber-100 text-amber-700 border-amber-300",
      "Cambio de Sistema de Pensiones": "bg-indigo-100 text-indigo-700 border-indigo-300",
      "Registro Inicial": "bg-green-100 text-green-700 border-green-300",
      "Otro": "bg-slate-100 text-slate-700 border-slate-300",
    };
    return colors[type] || colors["Otro"];
  };

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader className="border-b bg-slate-50/50 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Wallet className="w-4 h-4 text-indigo-600" />
            Historial de Cambios de AFP
          </CardTitle>
          {canEdit && !showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" />Registrar Cambio
            </Button>
          )}
        </div>
        {/* AFP actual resumida */}
        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
          <Badge className="bg-indigo-100 text-indigo-700 border-indigo-300">
            Actual: {employee?.pension_system || "Ninguno"}
          </Badge>
          {employee?.pension_system === "AFP" && (
            <>
              <Badge className="bg-blue-100 text-blue-700 border-blue-300">{currentAFPName}</Badge>
              {employee?.afp_commission_type && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-300">
                  Comisión: {employee.afp_commission_type}
                </Badge>
              )}
              {employee?.cuspp && (
                <Badge className="bg-slate-100 text-slate-700 border-slate-300">
                  CUSPP: {employee.cuspp}
                </Badge>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {/* Formulario de nuevo cambio */}
        {showForm && (
          <div className="mb-4 p-4 border border-indigo-200 rounded-lg bg-indigo-50/30 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">Registrar Nuevo Cambio de AFP</h4>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Fecha del Cambio *</Label>
                <Input
                  type="date"
                  value={formData.change_date}
                  onChange={(e) => setFormData({ ...formData, change_date: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Tipo de Cambio</Label>
                <Select
                  value={formData.change_type}
                  onValueChange={(v) => setFormData({ ...formData, change_type: v })}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cambio de AFP">Cambio de AFP</SelectItem>
                    <SelectItem value="Cambio de Comisión">Cambio de Comisión</SelectItem>
                    <SelectItem value="Cambio de CUSPP">Cambio de CUSPP</SelectItem>
                    <SelectItem value="Cambio de Sistema de Pensiones">Cambio de Sistema de Pensiones</SelectItem>
                    <SelectItem value="Registro Inicial">Registro Inicial</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nuevo Sistema de Pensiones</Label>
                <Select
                  value={formData.new_pension_system}
                  onValueChange={(v) => setFormData({ ...formData, new_pension_system: v, new_afp_id: v === "AFP" ? formData.new_afp_id : "" })}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AFP">AFP</SelectItem>
                    <SelectItem value="ONP">ONP</SelectItem>
                    <SelectItem value="Ninguno">Ninguno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.new_pension_system === "AFP" && (
                <div>
                  <Label className="text-xs">Nueva AFP *</Label>
                  <Select
                    value={formData.new_afp_id}
                    onValueChange={(v) => setFormData({ ...formData, new_afp_id: v })}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar AFP" /></SelectTrigger>
                    <SelectContent>
                      {afps.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {formData.new_pension_system === "AFP" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo de Comisión</Label>
                  <Select
                    value={formData.new_commission_type}
                    onValueChange={(v) => setFormData({ ...formData, new_commission_type: v })}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Flujo">Flujo</SelectItem>
                      <SelectItem value="Mixta">Mixta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Nuevo CUSPP</Label>
                  <Input
                    value={formData.new_cuspp}
                    onChange={(e) => setFormData({ ...formData, new_cuspp: e.target.value })}
                    placeholder="Código CUSPP"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">Motivo del Cambio</Label>
              <Input
                value={formData.change_reason}
                onChange={(e) => setFormData({ ...formData, change_reason: e.target.value })}
                placeholder="Ej: Traslado de AFP, cambio de comisión, etc."
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observaciones adicionales..."
                rows={2}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button
                size="sm"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={handleSubmit}
                disabled={createChangeMutation.isPending}
              >
                {createChangeMutation.isPending ? "Guardando..." : "Registrar Cambio"}
              </Button>
            </div>
          </div>
        )}

        {/* Timeline de historial */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-6">
            <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No hay cambios de AFP registrados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry, idx) => (
              <div key={entry.id} className="flex gap-3">
                {/* Timeline dot */}
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full mt-1.5 ${idx === 0 ? "bg-indigo-600" : "bg-slate-300"}`} />
                  {idx < history.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 min-h-[40px]" />}
                </div>
                {/* Content */}
                <div className="flex-1 pb-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge className={getChangeTypeColor(entry.change_type)}>{entry.change_type}</Badge>
                    <span className="text-xs font-medium text-slate-700">
                      {entry.change_date ? format(new Date(String(entry.change_date).slice(0, 10) + "T00:00:00"), "dd MMM yyyy", { locale: es }) : "Sin fecha"}
                    </span>
                  </div>
                  <div className="text-sm text-slate-700 space-y-0.5">
                    {/* Before → After */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-slate-500">
                        {entry.previous_pension_system || "—"}
                        {entry.previous_afp_name && ` · ${entry.previous_afp_name}`}
                        {entry.previous_commission_type && ` · ${entry.previous_commission_type}`}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="font-medium text-slate-800">
                        {entry.new_pension_system || "—"}
                        {entry.new_afp_name && ` · ${entry.new_afp_name}`}
                        {entry.new_commission_type && ` · ${entry.new_commission_type}`}
                      </span>
                    </div>
                    {/* CUSPP change if applicable */}
                    {entry.previous_cuspp && entry.new_cuspp && entry.previous_cuspp !== entry.new_cuspp && (
                      <p className="text-xs text-amber-600">CUSPP: {entry.previous_cuspp} → {entry.new_cuspp}</p>
                    )}
                    {entry.change_reason && (
                      <p className="text-xs text-slate-500 italic">Motivo: {entry.change_reason}</p>
                    )}
                    {entry.notes && (
                      <p className="text-xs text-slate-400">{entry.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
