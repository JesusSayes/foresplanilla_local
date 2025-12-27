import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, CheckCircle, XCircle, AlertCircle, FileText, Download 
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function IncidentHistory({ incidents, isLoading, employeeName }) {
  const getStatusConfig = (status) => {
    const configs = {
      "Pendiente": { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
      "Aprobada": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
      "Rechazada": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
    };
    return configs[status] || configs["Pendiente"];
  };

  const getIncidentTypeColor = (type) => {
    const colors = {
      "Tardanza": "bg-orange-100 text-orange-700",
      "Falta": "bg-red-100 text-red-700",
      "Salida Temprana": "bg-yellow-100 text-yellow-700",
      "Olvido de Marcación": "bg-blue-100 text-blue-700",
    };
    return colors[type] || "bg-slate-100 text-slate-700";
  };

  const groupByStatus = () => {
    return {
      pendientes: incidents.filter(i => i.status === "Pendiente"),
      aprobadas: incidents.filter(i => i.status === "Aprobada"),
      rechazadas: incidents.filter(i => i.status === "Rechazada"),
    };
  };

  const grouped = groupByStatus();

  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="p-8 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-slate-50/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold">
            Historial de Incidencias {employeeName && `- ${employeeName}`}
          </CardTitle>
          <div className="flex gap-2 text-xs">
            <Badge className="bg-yellow-100 text-yellow-700">
              {grouped.pendientes.length} Pendientes
            </Badge>
            <Badge className="bg-green-100 text-green-700">
              {grouped.aprobadas.length} Aprobadas
            </Badge>
            <Badge className="bg-red-100 text-red-700">
              {grouped.rechazadas.length} Rechazadas
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {incidents.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No hay incidencias registradas</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {incidents.map((incident) => {
              const statusConfig = getStatusConfig(incident.status);
              const StatusIcon = statusConfig.icon;
              
              return (
                <div 
                  key={incident.id}
                  className="p-4 border border-slate-200 rounded-lg hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={getIncidentTypeColor(incident.incident_type)}>
                          {incident.incident_type}
                        </Badge>
                        <span className="text-sm text-slate-600">
                          {format(new Date(incident.incident_date), "dd MMM yyyy", { locale: es })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mb-2">
                        {incident.justification}
                      </p>
                    </div>
                    <Badge className={statusConfig.color}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {incident.status}
                    </Badge>
                  </div>

                  {incident.supporting_document_url && (
                    <a 
                      href={incident.supporting_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs text-indigo-600 hover:underline mb-2"
                    >
                      <Download className="w-3 h-3" />
                      Ver documento adjunto
                    </a>
                  )}

                  {incident.status === "Aprobada" && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-green-800 font-semibold mb-1">
                            ✓ Aprobada por {incident.reviewed_by}
                          </p>
                          <p className="text-xs text-green-700">
                            {incident.review_date && format(new Date(incident.review_date), "dd MMM yyyy", { locale: es })}
                          </p>
                          {incident.review_comments && (
                            <p className="text-xs text-green-700 mt-2 italic">
                              "{incident.review_comments}"
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {incident.status === "Rechazada" && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-red-800 font-semibold mb-1">
                            ✗ Rechazada por {incident.reviewed_by}
                          </p>
                          <p className="text-xs text-red-700">
                            {incident.review_date && format(new Date(incident.review_date), "dd MMM yyyy", { locale: es })}
                          </p>
                          {incident.review_comments && (
                            <p className="text-xs text-red-700 mt-2 italic">
                              "{incident.review_comments}"
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {incident.status === "Pendiente" && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs text-yellow-800">
                        ⏳ Esperando revisión
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}