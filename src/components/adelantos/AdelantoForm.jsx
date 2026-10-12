import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import EmployeeSearchSelect from "@/components/employees/EmployeeSearchSelect";

export default function AdelantoForm({ initialData, employees, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    employee_id: "",
    amount: "",
    advance_date: format(new Date(), "yyyy-MM-dd"),
    gratification_period: "Julio",
    gratification_year: new Date().getFullYear(),
    apply_to_gratification: true,
    reason: "",
    notes: "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        employee_id: initialData.employee_id || "",
        amount: initialData.amount?.toString() || "",
        advance_date: initialData.advance_date ? initialData.advance_date.split("T")[0] : format(new Date(), "yyyy-MM-dd"),
        gratification_period: initialData.gratification_period || "Julio",
        gratification_year: initialData.gratification_year || new Date().getFullYear(),
        apply_to_gratification: initialData.apply_to_gratification ?? true,
        reason: initialData.reason || "",
        notes: initialData.notes || "",
      });
    }
  }, [initialData]);

  const handleSubmit = () => {
    if (!formData.employee_id || !formData.amount) return;
    onSave({
      ...formData,
      amount: Number(formData.amount),
      gratification_year: Number(formData.gratification_year),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onCancel}>
      <Card className="max-w-lg w-full my-8" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">
              {initialData ? "Editar Adelanto" : "Nuevo Adelanto de Gratificación"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div>
            <Label>Empleado *</Label>
            <EmployeeSearchSelect
              employees={employees}
              value={formData.employee_id}
              onValueChange={(v) => setFormData({ ...formData, employee_id: v })}
              placeholder="Buscar empleado..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Monto del Adelanto (S/) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Fecha del Adelanto *</Label>
              <Input
                type="date"
                value={formData.advance_date}
                onChange={(e) => setFormData({ ...formData, advance_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Gratificación de Destino *</Label>
              <Select
                value={formData.gratification_period}
                onValueChange={(v) => setFormData({ ...formData, gratification_period: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Julio">Julio (Fiestas Patrias)</SelectItem>
                  <SelectItem value="Diciembre">Diciembre (Navidad)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Año de Gratificación *</Label>
              <Input
                type="number"
                value={formData.gratification_year}
                onChange={(e) => setFormData({ ...formData, gratification_year: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-lg">
            <input
              type="checkbox"
              id="applyToGrat"
              checked={formData.apply_to_gratification}
              onChange={(e) => setFormData({ ...formData, apply_to_gratification: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <Label htmlFor="applyToGrat" className="text-sm text-indigo-700 cursor-pointer">
              Registrar este adelanto para descontarlo de la gratificación correspondiente
            </Label>
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            El descuento debe incorporarse manualmente a la gratificación; esta opción registra la intención de aplicarlo.
          </p>

          <div>
            <Label>Motivo</Label>
            <Textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Motivo del adelanto..."
              rows={2}
            />
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas adicionales..."
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
            <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={handleSubmit}>
              {initialData ? "Actualizar" : "Registrar Adelanto"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}