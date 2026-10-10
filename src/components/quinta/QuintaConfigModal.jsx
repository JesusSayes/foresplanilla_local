import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

export default function QuintaConfigModal({ initialData, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    uit_amount: "",
    annual_deduction_uit: 7,
    tax_brackets: [
      { from_uit: 0, to_uit: 5, rate: 8, deduction: 0 },
      { from_uit: 5, to_uit: 20, rate: 14, deduction: 0.3 },
      { from_uit: 20, to_uit: 35, rate: 17, deduction: 0.9 },
      { from_uit: 35, to_uit: 45, rate: 20, deduction: 1.95 },
      { from_uit: 45, to_uit: 999, rate: 30, deduction: 6.45 },
    ],
    is_active: true,
    notes: "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        year: initialData.year || new Date().getFullYear(),
        uit_amount: initialData.uit_amount || "",
        annual_deduction_uit: initialData.annual_deduction_uit ?? 7,
        tax_brackets: initialData.tax_brackets?.length > 0
          ? initialData.tax_brackets
          : formData.tax_brackets,
        is_active: initialData.is_active ?? true,
        notes: initialData.notes || "",
      });
    }
  }, [initialData]);

  const handleBracketChange = (idx, field, value) => {
    const updated = [...formData.tax_brackets];
    updated[idx] = { ...updated[idx], [field]: value === "" ? "" : Number(value) };
    setFormData({ ...formData, tax_brackets: updated });
  };

  const addBracket = () => {
    setFormData({
      ...formData,
      tax_brackets: [...formData.tax_brackets, { from_uit: 0, to_uit: 0, rate: 0, deduction: 0 }],
    });
  };

  const removeBracket = (idx) => {
    setFormData({
      ...formData,
      tax_brackets: formData.tax_brackets.filter((_, i) => i !== idx),
    });
  };

  const handleSubmit = () => {
    if (!formData.uit_amount || formData.uit_amount <= 0) {
      return;
    }
    onSave({
      ...formData,
      year: Number(formData.year),
      uit_amount: Number(formData.uit_amount),
      annual_deduction_uit: Number(formData.annual_deduction_uit),
      tax_brackets: formData.tax_brackets.map(b => ({
        from_uit: Number(b.from_uit) || 0,
        to_uit: Number(b.to_uit) || 0,
        rate: Number(b.rate) || 0,
        deduction: Number(b.deduction) || 0,
      })),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onCancel}>
      <Card className="max-w-2xl w-full my-8" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">
              {initialData ? "Editar Configuración" : "Nueva Configuración de Quinta Categoría"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Ejercicio (Año) *</Label>
              <Input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
              />
            </div>
            <div>
              <Label>UIT (S/) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.uit_amount}
                onChange={(e) => setFormData({ ...formData, uit_amount: e.target.value })}
                placeholder="Ej: 5350"
              />
            </div>
            <div>
              <Label>N° UIT Deducción</Label>
              <Input
                type="number"
                step="1"
                value={formData.annual_deduction_uit}
                onChange={(e) => setFormData({ ...formData, annual_deduction_uit: e.target.value })}
                placeholder="7"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Escalas Progresivas (Tramos en UIT)</Label>
              <Button size="sm" variant="outline" onClick={addBracket}>
                <Plus className="w-3 h-3 mr-1" /> Agregar Tramo
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {formData.tax_brackets.map((bracket, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 items-end p-2 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="text-xs">Desde UIT</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={bracket.from_uit}
                      onChange={(e) => handleBracketChange(idx, "from_uit", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Hasta UIT</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={bracket.to_uit}
                      onChange={(e) => handleBracketChange(idx, "to_uit", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Tasa (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={bracket.rate}
                      onChange={(e) => handleBracketChange(idx, "rate", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Deducción (UIT)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={bracket.deduction}
                      onChange={(e) => handleBracketChange(idx, "deduction", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 h-8 w-8"
                    onClick={() => removeBracket(idx)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Escalas estándar 2024: hasta 5 UIT = 8%, 5-20 UIT = 14%, 20-35 UIT = 17%, 35-45 UIT = 20%, más de 45 UIT = 30%.
              Verifique con Contabilidad antes de modificar.
            </p>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Observaciones sobre la configuración tributaria..."
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
            <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={handleSubmit}>
              {initialData ? "Actualizar" : "Guardar Configuración"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}