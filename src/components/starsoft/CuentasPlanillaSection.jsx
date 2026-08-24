import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, X, BookOpen } from "lucide-react";
import CuentaContableSelect from "./CuentaContableSelect";

const CATEGORIAS = [
  { value: "Ingreso", label: "Ingreso" },
  { value: "Descuento", label: "Descuento" },
  { value: "Aportación", label: "Aportación" },
  { value: "Neto", label: "Neto a pagar" },
];

const catLabel = (v) => CATEGORIAS.find(c => c.value === v)?.label || v;

const catBadge = (cat) => {
  const map = {
    Ingreso: "bg-blue-100 text-blue-700 border-blue-200",
    Descuento: "bg-red-100 text-red-700 border-red-200",
    Aportación: "bg-purple-100 text-purple-700 border-purple-200",
    Neto: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  return map[cat] || "bg-slate-100 text-slate-700 border-slate-200";
};

const DEFAULT_DRAFT = { codigo_plame: "", concepto: "", categoria: "Ingreso", cuenta: "", debe_haber: "D" };

/**
 * Datagrid CRUD de homologación de cuentas por concepto PLAME.
 * Cada fila vincula un concepto (código PLAME + nombre) con una cuenta contable
 * y su lado (Debe o Haber). Reemplaza la anterior configuración por tipo de contrato
 * y permite configurar ingresos, descuentos, aportaciones del empleador y neto a pagar.
 *
 * Props:
 *  - value: array de { codigo_plame, concepto, categoria, cuenta, debe_haber }
 *  - onChange: (newValue) => void
 *  - cuentas: lista de CuentaContable activas
 */
export default function CuentasPlanillaSection({ value, onChange, cuentas }) {
  const entries = Array.isArray(value) ? value : [];
  const [editingIdx, setEditingIdx] = useState(null); // null | "new" | number
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [dupError, setDupError] = useState("");

  const cuentaLabel = (codigo) => {
    if (!codigo) return "—";
    const c = cuentas.find(c => c.cuenta === codigo);
    return c ? `${c.cuenta} — ${c.descripcion}` : codigo;
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
  };

  const isDuplicate = (candidate, excludeIdx) => {
    return entries.some((e, i) =>
      i !== excludeIdx &&
      String(e.codigo_plame || "") === String(candidate.codigo_plame || "") &&
      String(e.cuenta) === String(candidate.cuenta) &&
      e.debe_haber === candidate.debe_haber
    );
  };

  const saveDraft = () => {
    setDupError("");
    if (!draft.codigo_plame || !draft.concepto || !draft.cuenta || !draft.debe_haber || !draft.categoria) return;
    const excludeIdx = typeof editingIdx === "number" ? editingIdx : -1;
    if (isDuplicate(draft, excludeIdx)) {
      setDupError("Ya existe una fila con el mismo código PLAME, cuenta y debe/haber.");
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
    <CuentaContableSelect
      value={draft.cuenta || ""}
      onValueChange={(v) => setDraft({ ...draft, cuenta: v })}
      cuentas={cuentas}
    />
  );

  const renderCategoriaSelect = () => (
    <Select
      value={draft.categoria}
      onValueChange={(v) => {
        // Sugerir lado por defecto según categoría (Ingreso/Aportación → D, Descuento/Neto → H)
        const lado = (v === "Ingreso" || v === "Aportación") ? "D" : "H";
        setDraft({ ...draft, categoria: v, debe_haber: lado });
      }}
    >
      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        {CATEGORIAS.map(c => (
          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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
        <SelectItem value="D">Debe</SelectItem>
        <SelectItem value="H">Haber</SelectItem>
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

  const canSave = !draft.cuenta || !draft.codigo_plame || !draft.concepto;

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
          No hay conceptos homologados. Haga clic en "Agregar Concepto" para empezar.
        </div>
      )}

      {(entries.length > 0 || isEditing) && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide w-28">Código PLAME</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Concepto</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide w-36">Categoría</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Cuenta Contable</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide w-28">Debe / Haber</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {editingIdx === "new" && (
                <tr className="bg-indigo-50/50">
                  <td className="px-3 py-2.5">
                    <Input
                      value={draft.codigo_plame}
                      onChange={e => setDraft({ ...draft, codigo_plame: e.target.value })}
                      placeholder="0121"
                      className="h-9 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <Input
                      value={draft.concepto}
                      onChange={e => setDraft({ ...draft, concepto: e.target.value })}
                      placeholder="Remuneración básica"
                      className="h-9 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2.5">{renderCategoriaSelect()}</td>
                  <td className="px-3 py-2.5">{renderCuentaSelect()}</td>
                  <td className="px-3 py-2.5">{renderDebeHaberSelect()}</td>
                  <td className="px-3 py-2.5">{renderActions(saveDraft, cancelEdit, canSave)}</td>
                </tr>
              )}
              {entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  {editingIdx === idx ? (
                    <>
                      <td className="px-3 py-2.5">
                        <Input value={draft.codigo_plame} onChange={e => setDraft({ ...draft, codigo_plame: e.target.value })} className="h-9 text-sm" />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input value={draft.concepto} onChange={e => setDraft({ ...draft, concepto: e.target.value })} className="h-9 text-sm" />
                      </td>
                      <td className="px-3 py-2.5">{renderCategoriaSelect()}</td>
                      <td className="px-3 py-2.5">{renderCuentaSelect()}</td>
                      <td className="px-3 py-2.5">{renderDebeHaberSelect()}</td>
                      <td className="px-3 py-2.5">{renderActions(saveDraft, cancelEdit, canSave)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs font-semibold text-slate-700">{entry.codigo_plame}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-slate-700">{entry.concepto}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className={catBadge(entry.categoria)}>{catLabel(entry.categoria)}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-slate-700">{cuentaLabel(entry.cuenta)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {entry.debe_haber === "D" ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200">Debe</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 border-green-200">Haber</Badge>
                        )}
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
          disabled={cuentas.length === 0}
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Concepto
        </Button>
      )}
    </div>
  );
}