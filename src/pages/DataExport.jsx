import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, Database, FileJson, FileCode, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function DataExport() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, entity: "" });
  const [selectedEntities, setSelectedEntities] = useState({});

  // Lista de todas las entidades
  const entities = [
    "Employee", "Contract", "ContractTemplate", "ContractClause", "ContractRenewalRule",
    "AttendanceRecord", "AttendanceIncident", "OvertimeAlert", "WorkSchedule",
    "VacationRequest", "VacationBalance",
    "Payslip", "PayrollConcept",
    "CostCenter", "CostCenterAssignment", "CostCenterChangeLog",
    "Holiday", "Position", "Department", "Bank", "Site", "AFP", "Profession", "Ubigeo",
    "Role", "UserRole",
    "Certificate",
    "EmployeeChangeLog",
    "CompanyInfo", "PayslipTemplate", "RMV",
    "DatabaseConnection", "SyncLog", "AccessDevice", "EmployeeAccessMapping", "DeviceEvent",
    "Notification", "NotificationPreference",
    "UserInvitation"
  ];

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
    // Seleccionar todas las entidades por defecto
    const selected = {};
    entities.forEach(e => selected[e] = true);
    setSelectedEntities(selected);
  }, [currentUser]);

  const toggleEntity = (entity) => {
    setSelectedEntities(prev => ({ ...prev, [entity]: !prev[entity] }));
  };

  const toggleAll = () => {
    const allSelected = Object.values(selectedEntities).every(v => v);
    const newState = {};
    entities.forEach(e => newState[e] = !allSelected);
    setSelectedEntities(newState);
  };

  const exportToJSON = async () => {
    setExporting(true);
    const selectedList = entities.filter(e => selectedEntities[e]);
    setProgress({ current: 0, total: selectedList.length, entity: "" });

    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        entities: {}
      };

      for (let i = 0; i < selectedList.length; i++) {
        const entityName = selectedList[i];
        setProgress({ current: i + 1, total: selectedList.length, entity: entityName });

        try {
          const data = await entitiesAPI[entityName].list();
          exportData.entities[entityName] = data;
          toast.success(`✓ ${entityName}: ${data.length} registros`);
        } catch (error) {
          console.error(`Error exportando ${entityName}:`, error);
          exportData.entities[entityName] = [];
          toast.error(`✗ Error en ${entityName}`);
        }
      }

      // Descargar JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // a.download = `base44_export_${new Date().toISOString().split('T')[0]}.json`;
      a.download = `LocalApi_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("✅ Exportación completa");
    } catch (error) {
      toast.error("Error en la exportación");
      console.error(error);
    } finally {
      setExporting(false);
      setProgress({ current: 0, total: 0, entity: "" });
    }
  };

  const exportToSQL = async () => {
    setExporting(true);
    const selectedList = entities.filter(e => selectedEntities[e]);
    setProgress({ current: 0, total: selectedList.length, entity: "" });

    try {
      let sqlScript = `-- LocalApi Data Export\n-- Generated: ${new Date().toISOString()}\n\n`;

      for (let i = 0; i < selectedList.length; i++) {
        const entityName = selectedList[i];
        setProgress({ current: i + 1, total: selectedList.length, entity: entityName });

        try {
          const data = await entitiesAPI[entityName].list();

          if (data.length > 0) {
            sqlScript += `-- Table: ${entityName}\n`;

            data.forEach(record => {
              const columns = Object.keys(record).filter(k => k !== 'id');
              const values = columns.map(col => {
                const val = record[col];
                if (val === null || val === undefined) return 'NULL';
                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                return val;
              });

              sqlScript += `INSERT INTO ${entityName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
            });

            sqlScript += `\n`;
            toast.success(`✓ ${entityName}: ${data.length} registros`);
          }
        } catch (error) {
          console.error(`Error exportando ${entityName}:`, error);
          toast.error(`✗ Error en ${entityName}`);
        }
      }

      // Descargar SQL
      const blob = new Blob([sqlScript], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LocalApi_export_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("✅ Exportación SQL completa");
    } catch (error) {
      toast.error("Error en la exportación");
      console.error(error);
    } finally {
      setExporting(false);
      setProgress({ current: 0, total: 0, entity: "" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!employee || (employee.role !== "admin" && employee.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden exportar datos</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedCount = Object.values(selectedEntities).filter(v => v).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Exportación de Datos</h1>
          <p className="text-slate-600 text-lg">Descarga toda tu información para migración o respaldo</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Selección de Entidades */}
          <Card className="lg:col-span-2 border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <CardTitle>Seleccionar Entidades ({selectedCount}/{entities.length})</CardTitle>
                <Button onClick={toggleAll} variant="outline" size="sm">
                  {Object.values(selectedEntities).every(v => v) ? "Deseleccionar Todo" : "Seleccionar Todo"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto">
                {entities.map(entity => (
                  <div key={entity} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-slate-50">
                    <Checkbox
                      id={entity}
                      checked={selectedEntities[entity] || false}
                      onCheckedChange={() => toggleEntity(entity)}
                    />
                    <Label htmlFor={entity} className="cursor-pointer flex-1">
                      {entity}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Panel de Exportación */}
          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-indigo-50/50">
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-600" />
                  Formato de Exportación
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <Button
                  onClick={exportToJSON}
                  disabled={exporting || selectedCount === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  {exporting && progress.entity ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <FileJson className="w-4 h-4 mr-2" />
                      Descargar JSON
                    </>
                  )}
                </Button>

                <Button
                  onClick={exportToSQL}
                  disabled={exporting || selectedCount === 0}
                  variant="outline"
                  className="w-full"
                >
                  {exporting && progress.entity ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generando SQL...
                    </>
                  ) : (
                    <>
                      <FileCode className="w-4 h-4 mr-2" />
                      Descargar SQL
                    </>
                  )}
                </Button>

                {exporting && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">
                        Exportando {progress.entity}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-blue-700 mt-1">
                      {progress.current} de {progress.total} entidades
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-amber-50">
              <CardContent className="p-6">
                <h3 className="font-bold text-amber-900 mb-2">ℹ️ Información</h3>
                <ul className="text-sm text-amber-800 space-y-2">
                  <li>• <strong>JSON:</strong> Formato completo con toda la estructura</li>
                  <li>• <strong>SQL:</strong> Scripts INSERT para importar a tu DB</li>
                  <li>• Los datos incluyen registros completos con IDs</li>
                  <li>• Se mantienen las relaciones entre entidades</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
