import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, X, BookOpen, Star } from "lucide-react";
import SubdiarioSelect from "./SubdiarioSelect";

const TIPOS_PLANILLA = [
  { value: "Quincenal", label: "Quincenal" },
  { value: "Mensual", label: "Mensual" },
  { value: "Adicional", label: "Adicional" },
  { value: "SNP", label: "SNP (Honorarios)" },
  { value: "CTS", label: "CTS" },
  { value: "Gratificacion", label: "Gratificación" },
];

const tipoLabel = (v) => TIPOS_PLANILLA.find(t => t.value === v)?.label || v;

const tipoBadge = (tipo) => {
  const map = {
    Quincenal: "bg-blue-100 text-blue-700 border-blue-200",
    Mensual: "bg-green-100 text-green-700 border-green-200",
    Adicional: "bg-purple-100 text-purple-700 border-purple-200",
    SNP: "bg-orange-100 text-orange-700 border-orange-200",
    CTS: "bg-teal-100 text-teal-700 border-teal-200",
    Gratificacion: "bg-pink-100 text-pink-700 border-pink-200",
  };
  return map[tipo] || "bg-slate-100 text-slate-700 border-slate-200";
};

const DEFAULT_DRAFT = { payroll_type: "", subdiario: "", is_default: false };

/**
 * Datagrid CRUD de homologación de subdiarios por tipo de planilla.
 * Cada fila vincula un tipo de planilla con un código de subdiario contable.
 * Debe existir exactamente un registro con is_default=true como respaldo.
 *
 * Props:
 *  - value: array de { payroll_type, subdiario, is_default }
 *  - onChange: (newValue) => void
 *  - subdiarios: lista de Subdiario activos (catálogo maestro)
 */
export default function SubdiariosPlanillaSection({ value, onChange, subdiarios }) {
  const entries = Array.isArray(value) ? value : [];
  const [editingIdx, setEditingIdx] = useState(null); // null | "new" | number
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [dupError, setDupError] = useState("");

  const subdiarioLabel = (codigo) => {
    if (!codigo) return "—";
    const s = subdiarios.find(s => s.codigo === codigo);
    return s ? `${s.codigo} — ${s.nombre_breve || s.descripcion}` : codigo;
  };

  const startAdd = () => {
    setDraft(DEFAULT_DRAFT);
    setEditingIdx("new");
  };

  const startEdit = (idx) => {
    setDraft({ ...entries[idx] });
    setEditingIdx(idx);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setDraft(DEFAULT_DRAFT);
    setDupError("");
  };

  const isDuplicate = (candidate, excludeIdx) => {
    if (!candidate.payroll_type || candidate.is_default) return false;
    return entries.some((e, i) =>
      i !== excludeIdx &&
      !e.is_default &&
      String(e.payroll_type || "") === String(candidate.payroll_type || "")
    );
  };

  const saveDraft = () => {
    setDupError("");
    if (!draft.subdiario) return;
    // Si es default, no requiere payroll_type
    if (!draft.is_default && !draft.payroll_type) return;
    const excludeIdx = typeof editingIdx === "number" ? editingIdx : -1;
    if (isDuplicate(draft, excludeIdx)) {
      setDupError("Ya existe una fila para ese tipo de planilla.");
      return;
    }
    let next;
    if (editingIdx === "new") {
      next = [...entries, { ...draft }];
    } else if (typeof editingIdx === "number") {
      next = entries.map((e, i) => (i === editingIdx ? { ...draft } : e));
    } else {
      next = entries;
    }
    // Si este draft es default, limpiar is_default en los demás (sólo uno)
    if (draft.is_default) {
      next = next.map((e, i) => {
        const isTheOne = editingIdx === "new" ? e === next[next.length - 1] : i === editingIdx;
        return isTheOne ? { ...e, is_default: true } : { ...e, is_default: false };
      });
    }
    onChange(next);
    cancelEdit();
  };

  const removeEntry = (idx) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  const renderTipoSelect = () => (
    <Select
      value={draft.payroll_type}
      onValueChange={(v) => setDraft({ ...draft, payroll_type: v })}
      disabled={draft.is_default}
    >
      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccione el tipo" /></SelectTrigger>
      <SelectContent>
        {TIPOS_PLANILLA.map(t => (
          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderSubdiarioSelect = () => (
    <SubdiarioSelect
      value={draft.subdiario || ""}
      onValueChange={(v) => setDraft({ ...draft, subdiario: v })}
      subdiarios={subdiarios}
    />
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

  const canSave = !draft.subdiario || (!draft.is_default && !draft.payroll_type);

  return (
    <div className="space-y-4">
      {dupError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {dupError}
        </div>
      )}
      {entries.length === 0 && !isEditing && (
        <div className="text-center py-8 text-sm text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          No hay subdiarios configurados. Haga clic en "Agregar Subdiario" para empezar.
        </div>
      )}

      {(entries.length > 0 || isEditing) && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide w-44">Tipo de Planilla</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Subdiario</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide w-24">Default</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {editingIdx === "new" && (
                <tr className="bg-indigo-50/50">
                  <td className="px-3 py-2.5">{renderTipoSelect()}</td>
                  <td className="px-3 py-2.5">{renderSubdiarioSelect()}</td>
                  <td className="px-3 py-2.5 text-center">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!draft.is_default}
                        onChange={e => setDraft({ ...draft, is_default: e.target.checked, payroll_type: e.target.checked ? "" : draft.payroll_type })}
                        className="rounded border-slate-300"
                      />
                    </label>
                  </td>
                  <td className="px-3 py-2.5">{renderActions(saveDraft, cancelEdit, canSave)}</td>
                </tr>
              )}
              {entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  {editingIdx === idx ? (
                    <>
                      <td className="px-3 py-2.5">{renderTipoSelect()}</td>
                      <td className="px-3 py-2.5">{renderSubdiarioSelect()}</td>
                      <td className="px-3 py-2.5 text-center">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!draft.is_default}
                            onChange={e => setDraft({ ...draft, is_default: e.target.checked, payroll_type: e.target.checked ? "" : draft.payroll_type })}
                            className="rounded border-slate-300"
                          />
                        </label>
                      </td>
                      <td className="px-3 py-2.5">{renderActions(saveDraft, cancelEdit, canSave)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5">
                        {entry.is_default ? (
                          <Badge className="bg-slate-100 text-slate-600 border-slate-200">
                            <Star className="w-3 h-3 mr-1" />Default (otros)
                          </Badge>
                        ) : (
                          <Badge className={tipoBadge(entry.payroll_type)}>{tipoLabel(entry.payroll_type)}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-slate-700">{subdiarioLabel(entry.subdiario)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {entry.is_default && <Star className="w-4 h-4 text-amber-500 inline" />}
                      </td>
                      <td className="px-3 py-2.5">
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

      {!isEditing && (
        <Button
          variant="outline"
          onClick={startAdd}
          className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          disabled={subdiarios.length === 0}
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Subdiario
        </Button>
      )}
    </div>
  );
}