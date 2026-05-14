import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Square, X, Plus } from "lucide-react";

const REPORT_COLUMNS = {
  employees: [
    { id: "employee_code", label: "Código" },
    { id: "full_name", label: "Nombre Completo" },
    { id: "document_number", label: "DNI" },
    { id: "position", label: "Cargo" },
    { id: "department_name", label: "Departamento" },
    { id: "site", label: "Sede" },
    { id: "hire_date", label: "Fecha Ingreso" },
    { id: "contract_type", label: "Tipo Contrato" },
    { id: "base_salary", label: "Salario Base" },
    { id: "status", label: "Estado" },
    { id: "work_email", label: "Email Corporativo" },
    { id: "mobile", label: "Celular" },
  ],
  attendance: [
    { id: "employee_name", label: "Empleado" },
    { id: "date", label: "Fecha" },
    { id: "clock_in", label: "Entrada" },
    { id: "clock_out", label: "Salida" },
    { id: "worked_hours", label: "Horas Trabajadas" },
    { id: "is_late", label: "Tardanza" },
    { id: "late_minutes", label: "Minutos Tarde" },
    { id: "status", label: "Estado" },
  ],
  vacations: [
    { id: "employee_name", label: "Empleado" },
    { id: "request_type", label: "Tipo Solicitud" },
    { id: "start_date", label: "Fecha Inicio" },
    { id: "end_date", label: "Fecha Fin" },
    { id: "total_days", label: "Total Días" },
    { id: "status", label: "Estado" },
    { id: "approved_by", label: "Aprobado Por" },
    { id: "reason", label: "Motivo" },
  ],
  payroll: [
    { id: "employee_name", label: "Empleado" },
    { id: "period", label: "Período" },
    { id: "payroll_type", label: "Tipo Planilla" },
    { id: "base_salary", label: "Salario Base" },
    { id: "total_income", label: "Total Ingresos" },
    { id: "total_deductions", label: "Total Descuentos" },
    { id: "net_pay", label: "Neto a Pagar" },
    { id: "status", label: "Estado" },
  ],
  contracts: [
    { id: "employee_name", label: "Empleado" },
    { id: "contract_number", label: "Nº Contrato" },
    { id: "contract_type", label: "Tipo Contrato" },
    { id: "position", label: "Cargo" },
    { id: "department", label: "Departamento" },
    { id: "start_date", label: "Fecha Inicio" },
    { id: "end_date", label: "Fecha Fin" },
    { id: "salary", label: "Remuneración" },
    { id: "status", label: "Estado" },
    { id: "work_location", label: "Lugar de Trabajo" },
    { id: "renewable", label: "Renovable" },
    { id: "is_digitally_signed", label: "Firmado Digitalmente" },
  ],
};

export default function ReportBuilder({ reportType, config, onChange }) {
  const [filters, setFilters] = useState(config?.filters || {});
  const [selectedColumns, setSelectedColumns] = useState(config?.columns || []);
  const [sortBy, setSortBy] = useState(config?.sort_by || "");
  const [sortOrder, setSortOrder] = useState(config?.sort_order || "asc");

  const availableColumns = REPORT_COLUMNS[reportType] || [];

  const toggleColumn = (columnId) => {
    const newColumns = selectedColumns.includes(columnId)
      ? selectedColumns.filter(c => c !== columnId)
      : [...selectedColumns, columnId];
    
    setSelectedColumns(newColumns);
    updateConfig({ columns: newColumns });
  };

  const addFilter = (field, operator, value) => {
    const newFilters = { ...filters, [field]: { operator, value } };
    setFilters(newFilters);
    updateConfig({ filters: newFilters });
  };

  const removeFilter = (field) => {
    const newFilters = { ...filters };
    delete newFilters[field];
    setFilters(newFilters);
    updateConfig({ filters: newFilters });
  };

  const updateConfig = (updates) => {
    onChange({
      filters,
      columns: selectedColumns,
      sort_by: sortBy,
      sort_order: sortOrder,
      ...updates,
    });
  };

  return (
    <div className="space-y-6">
      {/* Column Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Seleccionar Columnas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {availableColumns.map(col => (
              <button
                key={col.id}
                onClick={() => toggleColumn(col.id)}
                className={`flex items-center gap-2 p-2 rounded border transition-colors text-sm ${
                  selectedColumns.includes(col.id)
                    ? "bg-indigo-50 border-indigo-500"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                {selectedColumns.includes(col.id) ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
                <span className="truncate">{col.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            {selectedColumns.length} columnas seleccionadas
          </p>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(filters).map(([field, filter]) => (
              <Badge key={field} className="bg-blue-100 text-blue-700 pr-1">
                {field}: {filter.operator} {filter.value}
                <button
                  onClick={() => removeFilter(field)}
                  className="ml-2 hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>

          <FilterBuilder
            availableColumns={availableColumns}
            onAddFilter={addFilter}
          />
        </CardContent>
      </Card>

      {/* Sorting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ordenamiento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ordenar Por</Label>
              <Select value={sortBy} onValueChange={(v) => { setSortBy(v); updateConfig({ sort_by: v }); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar columna" />
                </SelectTrigger>
                <SelectContent>
                  {availableColumns.map(col => (
                    <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Orden</Label>
              <Select value={sortOrder} onValueChange={(v) => { setSortOrder(v); updateConfig({ sort_order: v }); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascendente</SelectItem>
                  <SelectItem value="desc">Descendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterBuilder({ availableColumns, onAddFilter }) {
  const [field, setField] = useState("");
  const [operator, setOperator] = useState("equals");
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (field && value) {
      onAddFilter(field, operator, value);
      setField("");
      setValue("");
    }
  };

  return (
    <div className="grid grid-cols-12 gap-2">
      <div className="col-span-4">
        <Select value={field} onValueChange={setField}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Campo" />
          </SelectTrigger>
          <SelectContent>
            {availableColumns.map(col => (
              <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-3">
        <Select value={operator} onValueChange={setOperator}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">Igual a</SelectItem>
            <SelectItem value="contains">Contiene</SelectItem>
            <SelectItem value="greater">Mayor que</SelectItem>
            <SelectItem value="less">Menor que</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-4">
        <Input
          placeholder="Valor"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9"
        />
      </div>
      <div className="col-span-1">
        <Button size="sm" onClick={handleAdd} className="h-9 w-full p-0">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}