import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import EmployeeSearchSelect from "@/components/employees/EmployeeSearchSelect";

export default function VentaForm({ initialData, employees, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    employee_id: "",
    vacation_period_origin: "",
    days_sold: "",
    amount: "",
    sale_date: format(new Date(), "yyyy-MM-dd"),
    payment_period_month: new Date().getMonth() + 1,
    payment_period_year: new Date().getFullYear(),
    payroll_type: "Mensual",
    reason: "",
    notes: "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        employee_id: initialData.employee_id || "",
        vacation_period_origin: initialData.vacation_period_origin || "",
        days_sold: initialData.days_sold?.toString() || "",
        amount: initialData.amount?.toString() || "",
        sale_date: initialData.sale_date ? initialData.sale_date.split("T")[0] : format(new Date(), "yyyy-MM-dd"),
        payment_period_month: initialData.payment_period_month || new Date().getMonth() + 1,
        payment_period_year: initialData.payment_period_year || new Date().getFullYear(),
        payroll_type: initialData.payroll_type || "Mensual",
        reason: initialData.reason || "",
        notes: initialData.notes || "",
      });
    }
  }, [initialData]);

  const handleSubmit = () => {
    if (!formData.employee_id || !formData.days_sold || !formData.amount) return;
    onSave({
      ...formData,
      days_sold: Number(formData.days_sold),
      amount: Number(formData.amount),
      payment_period_month: Number(formData.payment_period_month),
      payment_period_year: Number(formData.payment_period_year),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onCancel}>
      <Card className="max-w-lg w-full my-8" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">
              {initialData ? "Editar Venta" : "Nueva Venta de Vacaciones"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              Los días e importe se registran manualmente y deben ser validados por RR. HH.
              El sistema no calcula automáticamente el monto ni modifica saldos de vacaciones hasta su aprobación.
            </p>
          </div>

          <div>
            <Label>Empleado *</Label>
            <EmployeeSearchSelect
              employees={employees}
              value={formData.employee_id}
              onValueChange={(v) => setFormData({ ...formData, employee_id: v })}
              placeholder="Buscar empleado..."
            />
          </div>

          <div>
            <Label>Período Vacacional de Origen *</Label>
            <Input
              value={formData.vacation_period_origin}
              onChange={(e) => setFormData({ ...formData, vacation_period_origin: e.target.value })}
              placeholder="Ej: 2025, Ene-Mar 2025"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Días Vendidos *</Label>
              <Input
                type="number"
                step="0.5"
                value={formData.days_sold}
                onChange={(e) => setFormData({ ...formData, days_sold: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Importe (S/) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Fecha de Venta *</Label>
              <Input
                type="date"
                value={formData.sale_date}
                onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Mes de Pago *</Label>
              <Select
                value={formData.payment_period_month?.toString()}
                onValueChange={(v) => setFormData({ ...formData, payment_period_month: Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={m.toString()}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Año de Pago *</Label>
              <Input
                type="number"
                value={formData.payment_period_year}
                onChange={(e) => setFormData({ ...formData, payment_period_year: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Tipo de Planilla</Label>
            <Select
              value={formData.payroll_type}
              onValueChange={(v) => setFormData({ ...formData, payroll_type: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Mensual">Mensual</SelectItem>
                <SelectItem value="Adicional">Adicional</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Motivo</Label>
            <Textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Motivo de la venta de vacaciones..."
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
              {initialData ? "Actualizar" : "Registrar Venta"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}