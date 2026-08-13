import React from "react";
import { getPublicAssetUrl } from "@/api/apiConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Download, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";
import PaginationBar from "@/components/ui/PaginationBar";
import { groupIncidentsBySolicitud, groupStatusSummary, groupDateRange } from "@/lib/incidentGroups";

// Pestaña de Justificaciones con aprobación día por día y por periodo completo.
export default function IncidentsTabContent({
  allIncidents,
  pendingIncidents,
  approvedIncidents,
  rejectedIncidents,
  allEmployees,
  incidentSearchTerm,
  setIncidentSearchTerm,
  incidentTypeFilter,
  setIncidentTypeFilter,
  incidentDateFilter,
  setIncidentDateFilter,
  incidentPage,
  setIncidentPage,
  INCIDENT_PAGE_SIZE,
  incidentSubTab,
  setIncidentSubTab,
  applyIncidentFilters,
  canApproveIncidents,
  onReview,
  onPeriodAction,
  onExportIncidentsExcel,
}) {
  const fmt = (d) => format(parseDateLima(d), "dd MMM yyyy", { locale: es });
  const fmtShort = (d) => format(parseDateLima(d), "dd MMM", { locale: es });

  const renderIncidentRow = (incident, showStatusBadge = false) => {
    const emp = allEmployees.find(e => e.id === incident.employee_id);
    return (
      <div key={incident.id} className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="font-bold text-slate-900">
                {emp ? `${emp.document_type} ${emp.document_number} - ${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}
              </h4>
              <span className="text-xs text-slate-500">📅 {fmt(incident.incident_date)}</span>
              {incident.codigo_solicitud && (
                <Badge variant="outline" className="text-[10px]">{incident.codigo_solicitud}</Badge>
              )}
            </div>
            <p className="text-sm text-slate-600 mb-2">{emp?.position}</p>
            <div className="flex gap-2 text-sm flex-wrap items-center">
              <Badge className="bg-orange-100 text-orange-700">{incident.incident_type}</Badge>
              {showStatusBadge && incident.status === "Aprobada" && <Badge className="bg-green-600 text-white">Aprobada</Badge>}
              {showStatusBadge && incident.status === "Rechazada" && <Badge className="bg-red-600 text-white">Rechazada</Badge>}
            </div>
          </div>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg mb-3">
          <p className="text-sm font-semibold text-slate-900 mb-1">Justificación:</p>
          <p className="text-sm text-slate-700">{incident.justification}</p>
        </div>
        {incident.supporting_document_url && (
          <div className="mb-3">
            <a href={getPublicAssetUrl(incident.supporting_document_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline bg-indigo-50 px-3 py-2 rounded-lg">
              <Download className="w-4 h-4" />Ver documento adjunto
            </a>
          </div>
        )}
        {showStatusBadge && incident.review_comments && (
          <div className={`p-3 rounded-lg mb-3 border ${incident.status === "Aprobada" ? "bg-green-100 border-green-200" : "bg-red-100 border-red-200"}`}>
            <p className={`text-sm font-semibold mb-1 ${incident.status === "Aprobada" ? "text-green-900" : "text-red-900"}`}>
              {incident.status === "Aprobada" ? "Comentarios de aprobación:" : "Motivo de rechazo:"}
            </p>
            <p className={`text-sm ${incident.status === "Aprobada" ? "text-green-800" : "text-red-800"}`}>{incident.review_comments}</p>
          </div>
        )}
        {showStatusBadge && (
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span>Revisado por: {incident.reviewed_by || "N/A"}</span><span>•</span>
            <span>Fecha: {incident.review_date ? fmt(incident.review_date) : "N/A"}</span>
          </div>
        )}
        {!showStatusBadge && canApproveIncidents && (
          <div className="flex gap-3">
            <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => onReview(incident)}>
              <CheckCircle className="w-4 h-4 mr-2" />Aprobar
            </Button>
            <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => onReview(incident)}>
              <XCircle className="w-4 h-4 mr-2" />Rechazar
            </Button>
          </div>
        )}
        {!showStatusBadge && !canApproveIncidents && (
          <p className="text-xs text-slate-500 text-center py-2">No tienes permisos para aprobar o rechazar justificaciones.</p>
        )}
      </div>
    );
  };

  return (
    <TabsContent value="incidents" className="space-y-4">
      {/* Filtros globales de justificaciones */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input placeholder="Buscar por nombre..." value={incidentSearchTerm} onChange={(e) => { setIncidentSearchTerm(e.target.value); setIncidentPage(1); }} className="pl-9" />
        </div>
        <Select value={incidentTypeFilter} onValueChange={(v) => { setIncidentTypeFilter(v); setIncidentPage(1); }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Tipo de incidente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {[...new Set(allIncidents.map(i => i.incident_type).filter(Boolean))].sort().map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={incidentDateFilter} onChange={(e) => { setIncidentDateFilter(e.target.value); setIncidentPage(1); }} className="w-40" title="Filtrar por fecha" />
        {incidentDateFilter && <Button size="sm" variant="outline" onClick={() => { setIncidentDateFilter(""); setIncidentPage(1); }}>✕ Fecha</Button>}
        <Button size="sm" variant="outline" className="bg-green-600 text-white hover:bg-green-700" onClick={onExportIncidentsExcel}>
          <Download className="w-4 h-4 mr-1" />Excel
        </Button>
        <div className="ml-auto">
          <PaginationBar inline currentPage={incidentPage} totalItems={applyIncidentFilters(allIncidents).length} pageSize={INCIDENT_PAGE_SIZE} onPageChange={setIncidentPage} />
        </div>
      </div>
      <Tabs value={incidentSubTab} onValueChange={(v) => { setIncidentSubTab(v); setIncidentPage(1); }}>
        <TabsList className="grid w-full max-w-xl grid-cols-3 mb-6">
          <TabsTrigger value="pending">Pendientes {pendingIncidents.length > 0 && <Badge className="ml-2 bg-orange-600 text-white">{pendingIncidents.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="approved">Aprobadas {approvedIncidents.length > 0 && <Badge className="ml-2 bg-green-600 text-white">{approvedIncidents.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="rejected">Rechazadas {rejectedIncidents.length > 0 && <Badge className="ml-2 bg-red-600 text-white">{rejectedIncidents.length}</Badge>}</TabsTrigger>
        </TabsList>

        {/* Pendientes — agrupadas por codigo_solicitud */}
        <TabsContent value="pending">
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-xl font-bold">Justificaciones Pendientes de Aprobación</CardTitle></CardHeader>
            <CardContent className="p-6">
              {(() => {
                const filtered = applyIncidentFilters(pendingIncidents);
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12"><CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" /><p className="text-slate-600">No hay justificaciones pendientes</p></div>
                  );
                }
                const groups = groupIncidentsBySolicitud(filtered);
                return (
                  <div className="space-y-5">
                    {groups.map((group) => {
                      const emp = allEmployees.find(e => e.id === group.incidents[0].employee_id);
                      const sum = groupStatusSummary(group.incidents);
                      const dateRange = groupDateRange(group, fmtShort);
                      const isMulti = group.incidents.length > 1;
                      return (
                        <div key={group.codigo || group.incidents[0].id} className="border border-slate-200 rounded-lg overflow-hidden">
                          {/* Cabecera del grupo */}
                          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-slate-900">{emp ? `${emp.first_name} ${emp.last_name}` : "Empleado"}</h4>
                                <Badge className="bg-orange-100 text-orange-700">{group.incidents[0].incident_type}</Badge>
                                <span className="text-xs text-slate-500">📅 {dateRange}</span>
                                <span className="text-xs text-slate-400">{sum.pending}/{sum.total} pendientes</span>
                                {group.codigo && <Badge variant="outline" className="text-[10px]">{group.codigo}</Badge>}
                              </div>
                            </div>
                            {canApproveIncidents && isMulti && (
                              <div className="flex gap-2">
                                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => onPeriodAction(group, "approve")}>
                                  <CheckCircle className="w-4 h-4 mr-1" />Aprobar todo
                                </Button>
                                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onPeriodAction(group, "reject")}>
                                  <XCircle className="w-4 h-4 mr-1" />Rechazar todo
                                </Button>
                              </div>
                            )}
                          </div>
                          {/* Filas individuales (día por día) */}
                          <div className="divide-y divide-slate-100">
                            {group.incidents.map((incident) => renderIncidentRow(incident, false))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aprobadas */}
        <TabsContent value="approved">
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-green-50/50"><CardTitle className="text-xl font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-600" />Justificaciones Aprobadas</CardTitle></CardHeader>
            <CardContent className="p-6">
              {(() => {
                const filtered = applyIncidentFilters(approvedIncidents);
                const paged = filtered.slice((incidentPage - 1) * INCIDENT_PAGE_SIZE, incidentPage * INCIDENT_PAGE_SIZE);
                return filtered.length === 0 ? (
                  <div className="text-center py-12"><AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" /><p className="text-slate-600">No hay justificaciones aprobadas</p></div>
                ) : (
                  <div className="space-y-4">
                    {paged.map((incident) => (
                      <div key={incident.id} className="p-4 border border-green-200 bg-green-50/30 rounded-lg">
                        {renderIncidentRow(incident, true)}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rechazadas */}
        <TabsContent value="rejected">
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-red-50/50"><CardTitle className="text-xl font-bold flex items-center gap-2"><XCircle className="w-5 h-5 text-red-600" />Justificaciones Rechazadas</CardTitle></CardHeader>
            <CardContent className="p-6">
              {(() => {
                const filtered = applyIncidentFilters(rejectedIncidents);
                const paged = filtered.slice((incidentPage - 1) * INCIDENT_PAGE_SIZE, incidentPage * INCIDENT_PAGE_SIZE);
                return filtered.length === 0 ? (
                  <div className="text-center py-12"><AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" /><p className="text-slate-600">No hay justificaciones rechazadas</p></div>
                ) : (
                  <div className="space-y-4">
                    {paged.map((incident) => (
                      <div key={incident.id} className="p-4 border border-red-200 bg-red-50/30 rounded-lg">
                        {renderIncidentRow(incident, true)}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </TabsContent>
  );
}
