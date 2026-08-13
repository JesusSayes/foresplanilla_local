import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabsContent } from "@/components/ui/tabs";
import { Search, CheckCircle, XCircle, CalendarClock, FileText } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";
import { groupIncidentsBySolicitud, groupStatusSummary, groupStatus, groupDateRange } from "@/lib/incidentGroups";

// Vista dedicada: solicitudes multi-día como bloques, con aprobación/rechazo por periodo.
export default function SolicitudesPeriodoTab({
  allIncidents,
  allEmployees,
  accessibleEmployeeIds,
  canApproveIncidents,
  onPeriodAction,
  solSearchTerm,
  setSolSearchTerm,
  solStatusFilter,
  setSolStatusFilter,
  solDateFrom,
  setSolDateFrom,
  solDateTo,
  setSolDateTo,
}) {
  const [collapsed, setCollapsed] = useState({});

  const fmt = (d) => format(parseDateLima(d), "dd MMM yyyy", { locale: es });
  const fmtShort = (d) => format(parseDateLima(d), "dd MMM", { locale: es });

  // Solo grupos multi-día (varios incidentes bajo el mismo codigo_solicitud).
  const groups = useMemo(() => {
    const accessible = allIncidents.filter((i) => accessibleEmployeeIds.has(i.employee_id));
    return groupIncidentsBySolicitud(accessible).filter((g) => g.incidents.length > 1);
  }, [allIncidents, accessibleEmployeeIds]);

  // Aplicar filtros: empleado, estado del grupo, rango de fechas.
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const emp = allEmployees.find((e) => e.id === g.incidents[0].employee_id);
      if (solSearchTerm) {
        const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
        if (!name.includes(solSearchTerm.toLowerCase())) return false;
      }
      if (solStatusFilter !== "all" && groupStatus(g) !== solStatusFilter) return false;
      if (solDateFrom || solDateTo) {
        const dates = g.incidents.map((i) => i.incident_date).sort();
        const gStart = dates[0];
        const gEnd = dates[dates.length - 1];
        if (solDateFrom && gEnd < solDateFrom) return false;
        if (solDateTo && gStart > solDateTo) return false;
      }
      return true;
    });
  }, [groups, allEmployees, solSearchTerm, solStatusFilter, solDateFrom, solDateTo]);

  const statusBadge = (st) => {
    if (st === "Pendiente") return <Badge className="bg-yellow-100 text-yellow-700">Pendiente</Badge>;
    if (st === "Aprobada") return <Badge className="bg-green-100 text-green-700">Aprobada</Badge>;
    if (st === "Rechazada") return <Badge className="bg-red-100 text-red-700">Rechazada</Badge>;
    return <Badge className="bg-slate-100 text-slate-700">Mixta</Badge>;
  };

  const incidentStatusColor = (st) =>
    st === "Aprobada" ? "bg-green-100 text-green-700"
    : st === "Rechazada" ? "bg-red-100 text-red-700"
    : "bg-yellow-100 text-yellow-700";

  return (
    <TabsContent value="solicitudes" className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b bg-indigo-50/50">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-indigo-600" />Solicitudes por Periodo
          </CardTitle>
          <p className="text-sm text-slate-600 mt-2">
            Aprobación o rechazo de solicitudes multi-día completas (un solo acto para todas las fechas de la solicitud).
          </p>
        </CardHeader>
        <CardContent className="p-6">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input placeholder="Buscar por nombre..." value={solSearchTerm} onChange={(e) => setSolSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={solStatusFilter} onValueChange={setSolStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="Pendiente">Pendiente</SelectItem>
                <SelectItem value="Aprobada">Aprobada</SelectItem>
                <SelectItem value="Rechazada">Rechazada</SelectItem>
                <SelectItem value="Mixta">Mixta</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={solDateFrom} onChange={(e) => setSolDateFrom(e.target.value)} className="w-40" title="Desde" />
            <Input type="date" value={solDateTo} onChange={(e) => setSolDateTo(e.target.value)} className="w-40" title="Hasta" />
            {(solDateFrom || solDateTo) && (
              <Button size="sm" variant="outline" onClick={() => { setSolDateFrom(""); setSolDateTo(""); }}>✕ Fechas</Button>
            )}
          </div>

          {filteredGroups.length === 0 ? (
            <div className="text-center py-12">
              <CalendarClock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No hay solicitudes multi-día que coincidan con los filtros.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group) => {
                const emp = allEmployees.find((e) => e.id === group.incidents[0].employee_id);
                const sum = groupStatusSummary(group.incidents);
                const st = groupStatus(group);
                const dateRange = groupDateRange(group, fmtShort);
                const hasPending = sum.pending > 0;
                const key = group.codigo || group.incidents[0].id;
                const isCollapsed = collapsed[key];
                return (
                  <div key={key} className="border border-slate-200 rounded-lg overflow-hidden">
                    {/* Cabecera de la solicitud */}
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-slate-900">
                              {emp ? `${emp.first_name} ${emp.last_name}` : "Empleado"}
                            </h4>
                            <Badge className="bg-orange-100 text-orange-700">{group.incidents[0].incident_type}</Badge>
                            <span className="text-xs text-slate-500">📅 {dateRange}</span>
                            {group.codigo && <Badge variant="outline" className="text-[10px]">{group.codigo}</Badge>}
                            {statusBadge(st)}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            <span>{sum.total} fecha(s)</span>
                            <span>•</span>
                            <span className="text-yellow-700">{sum.pending} pend.</span>
                            <span className="text-green-700">{sum.approved} aprob.</span>
                            <span className="text-red-700">{sum.rejected} rechaz.</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canApproveIncidents && hasPending && (
                            <>
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => onPeriodAction(group, "approve")}>
                                <CheckCircle className="w-4 h-4 mr-1" />Aprobar todo
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onPeriodAction(group, "reject")}>
                                <XCircle className="w-4 h-4 mr-1" />Rechazar todo
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}>
                            <FileText className="w-4 h-4 mr-1" />{isCollapsed ? "Ver fechas" : "Ocultar"}
                          </Button>
                        </div>
                      </div>
                    </div>
                    {/* Lista de fechas */}
                    {!isCollapsed && (
                      <div className="divide-y divide-slate-100">
                        {group.incidents.map((inc) => (
                          <div key={inc.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-slate-800">{fmt(inc.incident_date)}</span>
                                <Badge className={`text-xs ${incidentStatusColor(inc.status)}`}>{inc.status}</Badge>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">{inc.justification}</p>
                            </div>
                            {inc.review_comments && (
                              <span className="text-xs text-slate-400 italic hidden sm:block truncate max-w-[40%]">
                                "{inc.review_comments}"
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}