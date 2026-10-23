import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import jsPDF from "jspdf";
import { safePayrollNumber } from "@/lib/payrollUtils";
import { exportPayslipsToExcel } from "@/lib/payrollExcelExport";
import {
  generatePayslipPDF,
  generateMassivePayslipsPDF,
} from "@/lib/payrollPdfExport";

/**
 * Histórico de planillas: agrupa TODAS las boletas por año-mes-tipo (sin
 * deduplicar) y permite exportarlas, imprimirlas o eliminar el grupo.
 */
export default function PayrollHistoryTab({
  allPayslips = [],
  allEmployees = [],
  canViewAmounts,
  selectedPayrollToDelete,
  onSelectPayrollToDelete,
  onDeletePayroll,
  searchTerm,
  onSearchTermChange,
  yearFilter,
  onYearFilterChange,
  monthFilter,
  onMonthFilterChange,
  typeFilter,
  onTypeFilterChange,
}) {
  // Agrupa TODAS las boletas por año-mes-tipo (sin deduplicar a una por grupo).
  const getAllPayslipsByMonth = () => {
    const grouped = {};
    allPayslips.forEach((p) => {
      const key = `${p.year}-${p.month}-${p.payroll_type}`;
      if (!grouped[key]) {
        grouped[key] = {
          year: p.year,
          month: p.month,
          payroll_type: p.payroll_type,
          payslips: [],
        };
      }
      grouped[key].payslips.push(p);
    });
    return Object.values(grouped);
  };

  const allGroups = getAllPayslipsByMonth();
  const filteredGroups = allGroups.filter(g =>
    Number(g.year) === Number(yearFilter) &&
    (monthFilter === "all" || Number(g.month) === Number(monthFilter)) &&
    (typeFilter === "all" || g.payroll_type === typeFilter)
  ).map(g => ({ ...g, payslips: g.payslips.filter(p => {
    if (!searchTerm.trim()) return true;
    const emp = allEmployees.find(e => e.id === p.employee_id);
    const search = searchTerm.trim().toLowerCase();
    return emp && [emp.first_name, emp.last_name, emp.employee_code, emp.document_number]
      .some(value => String(value || "").toLowerCase().includes(search));
  }) })).filter(g => g.payslips.length > 0);

  const groups = filteredGroups.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return a.payroll_type.localeCompare(b.payroll_type);
  });

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b">
        <CardTitle className="text-xl font-bold">Histórico de Planillas</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              placeholder="Buscar empleado..."
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={String(yearFilter)} onValueChange={(v) => onYearFilterChange(parseInt(v))}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025, 2026].map(year => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={onMonthFilterChange}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {format(new Date(2024, i), 'MMMM', { locale: es })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={onTypeFilterChange}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Quincenal">Quincenal</SelectItem>
              <SelectItem value="Mensual">Mensual</SelectItem>
              <SelectItem value="Adicional">Adicional</SelectItem>
              <SelectItem value="SNP">SNP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No se encontraron planillas</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const allGroupPayslips = group.payslips;
              const total = allGroupPayslips.reduce((sum, p) => sum + safePayrollNumber(p.net_pay), 0);
              const isSelected = selectedPayrollToDelete?.year === group.year &&
                selectedPayrollToDelete?.month === group.month &&
                selectedPayrollToDelete?.type === group.payroll_type;

              return (
                <Card key={`${group.year}-${group.month}-${group.payroll_type}`} className={`border-2 ${isSelected ? 'border-red-400 bg-red-50' : ''}`}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onSelectPayrollToDelete(isSelected ? null : group)}
                          className="w-5 h-5 rounded border-slate-300"
                        />
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">
                            {format(new Date(group.year, group.month - 1), 'MMMM yyyy', { locale: es })} - {group.payroll_type}
                          </h3>
                          <p className="text-sm text-slate-600">
                            {allGroupPayslips.length} empleado(s)
                            {canViewAmounts && ` • Total: S/ ${total.toFixed(2)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => exportPayslipsToExcel(
                            allGroupPayslips,
                            allEmployees,
                            `Planilla_${group.payroll_type}_${group.year}_${String(group.month).padStart(2, '0')}`
                          )}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Excel
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const emp = allEmployees.find(e => e.id === allGroupPayslips[0].employee_id);
                            if (emp) generatePayslipPDF(allGroupPayslips[0], emp);
                          }}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Boleta Individual
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateMassivePayslipsPDF(allGroupPayslips, allEmployees)}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Todas las Boletas
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const doc = new jsPDF();
                            doc.text(`Planilla ${group.payroll_type}`, 14, 20);
                            doc.text(`${format(new Date(group.year, group.month - 1), 'MMMM yyyy', { locale: es })}`, 14, 28);
                            let y = 40;
                            allGroupPayslips.forEach(p => {
                              const emp = allEmployees.find(e => e.id === p.employee_id);
                              if (emp) {
                                const sede = emp.site ? ` | ${emp.site}` : "";
                                doc.text(`${emp.document_type} ${emp.document_number} - ${emp.first_name} ${emp.last_name}${sede}`, 14, y);
                                doc.text(`S/ ${safePayrollNumber(p.net_pay).toFixed(2)}`, 195, y, { align: "right" });
                                y += 7;
                                if (y > 270) { doc.addPage(); y = 20; }
                              }
                            });
                            doc.save(`Planilla_${group.payroll_type}_${group.year}_${group.month}.pdf`);
                          }}
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          Resumen PDF
                        </Button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-red-800">
                          ⚠️ ¿Eliminar esta planilla? ({allPayslips.filter(p => Number(p.year) === Number(group.year) && Number(p.month) === Number(group.month) && p.payroll_type === group.payroll_type).length} boleta(s))
                        </p>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onSelectPayrollToDelete(null)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700"
                            onClick={onDeletePayroll}
                          >
                            Confirmar Eliminación
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      {allGroupPayslips.slice(0, 5).map(p => {
                        const emp = allEmployees.find(e => e.id === p.employee_id);
                        return emp ? (
                          <div key={p.id} className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded">
                            <span>{emp.document_type} {emp.document_number} - {emp.first_name} {emp.last_name}</span>
                            {canViewAmounts ? (
                              <span className="font-semibold">S/ {(p.net_pay || 0).toFixed(2)}</span>
                            ) : (
                              <span className="text-slate-400">🔒</span>
                            )}
                          </div>
                        ) : null;
                      })}
                      {allGroupPayslips.length > 5 && (
                        <p className="text-xs text-slate-500 text-center">
                          y {allGroupPayslips.length - 5} más...
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}