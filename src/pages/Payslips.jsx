import React, { useState } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Download, Search, Calendar as CalendarIcon,
  TrendingUp, TrendingDown, Filter, Eye, Settings
} from "lucide-react";
import PayslipPreview from "../components/payroll/PayslipPreview";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { createPageUrl } from "../utils";

export default function Payslips() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [selectedPayslip, setSelectedPayslip] = useState(null);

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["payslips", employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      return await prisma.payslip.filter(
        { employee_id: employee.id },
        "-year,-month"
      );
    },
    enabled: !!employee?.id,
  });

  // Get available years
  const availableYears = [...new Set(payslips.map(p => p.year))].sort((a, b) => b - a);

  // Filter payslips
  const filteredPayslips = payslips.filter(payslip => {
    const matchesSearch = payslip.period?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesYear = yearFilter === "all" || payslip.year?.toString() === yearFilter;
    return matchesSearch && matchesYear;
  });

  // Calculate statistics
  const stats = {
    totalIncome: payslips.reduce((sum, p) => sum + (p.total_income || 0), 0),
    totalDeductions: payslips.reduce((sum, p) => sum + (p.total_deductions || 0), 0),
    averageNetPay: payslips.length > 0
      ? payslips.reduce((sum, p) => sum + (p.net_pay || 0), 0) / payslips.length
      : 0,
    lastIncrease: calculateLastIncrease(payslips),
  };

  function calculateLastIncrease(payslips) {
    if (payslips.length < 2) return 0;
    const sorted = [...payslips].sort((a, b) => b.year - a.year || b.month - a.month);
    const latest = sorted[0]?.net_pay || 0;
    const previous = sorted[1]?.net_pay || 0;
    return previous > 0 ? ((latest - previous) / previous) * 100 : 0;
  }

  const handleDownload = (payslip) => {
    if (payslip.pdf_url) {
      window.open(payslip.pdf_url, '_blank');
    } else {
      alert("PDF no disponible");
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      "Calculada": "bg-yellow-100 text-yellow-700 border-yellow-200",
      "Aprobada": "bg-blue-100 text-blue-700 border-blue-200",
      "Pagada": "bg-green-100 text-green-700 border-green-200",
    };
    return colors[status] || "bg-slate-100 text-slate-700";
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card>
          <CardContent className="p-8">
            <p className="text-slate-600">Cargando información del empleado...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Mis Boletas de Pago</h1>
            <p className="text-slate-600 text-lg">
              Consulta y descarga tus boletas de remuneración
            </p>
          </div>
          {employee?.role === "admin" && (
            <Button
              onClick={() => window.location.href = createPageUrl("PayslipTemplateConfig")}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Configurar Boletas
            </Button>
          )}
        </div>

        {/* Statistics */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">S/ {stats.averageNetPay.toFixed(2)}</span>
              <span className="text-sm text-slate-600">Promedio mensual</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <FileText className="w-5 h-5 text-blue-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{payslips.length}</span>
              <span className="text-sm text-slate-600">Boletas registradas</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">S/ {stats.totalIncome.toFixed(2)}</span>
              <span className="text-sm text-slate-600">Total ingresos acumulado</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            {stats.lastIncrease >= 0 ? (
              <TrendingUp className="w-5 h-5 text-green-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-600" />
            )}
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-bold ${stats.lastIncrease >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.lastIncrease >= 0 ? '+' : ''}{stats.lastIncrease.toFixed(1)}%
              </span>
              <span className="text-sm text-slate-600">Variación último mes</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-lg mb-8">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Buscar por periodo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger>
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Todos los años" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los años</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Filter className="w-4 h-4" />
                <span>{filteredPayslips.length} boletas encontradas</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payslips List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredPayslips.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 text-lg">No se encontraron boletas</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredPayslips.map((payslip) => (
              <Card
                key={payslip.id}
                className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer"
                onClick={() => setSelectedPayslip(payslip)}
              >
                <CardHeader className="border-b bg-slate-50/50 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold mb-2">
                        {payslip.period}
                      </CardTitle>
                      <Badge className={getStatusColor(payslip.status)}>
                        {payslip.status}
                      </Badge>
                    </div>
                    <div className="p-3 bg-indigo-100 rounded-xl">
                      <FileText className="w-6 h-6 text-indigo-600" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 text-sm">Días trabajados</span>
                      <span className="font-semibold text-slate-900">
                        {payslip.worked_days} días
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 text-sm">Ingresos</span>
                      <span className="font-semibold text-green-600">
                        + S/ {payslip.total_income?.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 text-sm">Descuentos</span>
                      <span className="font-semibold text-red-600">
                        - S/ {payslip.total_deductions?.toFixed(2)}
                      </span>
                    </div>

                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">Neto a pagar</span>
                        <span className="text-2xl font-bold text-indigo-600">
                          S/ {payslip.net_pay?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(payslip);
                      }}
                      disabled={!payslip.pdf_url}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPayslip(payslip);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {selectedPayslip && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
            onClick={() => setSelectedPayslip(null)}
          >
            <div
              className="max-w-2xl w-full my-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-3">
                <Button variant="outline" className="bg-white" onClick={() => setSelectedPayslip(null)}>
                  ← Volver al Detalle
                </Button>
              </div>
              <PayslipPreview
                payslip={selectedPayslip}
                employee={employee}
                showPrintButton={true}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
