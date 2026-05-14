import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Save, Star, Users, Calendar, DollarSign,
  Clock, Plus, Trash2, Play, TrendingUp, ScrollText
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ReportBuilder from "../components/reports/ReportBuilder";
import ReportExporter from "../components/reports/ReportExporter";
import { usePermissions } from "../components/hooks/usePermissions";

const REPORT_TYPES = [
  { id: "employees", label: "Empleados", icon: Users, color: "blue" },
  { id: "attendance", label: "Asistencia", icon: Clock, color: "green" },
  { id: "vacations", label: "Vacaciones", icon: Calendar, color: "purple" },
  { id: "payroll", label: "Nómina", icon: DollarSign, color: "amber" },
  { id: "contracts", label: "Contratos", icon: ScrollText, color: "indigo" },
];

export default function Reports() {
  const { user: currentUser } = useAuth();
  // const employee = currentUser?.employee || null;
  const { employee, hasPermission } = usePermissions();
  const [reportType, setReportType] = useState("employees");
  const [reportConfig, setReportConfig] = useState({
    filters: {},
    columns: [],
    sort_by: "",
    sort_order: "asc",
  });
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSaved, setSelectedSaved] = useState(null);

  const queryClient = useQueryClient();

  const { data: savedReports = [] } = useQuery({
    queryKey: ["reportConfigurations"],
    queryFn: async () => await entitiesAPI.ReportConfiguration.list("-created_date"),
  });

  const saveReportMutation = useMutation({
    mutationFn: async (data) => {
      if (selectedSaved) {
        return await entitiesAPI.ReportConfiguration.update(selectedSaved.id, data);
      }
      return await entitiesAPI.ReportConfiguration.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["reportConfigurations"]);
      toast.success("Configuración guardada");
      setReportName("");
      setReportDescription("");
    },
    onError: () => toast.error("Error al guardar configuración"),
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id) => await entitiesAPI.ReportConfiguration.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["reportConfigurations"]);
      toast.success("Reporte eliminado");
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }) => {
      return await entitiesAPI.ReportConfiguration.update(id, { is_favorite: !isFavorite });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["reportConfigurations"]);
    },
  });

  const handleSaveConfig = () => {
    if (!reportName) {
      toast.error("Ingresa un nombre para el reporte");
      return;
    }

    saveReportMutation.mutate({
      report_name: reportName,
      report_type: reportType,
      description: reportDescription,
      filters: reportConfig.filters,
      columns: reportConfig.columns,
      sort_by: reportConfig.sort_by,
      sort_order: reportConfig.sort_order,
    });
  };

  const loadSavedReport = (report) => {
    setSelectedSaved(report);
    setReportType(report.report_type);
    setReportName(report.report_name);
    setReportDescription(report.description || "");
    setReportConfig({
      filters: report.filters || {},
      columns: report.columns || [],
      sort_by: report.sort_by || "",
      sort_order: report.sort_order || "asc",
    });
  };

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      let data = [];

      switch (reportType) {
        case "employees":
          data = await entitiesAPI.Employee.list();
          break;
        case "attendance":
          data = await entitiesAPI.AttendanceRecord.list();
          // Add employee names
          const employees = await entitiesAPI.Employee.list();
          data = data.map(record => ({
            ...record,
            employee_name: employees.find(e => e.id === record.employee_id)?.first_name + ' ' +
                          employees.find(e => e.id === record.employee_id)?.last_name
          }));
          break;
        case "vacations":
          data = await entitiesAPI.VacationRequest.list();
          const emps = await entitiesAPI.Employee.list();
          data = data.map(req => ({
            ...req,
            employee_name: emps.find(e => e.id === req.employee_id)?.first_name + ' ' +
                          emps.find(e => e.id === req.employee_id)?.last_name
          }));
          break;
        case "payroll":
          data = await entitiesAPI.Payslip.list();
          const allEmps = await entitiesAPI.Employee.list();
          data = data.map(payslip => ({
            ...payslip,
            employee_name: allEmps.find(e => e.id === payslip.employee_id)?.first_name + ' ' +
                          allEmps.find(e => e.id === payslip.employee_id)?.last_name
          }));
          break;
        case "contracts":
          data = await entitiesAPI.Contract.list();
          const contractEmps = await entitiesAPI.Employee.list();
          data = data.map(contract => ({
            ...contract,
            employee_name: contractEmps.find(e => e.id === contract.employee_id)?.first_name + ' ' +
                          contractEmps.find(e => e.id === contract.employee_id)?.last_name
          }));
          break;
      }

      // Apply filters
      if (reportConfig.filters && Object.keys(reportConfig.filters).length > 0) {
        data = data.filter(item => {
          return Object.entries(reportConfig.filters).every(([field, filter]) => {
            const value = item[field];
            const filterValue = filter.value;

            switch (filter.operator) {
              case "equals":
                return String(value).toLowerCase() === String(filterValue).toLowerCase();
              case "contains":
                return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
              case "greater":
                return Number(value) > Number(filterValue);
              case "less":
                return Number(value) < Number(filterValue);
              default:
                return true;
            }
          });
        });
      }

      // Apply sorting
      if (reportConfig.sort_by) {
        data.sort((a, b) => {
          const aVal = a[reportConfig.sort_by];
          const bVal = b[reportConfig.sort_by];

          if (reportConfig.sort_order === "asc") {
            return aVal > bVal ? 1 : -1;
          } else {
            return aVal < bVal ? 1 : -1;
          }
        });
      }

      setReportData(data);
      toast.success(`Reporte generado: ${data.length} registros`);
    } catch (error) {
      toast.error("Error al generar reporte");
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const myReports = savedReports.filter(r => r.created_by === employee?.work_email);
  const favoriteReports = myReports.filter(r => r.is_favorite);

  const stats = {
    total: myReports.length,
    favorites: favoriteReports.length,
    byType: REPORT_TYPES.reduce((acc, type) => {
      acc[type.id] = myReports.filter(r => r.report_type === type.id).length;
      return acc;
    }, {}),
  };

  if (!hasPermission("reports.view")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para ver reportes</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Reportes Avanzados
          </h1>
          <p className="text-slate-600 text-lg">
            Genera reportes personalizados con filtros avanzados
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <FileText className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.total}</div>
              <p className="text-slate-600 text-sm">Reportes Guardados</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-amber-100 rounded-xl">
                  <Star className="w-6 h-6 text-amber-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.favorites}</div>
              <p className="text-slate-600 text-sm">Favoritos</p>
            </CardContent>
          </Card>

          {REPORT_TYPES.slice(0, 2).map(type => {
            const Icon = type.icon;
            return (
              <Card key={type.id} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-3 bg-${type.color}-100 rounded-xl`}>
                      <Icon className={`w-6 h-6 text-${type.color}-600`} />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-slate-900 mb-1">
                    {stats.byType[type.id] || 0}
                  </div>
                  <p className="text-slate-600 text-sm">{type.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs defaultValue="create" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="create">Crear Reporte</TabsTrigger>
            <TabsTrigger value="saved">Mis Reportes</TabsTrigger>
          </TabsList>

          {/* Create Report */}
          <TabsContent value="create" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Report Type Selection */}
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b">
                    <CardTitle>Tipo de Reporte</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {REPORT_TYPES.map(type => {
                        const Icon = type.icon;
                        return (
                          <button
                            key={type.id}
                            onClick={() => {
                              setReportType(type.id);
                              setReportConfig({ filters: {}, columns: [], sort_by: "", sort_order: "asc" });
                              setReportData(null);
                            }}
                            className={`p-4 rounded-lg border-2 transition-all ${
                              reportType === type.id
                                ? `border-${type.color}-500 bg-${type.color}-50`
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <Icon className={`w-8 h-8 mx-auto mb-2 text-${type.color}-600`} />
                            <p className="text-sm font-medium">{type.label}</p>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Report Builder */}
                <ReportBuilder
                  reportType={reportType}
                  config={reportConfig}
                  onChange={setReportConfig}
                />
              </div>

              {/* Actions Panel */}
              <div className="space-y-6">
                {/* Generate Report */}
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-purple-50">
                    <CardTitle className="text-lg">Generar Reporte</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <Button
                      onClick={generateReport}
                      disabled={isGenerating || reportConfig.columns.length === 0}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 h-12"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {isGenerating ? "Generando..." : "Generar Reporte"}
                    </Button>

                    {reportData && (
                      <div className="pt-4 border-t">
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp className="w-5 h-5 text-green-600" />
                          <p className="font-semibold text-slate-900">
                            {reportData.length} registros
                          </p>
                        </div>
                        <ReportExporter
                          data={reportData}
                          columns={reportConfig.columns.map(colId => ({
                            id: colId,
                            label: colId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                          }))}
                          reportName={reportName || `Reporte_${reportType}`}
                          reportType={reportType}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Save Configuration */}
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b">
                    <CardTitle className="text-lg">Guardar Configuración</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <Label>Nombre del Reporte</Label>
                      <Input
                        value={reportName}
                        onChange={(e) => setReportName(e.target.value)}
                        placeholder="Ej: Empleados Activos 2024"
                      />
                    </div>
                    <div>
                      <Label>Descripción (Opcional)</Label>
                      <Input
                        value={reportDescription}
                        onChange={(e) => setReportDescription(e.target.value)}
                        placeholder="Breve descripción..."
                      />
                    </div>
                    <Button
                      onClick={handleSaveConfig}
                      variant="outline"
                      className="w-full"
                      disabled={saveReportMutation.isPending}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {selectedSaved ? "Actualizar" : "Guardar"} Configuración
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Saved Reports */}
          <TabsContent value="saved" className="space-y-6">
            {favoriteReports.length > 0 && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-amber-50">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-600 fill-amber-600" />
                    Favoritos
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {favoriteReports.map(report => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        onLoad={loadSavedReport}
                        onDelete={deleteReportMutation.mutate}
                        onToggleFavorite={toggleFavoriteMutation.mutate}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-lg">Todos mis Reportes</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {myReports.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600 mb-2">No tienes reportes guardados</p>
                    <p className="text-sm text-slate-500">Crea tu primer reporte en la pestaña "Crear Reporte"</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myReports.map(report => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        onLoad={loadSavedReport}
                        onDelete={deleteReportMutation.mutate}
                        onToggleFavorite={toggleFavoriteMutation.mutate}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ReportCard({ report, onLoad, onDelete, onToggleFavorite }) {
  const typeConfig = REPORT_TYPES.find(t => t.id === report.report_type);
  const Icon = typeConfig?.icon || FileText;

  return (
    <div className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1">
          <div className={`p-2 bg-${typeConfig?.color}-100 rounded-lg`}>
            <Icon className={`w-4 h-4 text-${typeConfig?.color}-600`} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-slate-900 truncate">{report.report_name}</h4>
            <Badge className="bg-slate-100 text-slate-700 text-xs mt-1">
              {typeConfig?.label}
            </Badge>
          </div>
        </div>
        <button
          onClick={() => onToggleFavorite({ id: report.id, isFavorite: report.is_favorite })}
          className="flex-shrink-0"
        >
          <Star className={`w-5 h-5 ${
            report.is_favorite
              ? "text-amber-500 fill-amber-500"
              : "text-slate-300 hover:text-amber-500"
          }`} />
        </button>
      </div>

      {report.description && (
        <p className="text-xs text-slate-600 mb-3 line-clamp-2">{report.description}</p>
      )}

      <div className="text-xs text-slate-500 mb-3">
        {report.columns?.length || 0} columnas • {Object.keys(report.filters || {}).length} filtros
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onLoad(report)}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 h-8"
        >
          Cargar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDelete(report.id)}
          className="h-8 px-3 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
