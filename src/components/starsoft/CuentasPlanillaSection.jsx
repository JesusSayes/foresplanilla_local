import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, X, BookOpen } from "lucide-react";

const TIPOS_PLANILLA = [
  { value: "regular", label: "Planilla de Remuneraciones (Plazo Fijo)" },
  { value: "snp", label: "Servicios No Personales (Honorarios / SNP)" },
];

const tipoLabel = (v) => TIPOS_PLANILLA.find(t => t.value === v)?.label || v;

/**
 * Datagrid CRUD de cuentas contables por tipo de planilla.
 * Cada registro vincula un tipo de planilla con UNA cuenta contable y su rol (Debe o Haber).
 * Para configurar un tipo de planilla completo se agregan dos registros:
 * uno del DEBE (gasto) y uno del HABER (neto a pagar / descuentos).
 *
 * Props:
 *  - value: array de { tipo_planilla, cuenta, debe_haber }
 *  - onChange: (newValue) => void
 *  - cuentas: lista de CuentaContable activas
 */
export default function CuentasPlanillaSection({ value, onChange, cuentas }) {
  const entries = Array.isArray(value) ? value : [];
  const [editingIdx, setEditingIdx] = useState(null); // null | "new" | number
  const [draft, setDraft] = useState({ tipo_planilla: "regular", cuenta: "", debe_haber: "D" });

  const cuentaLabel = (codigo) => {
    if (!codigo) return "—";
    const c = cuentas.find(c => c.cuenta === codigo);
    return c ? `${c.cuenta} — ${c.descripcion}` : codigo;
  };

  const startAdd = () => {
    setDraft({ tipo_planilla: "regular", cuenta: "", debe_haber: "D" });
    setEditingIdx("new");
  };

  const startEdit = (idx) => {
    setDraft({ ...entries[idx] });
    setEditingIdx(idx);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setDraft({ tipo_planilla: "regular", cuenta: "", debe_haber: "D" });
  };

  const [dupError, setDupError] = useState("");

  const isDuplicate = (candidate, excludeIdx) => {
    return entries.some((e, i) =>
      i !== excludeIdx &&
      e.tipo_planilla === candidate.tipo_planilla &&
      String(e.cuenta) === String(candidate.cuenta) &&
      e.debe_haber === candidate.debe_haber
    );
  };

  const saveDraft = () => {
    setDupError("");
    if (!draft.tipo_planilla || !draft.cuenta || !draft.debe_haber) return;
    const excludeIdx = typeof editingIdx === "number" ? editingIdx : -1;
    if (isDuplicate(draft, excludeIdx)) {
      setDupError("Ya existe una cuenta con el mismo tipo de planilla, cuenta y debe/haber.");
      return;
    }
    if (editingIdx === "new") {
      onChange([...entries, { ...draft }]);
    } else if (typeof editingIdx === "number") {
      onChange(entries.map((e, i) => (i === editingIdx ? { ...draft } : e)));
    }
    cancelEdit();
  };

  const removeEntry = (idx) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  const renderCuentaSelect = () => (
    <Select
      value={draft.cuenta || ""}
      onValueChange={(v) => setDraft({ ...draft, cuenta: v })}
    >
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder="Seleccione la cuenta contable">
          {draft.cuenta ? cuentaLabel(draft.cuenta) : "Seleccione la cuenta contable"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {cuentas.map(c => (
          <SelectItem key={c.id || c.cuenta} value={c.cuenta}>
            {c.cuenta} — {c.descripcion}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderTipoSelect = () => (
    <Select
      value={draft.tipo_planilla}
      onValueChange={(v) => setDraft({ ...draft, tipo_planilla: v })}
    >
      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        {TIPOS_PLANILLA.map(t => (
          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderDebeHaberSelect = () => (
    <Select
      value={draft.debe_haber}
      onValueChange={(v) => setDraft({ ...draft, debe_haber: v })}
    >
      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="D">Debe (Gasto)</SelectItem>
        <SelectItem value="H">Haber (Neto / Descuentos)</SelectItem>
      </SelectContent>
    </Select>
  );

  const isEditing = editingIdx !== null;

  const renderActions = (onSave, onCancel, saveDisabled) => (
    <div className="flex items-center justify-center gap-1">
      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={onSave} disabled={saveDisabled}>
        <Check className="w-4 h-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:bg-slate-100" onClick={onCancel}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {entries.length === 0 && !isEditing && (
        <div className="text-center py-8 text-sm text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          No hay cuentas contables configuradas. Haga clic en "Agregar Cuenta" para empezar.
        </div>
      )}

      {/* Datagrid */}
      {(entries.length > 0 || isEditing) && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Tipo de Planilla</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Cuenta Contable</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide w-40">Debe / Haber</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide w-32">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Fila de edición "nueva" al inicio */}
              {editingIdx === "new" && (
                <tr className="bg-indigo-50/50">
                  <td className="px-4 py-2.5">{renderTipoSelect()}</td>
                  <td className="px-4 py-2.5">{renderCuentaSelect()}</td>
                  <td className="px-4 py-2.5">{renderDebeHaberSelect()}</td>
                  <td className="px-4 py-2.5">{renderActions(saveDraft, cancelEdit, !draft.cuenta)}</td>
                </tr>
              )}
              {/* Filas existentes */}
              {entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  {editingIdx === idx ? (
                    <>
                      <td className="px-4 py-2.5">{renderTipoSelect()}</td>
                      <td className="px-4 py-2.5">{renderCuentaSelect()}</td>
                      <td className="px-4 py-2.5">{renderDebeHaberSelect()}</td>
                      <td className="px-4 py-2.5">{renderActions(saveDraft, cancelEdit, !draft.cuenta)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5">
                        <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">{tipoLabel(entry.tipo_planilla)}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-slate-700">{cuentaLabel(entry.cuenta)}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.debe_haber === "D" ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200">Debe (Gasto)</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 border-green-200">Haber (Neto / Descuentos)</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-indigo-600 hover:bg-indigo-50" onClick={() => startEdit(idx)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => removeEntry(idx)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Botón agregar */}
      {!isEditing && (
        <Button
          variant="outline"
          onClick={startAdd}
          className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          disabled={cuentas.length === 0}
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Cuenta Contable
        </Button>
      )}
    </div>
  );
}