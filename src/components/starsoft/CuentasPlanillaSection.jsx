import React from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/**
 * Sección de configuración de cuentas contables (debe/haber) para un tipo de planilla.
 * Las cuentas se seleccionan desde la tabla Cuentas Contables (Datos Maestros).
 *
 * Props:
 *  - titulo: nombre del tipo de planilla (ej: "Planilla de Remuneraciones (Plazo Fijo)")
 *  - descripcion: subtítulo descriptivo
 *  - value: { cuenta_debe, cuenta_haber_neto, cuenta_haber_descuentos }
 *  - onChange: (newValue) => void
 *  - cuentas: lista de CuentaContable activas
 */
export default function CuentasPlanillaSection({ titulo, descripcion, value, onChange, cuentas }) {
  const update = (field, cuentaCodigo) => {
    onChange({ ...value, [field]: cuentaCodigo });
  };

  const renderSelect = (field, placeholder) => {
    const selected = cuentas.find(c => c.cuenta === value[field]);
    return (
      <Select
        value={value[field] || ""}
        onValueChange={(v) => update(field, v === "__none__" ? "" : v)}
      >
        <SelectTrigger className="mt-1.5">
          <SelectValue placeholder={placeholder}>
            {selected ? `${selected.cuenta} — ${selected.descripcion}` : placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Sin configurar —</SelectItem>
          {cuentas.map((c) => (
            <SelectItem key={c.id || c.cuenta} value={c.cuenta}>
              {c.cuenta} — {c.descripcion}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-900 text-sm">{titulo}</p>
          <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <Badge className="bg-red-100 text-red-700 border-red-200">DEBE</Badge>
            Cuenta (Gasto)
          </Label>
          {renderSelect("cuenta_debe", "Cuenta del debe")}
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <Badge className="bg-green-100 text-green-700 border-green-200">HABER</Badge>
            Cuenta Neto a Pagar
          </Label>
          {renderSelect("cuenta_haber_neto", "Cuenta del haber (neto)")}
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <Badge className="bg-green-100 text-green-700 border-green-200">HABER</Badge>
            Cuenta Descuentos/Tributos
          </Label>
          {renderSelect("cuenta_haber_descuentos", "Cuenta del haber (descuentos)")}
        </div>
      </div>
    </div>
  );
}