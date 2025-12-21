import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

export default function ConceptsManager({ 
  employeeId, 
  employeeName, 
  month, 
  year, 
  concepts = [], 
  onAdd, 
  onRemove 
}) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    concept_type: "Ingreso",
    concept_name: "",
    amount: "",
    is_recurring: false,
    notes: "",
  });

  const handleSubmit = () => {
    if (!formData.concept_name || !formData.amount) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    const conceptData = {
      employee_id: employeeId,
      concept_type: formData.concept_type,
      concept_name: formData.concept_name,
      amount: parseFloat(formData.amount),
      period: `${month}/${year}`,
      month: month,
      year: year,
      is_recurring: formData.is_recurring,
      is_applied: false,
      notes: formData.notes,
    };

    onAdd(conceptData);
    setFormData({
      concept_type: "Ingreso",
      concept_name: "",
      amount: "",
      is_recurring: false,
      notes: "",
    });
    setShowForm(false);
    toast.success("Concepto agregado");
  };

  const employeeConcepts = concepts.filter(c => c.employee_id === employeeId);

  const totalIngresos = employeeConcepts
    .filter(c => c.concept_type === "Ingreso")
    .reduce((sum, c) => sum + c.amount, 0);

  const totalDescuentos = employeeConcepts
    .filter(c => c.concept_type === "Descuento" || c.concept_type === "Aportación")
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Conceptos Adicionales</CardTitle>
            <p className="text-sm text-slate-600 mt-1">{employeeName}</p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            variant={showForm ? "outline" : "default"}
          >
            <Plus className="w-4 h-4 mr-2" />
            {showForm ? "Cancelar" : "Agregar"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={formData.concept_type} onValueChange={(v) => setFormData({...formData, concept_type: v})}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ingreso">Ingreso Adicional</SelectItem>
                    <SelectItem value="Descuento">Descuento</SelectItem>
                    <SelectItem value="Aportación">Aportación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Monto (S/)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  className="h-9"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Concepto</Label>
              <Input
                value={formData.concept_name}
                onChange={(e) => setFormData({...formData, concept_name: e.target.value})}
                className="h-9"
                placeholder="Ej: Bono productividad, Préstamo"
              />
            </div>
            <div>
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                className="h-16 text-sm"
                placeholder="Detalles adicionales..."
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`recurring-${employeeId}`}
                checked={formData.is_recurring}
                onChange={(e) => setFormData({...formData, is_recurring: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <label htmlFor={`recurring-${employeeId}`} className="text-xs text-slate-600">
                Aplicar automáticamente todos los meses
              </label>
            </div>
            <Button onClick={handleSubmit} size="sm" className="w-full">
              Agregar Concepto
            </Button>
          </div>
        )}

        {employeeConcepts.length > 0 ? (
          <div className="space-y-2">
            {employeeConcepts.map((concept, idx) => (
              <div key={idx} className="flex items-start justify-between p-3 bg-white border border-slate-200 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {concept.concept_type === "Ingreso" ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    )}
                    <span className="font-semibold text-slate-900 text-sm">
                      {concept.concept_name}
                    </span>
                    <Badge 
                      className={
                        concept.concept_type === "Ingreso" 
                          ? "bg-green-100 text-green-700" 
                          : "bg-red-100 text-red-700"
                      }
                    >
                      {concept.concept_type}
                    </Badge>
                  </div>
                  <p className={`font-bold text-sm ${
                    concept.concept_type === "Ingreso" ? "text-green-600" : "text-red-600"
                  }`}>
                    S/ {concept.amount.toFixed(2)}
                  </p>
                  {concept.notes && (
                    <p className="text-xs text-slate-600 mt-1">{concept.notes}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(idx)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}

            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Total Ingresos Adicionales:</span>
                <span className="font-bold text-green-600">+S/ {totalIngresos.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total Descuentos/Aportaciones:</span>
                <span className="font-bold text-red-600">-S/ {totalDescuentos.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500 text-sm">
            No hay conceptos adicionales
          </div>
        )}
      </CardContent>
    </Card>
  );
}