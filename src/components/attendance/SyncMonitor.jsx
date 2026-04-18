import React, { useState, useEffect } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, XCircle, AlertTriangle, Clock,
  RefreshCw, Bell, BellOff
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import recalcularAsistenciaService from '@/services/recalcularAsistenciaService';

export default function SyncMonitor({ connectionId, connectionName }) {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const queryClient = useQueryClient();

  const { data: logs = [] } = useQuery({
    queryKey: ["syncLogs", connectionId],
    queryFn: async () => {
      // Si el backend ya implementa /api/sync/logs/filter:
      // const allLogs = await entitiesAPI.SyncLog.filter(
      //   { connection_id: connectionId },
      //   "-sync_date"
      // );
      // return allLogs.slice(0, 10);

      // Opción simple: traer todo y limitar en frontend
      const allLogs = await entitiesAPI.SyncLog.list("-sync_date");
      return allLogs
        .filter(log => log.connection_id === connectionId)
        .slice(0, 10);
    },
    // refetchInterval: autoRefresh ? 30000 : false, // Refrescar cada 30 segundos
  });

  const { data: connection } = useQuery({
    queryKey: ["connection", connectionId],
    queryFn: async () => {
      const conns = await entitiesAPI.DatabaseConnection.list();
      return conns.find(c => c.id === connectionId);
    },
  });

  const runSyncMutation = useMutation({
    mutationFn: async () => {
      const startTime = Date.now();

      try {
        // Simular sincronización (en producción, aquí iría la lógica real)
        await new Promise(resolve => setTimeout(resolve, 2000));

        const success = Math.random() > 0.2; // 80% éxito
        const recordsImported = success ? Math.floor(Math.random() * 100) + 20 : 0;
        const recordsFailed = success ? Math.floor(Math.random() * 5) : Math.floor(Math.random() * 50) + 10;

        const executionTime = (Date.now() - startTime) / 1000;

        const logData = {
          connection_id: connectionId,
          sync_date: new Date().toISOString(),
          status: success ? (recordsFailed > 0 ? "Parcial" : "Exitosa") : "Fallida",
          records_imported: recordsImported,
          records_failed: recordsFailed,
          error_message: success ? null : "Error de conexión con la base de datos externa",
          execution_time: executionTime,
          details: {
            connection_name: connectionName,
            triggered_by: "manual"
          }
        };

        await entitiesAPI.SyncLog.create(logData);

        // Actualizar last_sync en la conexión
        await entitiesAPI.DatabaseConnection.update(connectionId, {
          last_sync: new Date().toISOString()
        });

        // Recalcular métricas (tardanza, HE 25%, HE 35%) para todos los empleados
        // que tengan registros de asistencia del día de hoy y ayer
        if (success && recordsImported > 0) {
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          const todayStr = today.toISOString().split('T')[0];
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          // Obtener registros recientes para identificar empleados afectados
          const recentRecords = await entitiesAPI.AttendanceRecord.list("-date", 500);
          const affectedEmployees = [...new Set(
            recentRecords
              .filter(r => r.date >= yesterdayStr && r.date <= todayStr)
              .map(r => r.employee_id)
          )];

          // Recalcular por cada empleado afectado
          for (const empId of affectedEmployees) {
            try {
              await recalcularAsistenciaService.invoke(
                empId,
                yesterdayStr,
                todayStr
              );
            } catch (err) {
              console.error(`Error recalculando asistencia para empleado ${empId}:`, err);
            }
          }
        }

        return logData;
      } catch (error) {
        const executionTime = (Date.now() - startTime) / 1000;

        const logData = {
          connection_id: connectionId,
          sync_date: new Date().toISOString(),
          status: "Fallida",
          records_imported: 0,
          records_failed: 0,
          error_message: error.message || "Error desconocido",
          execution_time: executionTime
        };

        await entitiesAPI.SyncLog.create(logData);
        throw error;
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(["syncLogs", connectionId]);
      queryClient.invalidateQueries(["connection", connectionId]);

      if (result.status === "Exitosa") {
        toast.success(`✓ ${result.records_imported} registros sincronizados correctamente`);
      } else if (result.status === "Parcial") {
        toast.warning(`⚠ ${result.records_imported} sincronizados, ${result.records_failed} fallidos`);
      } else {
        toast.error(`✗ Sincronización fallida: ${result.error_message}`);
      }
    },
    onError: (error) => {
      queryClient.invalidateQueries(["syncLogs", connectionId]);
      toast.error(`Error en sincronización: ${error.message}`);
    },
  });

  useEffect(() => {
    if (!connection) return;

    // Verificar si debe ejecutarse sincronización automática
    const checkAutoSync = () => {
      if (connection.sync_frequency === "Manual") return;

      const lastSync = connection.last_sync ? new Date(connection.last_sync) : null;
      if (!lastSync) return;

      const now = new Date();
      const hoursSinceLastSync = (now - lastSync) / (1000 * 60 * 60);

      let shouldSync = false;

      switch (connection.sync_frequency) {
        case "Cada hora":
          shouldSync = hoursSinceLastSync >= 1;
          break;
        case "Cada 6 horas":
          shouldSync = hoursSinceLastSync >= 6;
          break;
        case "Diaria":
          shouldSync = hoursSinceLastSync >= 24;
          break;
      }

      if (shouldSync) {
        console.log("Ejecutando sincronización automática...");
        runSyncMutation.mutate();
      }
    };

    // Verificar cada minuto
    const interval = setInterval(checkAutoSync, 60000);
    checkAutoSync(); // Verificar inmediatamente

    return () => clearInterval(interval);
  }, [connection]);

  const lastLog = logs[0];
  const failedLogs = logs.filter(l => l.status === "Fallida").length;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-600" />
            Monitor de Sincronización
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </Button>
            <Button
              size="sm"
              onClick={() => runSyncMutation.mutate()}
              disabled={runSyncMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {runSyncMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Sincronizar Ahora
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {/* Status Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-600 mb-1">Última Sincronización</p>
            <p className="text-sm font-bold text-slate-900">
              {lastLog ? formatDistanceToNow(new Date(lastLog.sync_date), { addSuffix: true, locale: es }) : "Nunca"}
            </p>
          </div>

          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-xs text-slate-600 mb-1">Sincronizaciones Exitosas</p>
            <p className="text-2xl font-bold text-green-600">
              {logs.filter(l => l.status === "Exitosa").length}
            </p>
          </div>

          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-xs text-slate-600 mb-1">Sincronizaciones Fallidas</p>
            <p className="text-2xl font-bold text-red-600">{failedLogs}</p>
          </div>
        </div>

        {/* Alert for Failed Syncs */}
        {failedLogs > 0 && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900 mb-1">
                  ⚠️ Atención: {failedLogs} sincronizaciones fallidas recientes
                </p>
                <p className="text-sm text-red-700">
                  Revisa la configuración de la conexión y los logs de error para identificar el problema.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recent Logs */}
        <div>
          <h4 className="font-semibold text-slate-900 mb-3">Historial Reciente</h4>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                No hay registros de sincronización
              </p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg border-2 ${
                    log.status === "Exitosa"
                      ? "bg-green-50 border-green-200"
                      : log.status === "Parcial"
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {log.status === "Exitosa" ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : log.status === "Parcial" ? (
                        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={
                            log.status === "Exitosa"
                              ? "bg-green-100 text-green-700"
                              : log.status === "Parcial"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }>
                            {log.status}
                          </Badge>
                          <span className="text-xs text-slate-600">
                            {formatDistanceToNow(new Date(log.sync_date), { addSuffix: true, locale: es })}
                          </span>
                        </div>
                        <div className="flex gap-4 text-xs text-slate-700">
                          <span>✓ {log.records_imported} importados</span>
                          {log.records_failed > 0 && (
                            <span className="text-red-600">✗ {log.records_failed} fallidos</span>
                          )}
                          <span className="text-slate-500">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {log.execution_time?.toFixed(2)}s
                          </span>
                        </div>
                        {log.error_message && (
                          <p className="text-xs text-red-700 mt-1 font-mono bg-red-100 p-1 rounded">
                            {log.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
