import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TAB_LABELS = {
  sites: "Sede", positions: "Cargo", departments: "Departamento", banks: "Banco",
  rmv: "RMV", afp: "AFP", professions: "Profesión", costcenters: "Centro de Costos",
  segurovida: "Seguro Vida Ley", uit: "UIT", accountingaccounts: "Cuenta Contable",
  areaunidadcargo: "Área/Unidad/Cargo", incidenttypes: "Tipo de Incidente",
};

export default function MasterDataFormModal({ activeTab, editingItem, formData, setFormData, onSubmit, onCancel, isSaving }) {
  const F = (key) => ({ value: formData[key] || "", onChange: (e) => setFormData({ ...formData, [key]: e.target.value }) });
  const checkbox = (key, id) => (
    <div className="flex items-center gap-2">
      <input type="checkbox" id={id} checked={formData[key] !== false} onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })} className="w-4 h-4 rounded" />
      <label htmlFor={id} className="text-sm">Activo</label>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={onCancel}>
      <Card className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">{editingItem ? "Editar" : "Nuevo"} {TAB_LABELS[activeTab] || ""}</CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            {activeTab === "areaunidadcargo" && (<>
              <div><Label>Área *</Label><Input {...F("area")} placeholder="Ej: ADMINISTRACION" /></div>
              <div><Label>Unidad de Trabajo *</Label><Input {...F("unidad")} placeholder="Ej: CONTABILIDAD" /></div>
              <div><Label>Cargo *</Label><Input {...F("cargo")} placeholder="Ej: ANALISTA" /></div>
              {checkbox("is_active", "is_active_auc")}
            </>)}
            {activeTab === "sites" && (<>
              <div><Label>Nombre *</Label><Input {...F("name")} placeholder="Ej: Sede Central" /></div>
              <div><Label>Código *</Label><Input {...F("code")} placeholder="Ej: VES" /></div>
              <div><Label>Dirección</Label><Input {...F("address")} /></div>
              {checkbox("is_active", "is_active_site")}
            </>)}
            {activeTab === "positions" && (<>
              <div><Label>Nombre *</Label><Input {...F("name")} placeholder="Ej: Gerente de Ventas" /></div>
              <div><Label>Departamento</Label><Input {...F("department")} /></div>
              <div>
                <Label>Nivel Jerárquico</Label>
                <Select value={formData.level || ""} onValueChange={(v) => setFormData({ ...formData, level: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {["Directivo","Gerencial","Jefatura","Supervisor","Operativo","Administrativo"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Descripción</Label><Textarea {...F("description")} rows={3} /></div>
              {checkbox("is_active", "is_active_pos")}
            </>)}
            {activeTab === "departments" && (<>
              <div><Label>Nombre *</Label><Input {...F("name")} placeholder="Ej: Recursos Humanos" /></div>
              <div><Label>Código</Label><Input {...F("code")} placeholder="Ej: RRHH" /></div>
              <div><Label>Descripción</Label><Textarea {...F("description")} rows={3} /></div>
              {checkbox("is_active", "is_active_dept")}
            </>)}
            {activeTab === "banks" && (<>
              <div><Label>Nombre *</Label><Input {...F("name")} placeholder="Ej: Banco de Crédito del Perú" /></div>
              <div><Label>Código</Label><Input {...F("code")} placeholder="Ej: BCP" /></div>
              {checkbox("is_active", "is_active_bank")}
            </>)}
            {activeTab === "rmv" && (<>
              <div>
                <Label>Monto de RMV (S/) *</Label>
                <Input type="number" step="0.01" value={formData.amount || ""} onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })} placeholder="Ej: 1025.00" />
                {formData.amount && <p className="text-xs text-slate-600 mt-1">Asignación Familiar (10%): S/ {(formData.amount * 0.10).toFixed(2)}</p>}
              </div>
              <div><Label>Fecha de Vigencia *</Label><Input type="date" value={formData.effective_date || ""} onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })} /></div>
              <div><Label>Notas</Label><Textarea {...F("notes")} rows={3} placeholder="Observaciones..." /></div>
              {editingItem && checkbox("is_active", "is_active_rmv")}
              {!editingItem && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg"><p className="text-xs text-amber-800">Al crear esta RMV, los registros anteriores se marcarán como históricos.</p></div>}
            </>)}
            {activeTab === "afp" && (<>
              <div><Label>Nombre de la AFP *</Label><Input {...F("name")} placeholder="Ej: AFP Integra" /></div>
              <div><Label>Código</Label><Input {...F("code")} placeholder="Ej: INTEGRA" /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>% Comisión *</Label><Input type="number" step="0.01" value={formData.commission_percentage || ""} onChange={(e) => setFormData({ ...formData, commission_percentage: parseFloat(e.target.value) })} /></div>
                <div><Label>% Aporte Obligatorio *</Label><Input type="number" step="0.01" value={formData.obligatory_contribution_percentage || 10} onChange={(e) => setFormData({ ...formData, obligatory_contribution_percentage: parseFloat(e.target.value) })} /></div>
                <div><Label>% Seguro *</Label><Input type="number" step="0.01" value={formData.insurance_percentage || ""} onChange={(e) => setFormData({ ...formData, insurance_percentage: parseFloat(e.target.value) })} /></div>
              </div>
              <div><Label>Notas</Label><Textarea {...F("notes")} rows={2} /></div>
              {checkbox("is_active", "is_active_afp")}
            </>)}
            {activeTab === "professions" && (<>
              <div><Label>Nombre *</Label><Input {...F("name")} placeholder="Ej: Ingeniero Civil" /></div>
              <div><Label>Categoría</Label><Input {...F("category")} placeholder="Ej: Ingeniería" /></div>
              {checkbox("is_active", "is_active_profession")}
            </>)}
            {activeTab === "costcenters" && (<>
              <div><Label>Código *</Label><Input {...F("code")} placeholder="Ej: 101" /></div>
              <div><Label>Nombre *</Label><Input {...F("name")} placeholder="Ej: Directorio" /></div>
              <div>
                <Label>Categoría *</Label>
                <Select value={formData.category || ""} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                  <SelectContent>
                    {["Administración","Ventas","Transportes","Oxapampa","Lima - VES","Operaciones Generales"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {checkbox("is_active", "is_active_cc")}
            </>)}
            {activeTab === "segurovida" && (<>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Edad Inicio *</Label><Input type="number" value={formData.age_range_start || ""} onChange={(e) => setFormData({ ...formData, age_range_start: parseInt(e.target.value) })} /></div>
                <div><Label>Edad Fin *</Label><Input type="number" value={formData.age_range_end || ""} onChange={(e) => setFormData({ ...formData, age_range_end: parseInt(e.target.value) })} placeholder="1000 para 'más'" /></div>
              </div>
              <div><Label>Tasa Comercial (%) *</Label><Input type="number" step="0.01" value={formData.commercial_rate || ""} onChange={(e) => setFormData({ ...formData, commercial_rate: parseFloat(e.target.value) })} /></div>
              {checkbox("is_active", "is_active_seguro")}
            </>)}
            {activeTab === "uit" && (<>
              <div><Label>Año *</Label><Input type="number" value={formData.year || ""} onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })} placeholder="Ej: 2026" /></div>
              <div><Label>Monto (S/) *</Label><Input type="number" step="0.01" value={formData.amount || ""} onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })} placeholder="Ej: 5150.00" /></div>
              {checkbox("is_active", "is_active_uit")}
            </>)}
            {activeTab === "accountingaccounts" && (<>
              <div>
                <Label>Elemento *</Label>
                <Select value={formData.elemento || ""} onValueChange={(v) => setFormData({ ...formData, elemento: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar elemento" /></SelectTrigger>
                  <SelectContent>
                    {["Activos","Pasivos","Patrimonio","Ingresos","Gastos"].map(el => <SelectItem key={el} value={el}>{el}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Código de Cuenta *</Label><Input {...F("cuenta")} placeholder="Ej: 2011100" /></div>
              <div><Label>Nombre de la Cuenta *</Label><Input {...F("nombre")} placeholder="Ej: MERCADERIAS COSTO" /></div>
              {checkbox("is_active", "is_active_accounting")}
            </>)}

            {activeTab === "incidenttypes" && (<>
              <div><Label>Nombre *</Label><Input {...F("name")} placeholder="Ej: Descanso Médico" /></div>
              <div>
                <Label>Afectación *</Label>
                <Select value={formData.affectation || ""} onValueChange={(v) => setFormData({ ...formData, affectation: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar afectación" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Permiso">Permiso — no descuenta horas/días</SelectItem>
                    <SelectItem value="Descuento">Descuento — descuenta horas/días</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {checkbox("is_active", "is_active_incidenttype")}
            </>)}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
              <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={onSubmit} disabled={isSaving}>
                {editingItem ? "Actualizar" : "Crear"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}