import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

const TIPOS_PLANILLA = [
  { value: "regular", label: "Planilla de Remuneraciones (Plazo Fijo)" },
  { value: "snp", label: "Servicios No Personales (Honorarios / SNP)" },
];

const USOS = [
  { value: "gasto", label: "Gasto / Egreso", debe_haber: "D" },
  { value: "neto", label: "Neto a Pagar", debe_haber: "H" },
  { value: "descuentos", label: "Descuentos / Tributos", debe_haber: "H" },
];

/**
 * Editor de lista flexible de cuentas contables por tipo de planilla.
 * El usuario agrega entradas indicando: tipo de planilla, cuenta contable,
 * debe/haber y uso (gasto, neto, descuentos).
 *
 * Props:
 *  - value: array de entradas [{ tipo_planilla, cuenta, debe_haber, uso }]
 *  - onChange: (newValue) => void
 *  - cuentas: lista de CuentaContable activas
 */
export default function CuentasPlanillaSection({ value, onChange, cuentas }) {
  const entries = Array.isArray(value) ? value : [];

  const addEntry = () => {
    onChange([...entries, { tipo_planilla: "regular", cuenta: "", debe_haber: "D", uso: "gasto" }]);
  };

  const updateEntry = (idx, field, val) => {
    const next = entries.map((e, i) => (i === idx ? { ...e, [field]: val } : e));
    // Si cambia debe_haber, ajustar el uso para que sea coherente
    if (field === "debe_haber") {
      if (val === "D") next[idx].uso = "gasto";
      else if (val === "H" && next[idx].uso === "gasto") next[idx].uso = "neto";
    }
    // Si cambia uso, ajustar debe_haber según el uso
    if (field === "uso") {
      const uso = USOS.find(u => u.value === val);
      if (uso) next[idx].debe_haber = uso.debe_haber;
    }
    onChange(next);
  };

  const removeEntry = (idx) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  const cuentaLabel = (codigo) => {
    const c = cuentas.find(c => c.cuenta === codigo);
    return c ? `${c.cuenta} — ${c.descripcion}` : (codigo || "—");
  };

  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <div className="text-center py-6 text-sm text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          No hay cuentas contables configuradas. Haga clic en "Agregar Cuenta" para empezar.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const usosDisponibles = entry.debe_haber === "D"
              ? USOS.filter(u => u.debe_haber === "D")
              : USOS.filter(u => u.debe_haber === "H");
            return (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 rounded-lg bg-white border border-slate-200">
                {/* Tipo de planilla */}
                <div className="md:col-span-3">
                  <Label className="text-[11px] font-semibold text-slate-500 uppercase">Tipo de Planilla</Label>
                  <Select
                    value={entry.tipo_planilla}
                    onValueChange={(v) => updateEntry(idx, "tipo_planilla", v)}
                  >
                    <SelectTrigger className="mt-1 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_PLANILLA.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Cuenta contable */}
                <div className="md:col-span-4">
                  <Label className="text-[11px] font-semibold text-slate-500 uppercase">Cuenta Contable</Label>
                  <Select
                    value={entry.cuenta || ""}
                    onValueChange={(v) => updateEntry(idx, "cuenta", v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="mt-1 h-9 text-sm">
                      <SelectValue placeholder="Seleccione la cuenta">
                        {entry.cuenta ? cuentaLabel(entry.cuenta) : "Seleccione la cuenta"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sin configurar —</SelectItem>
                      {cuentas.map(c => (
                        <SelectItem key={c.id || c.cuenta} value={c.cuenta}>
                          {c.cuenta} — {c.descripcion}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Debe / Haber */}
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-semibold text-slate-500 uppercase">Debe / Haber</Label>
                  <Select
                    value={entry.debe_haber}
                    onValueChange={(v) => updateEntry(idx, "debe_haber", v)}
                  >
                    <SelectTrigger className="mt-1 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="D">Debe (D)</SelectItem>
                      <SelectItem value="H">Haber (H)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Uso */}
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-semibold text-slate-500 uppercase">Uso</Label>
                  <Select
                    value={entry.uso}
                    onValueChange={(v) => updateEntry(idx, "uso", v)}
                  >
                    <SelectTrigger className="mt-1 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {usosDisponibles.map(u => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Eliminar */}
                <div className="md:col-span-1 flex justify-end">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => removeEntry(idx)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        variant="outline"
        onClick={addEntry}
        className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
        disabled={cuentas.length === 0}
      >
        <Plus className="w-4 h-4 mr-2" />
        Agregar Cuenta
      </Button>
    </div>
  );
}