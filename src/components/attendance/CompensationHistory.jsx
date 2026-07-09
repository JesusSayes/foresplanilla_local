import React, { useState, useMemo } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function CompensationHistory({ allEmployees }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [authorizerFilter, setAuthorizerFilter] = useState("all");

  // Estado de mes navegable (por defecto mes actual)
  const now = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const refDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const periodLabel = `${MONTHS_ES[refDate.getMonth()]} ${refDate.getFullYear()}`;
  const periodStart = format(
    new Date(refDate.getFullYear(), refDate.getMonth(), 1),
    "yyyy-MM-dd"
  );
  const periodEnd = format(
    new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0),
    "yyyy-MM-dd"
  );

  // Cargar compensaciones ya procesadas (Aprobada o Rechazada)
  const { data: processedComps = [], isLoading } = useQuery({
    queryKey: ["processedCompensations", periodStart, periodEnd],
    queryFn: async () => {
      const all = await entitiesAPI.AttendanceIncident.list("-review_date");
      return all.filter(
        (i) =>
          i.incident_type === "Compensación de Tardanza" &&
          (i.status === "Aprobada" || i.status === "Rechazada") &&
          i.incident_date >= periodStart &&
          i.incident_date <= periodEnd
      );
    },
  });

  // Lista de autorizadores únicos para el filtro
  const authorizers = useMemo(() => {
    const map = new Map();
    for (const c of processedComps) {
      if (c.authorizer_id && c.authorizer_name) {
        map.set(c.authorizer_id, c.authorizer_name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [processedComps]);

  // Filtrado
  const filteredComps = useMemo(() => {
    return processedComps.filter((c) => {
      const emp = allEmployees.find((e) => e.id === c.employee_id);
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (authorizerFilter !== "all" && c.authorizer_id !== authorizerFilter)
        return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const empName = emp
          ? `${emp.first_name} ${emp.last_name}`.toLowerCase()
          : "";
        const empDoc = emp?.document_number?.toLowerCase() || "";
        const authName = (c.authorizer_name || "").toLowerCase();
        const reviewer = (c.reviewed_by || "").toLowerCase();
        if (
          !empName.includes(term) &&
          !empDoc.includes(term) &&
          !authName.includes(term) &&
          !reviewer.includes(term)
        )
          return false;
      }
      return true;
    });
  }, [processedComps, allEmployees, statusFilter, authorizerFilter, searchTerm]);

  // Estadísticas
  const stats = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    let totalLateMin = 0;
    let totalOvertimeMin = 0;
    for (const c of filteredComps) {
      if (c.status === "Aprobada") {
        approved++;
        totalLateMin += c.late_minutes_to_adjust || 0;
        totalOvertimeMin += Math.round((c.hours_to_adjust || 0) * 60);
      } else {
        rejected++;
      }
    }
    return { approved, rejected, totalLateMin, totalOvertimeMin };
  }, [filteredComps]);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="p-12 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-slate-50/50">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <History className="w-5 h-5 text-slate-600" />
          Histórico de Aprobaciones
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Solicitudes de compensación ya procesadas (aprobadas o rechazadas)
        </p>
      </CardHeader>
      <CardContent className="p-6">
        {/* Resumen de estadísticas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-700">{stats.approved}</p>
            <p className="text-xs text-green-600">Aprobadas</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
            <p className="text-xs text-red-600">Rechazadas</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
            <Clock className="w-5 h-5 text-orange-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-orange-700">
              {stats.totalLateMin}
            </p>
            <p className="text-xs text-orange-600">Min tardanza descontados</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <TrendingUp className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-700">
              {stats.totalOvertimeMin}
            </p>
            <p className="text-xs text-blue-600">Min HE descontados</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Buscar por empleado, doc, autorizador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Aprobada">Aprobadas</SelectItem>
              <SelectItem value="Rechazada">Rechazadas</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={authorizerFilter}
            onValueChange={setAuthorizerFilter}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Autorizador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {authorizers.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Navegación de mes */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMonthOffset((m) => m - 1)}
            >
              <span className="text-xs">‹</span>
            </Button>
            <Badge variant="outline" className="px-3 py-1 min-w-[120px] justify-center">
              {periodLabel}
            </Badge>
            {monthOffset !== 0 && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMonthOffset((m) => m + 1)}
              >
                <span className="text-xs">›</span>
              </Button>
            )}
            {monthOffset !== 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8"
                onClick={() => setMonthOffset(0)}
              >
                Hoy
              </Button>
            )}
          </div>
        </div>

        {/* Tabla / lista de resultados */}
        {filteredComps.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              No hay solicitudes procesadas en este período
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <th className="py-2 px-3">Fecha incidencia</th>
                  <th className="py-2 px-3">Empleado</th>
                  <th className="py-2 px-3">Autorizador</th>
                  <th className="py-2 px-3 text-center">Tardanza</th>
                  <th className="py-2 px-3 text-center">HE</th>
                  <th className="py-2 px-3 text-center">Estado</th>
                  <th className="py-2 px-3">Revisor</th>
                  <th className="py-2 px-3">Fecha revisión</th>
                  <th className="py-2 px-3">Comentarios</th>
                </tr>
              </thead>
              <tbody>
                {filteredComps.map((c) => {
                  const emp = allEmployees.find((e) => e.id === c.employee_id);
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-2 px-3 whitespace-nowrap">
                        {format(parseDateLima(c.incident_date), "dd MMM yyyy", {
                          locale: es,
                        })}
                      </td>
                      <td className="py-2 px-3">
                        {emp ? (
                          <div>
                            <p className="font-medium text-slate-900">
                              {emp.first_name} {emp.last_name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {emp.document_number}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {c.authorizer_name || "—"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {c.late_minutes_to_adjust ? (
                          <Badge className="bg-orange-100 text-orange-700 text-xs">
                            {c.late_minutes_to_adjust} min
                          </Badge>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {c.hours_to_adjust ? (
                          <Badge className="bg-blue-100 text-blue-700 text-xs">
                            {((c.hours_to_adjust || 0) * 60).toFixed(0)} min
                          </Badge>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {c.status === "Aprobada" ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Aprobada
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3 mr-1" />
                            Rechazada
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {c.reviewed_by || "—"}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                        {c.review_date
                          ? format(parseDateLima(c.review_date), "dd MMM yyyy", {
                              locale: es,
                            })
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-slate-500 max-w-[200px] truncate">
                        {c.review_comments || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
