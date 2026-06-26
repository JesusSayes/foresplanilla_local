import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, Image, X, Clock, Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getPublicAssetUrl } from "@/api/apiConfig";
import { parseDateLima } from "@/lib/dateUtils";

const isImageUrl = (url) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url);

export default function IncidentDetailModal({ incident, employee, onClose }) {
  if (!incident) return null;

  const isImage = incident.supporting_document_url && isImageUrl(incident.supporting_document_url);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card
        className="max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Detalle de Justificación
              </CardTitle>
              <p className="text-sm text-slate-500 mt-0.5">
                {employee ? `${employee.first_name} ${employee.last_name}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {/* Info básica */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" />Fecha</p>
              <p className="text-sm font-semibold text-slate-900">
                {format(parseDateLima(incident.incident_date), "dd 'de' MMMM, yyyy", { locale: es })}
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">Tipo de Incidente</p>
              <Badge className="bg-blue-100 text-blue-800 text-xs">{incident.incident_type}</Badge>
            </div>
          </div>

          {/* Período justificado */}
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
            <p className="text-xs text-indigo-600 font-semibold mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />Período Justificado
            </p>
            {incident.full_day_justification ? (
              <p className="text-sm font-semibold text-indigo-900">
                Día completo ({incident.justified_time_start} – {incident.justified_time_end})
              </p>
            ) : (
              <p className="text-sm font-semibold text-indigo-900">
                {incident.justified_time_start} – {incident.justified_time_end}
                {incident.hours_to_adjust > 0 && (
                  <span className="ml-2 text-indigo-600 font-normal">({incident.hours_to_adjust.toFixed(2)}h)</span>
                )}
              </p>
            )}
          </div>

          {/* Estado */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Estado:</span>
            <Badge className={
              incident.status === "Aprobada" ? "bg-green-100 text-green-800" :
              incident.status === "Rechazada" ? "bg-red-100 text-red-800" :
              "bg-orange-100 text-orange-800"
            }>
              {incident.status}
            </Badge>
          </div>

          {/* Justificación */}
          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <p className="text-xs font-semibold text-slate-600 mb-2">Justificación:</p>
            <p className="text-sm text-slate-800 leading-relaxed">{incident.justification || "Sin detalle"}</p>
          </div>

          {/* Documento de sustento */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Documento de Sustento:</p>
            {incident.supporting_document_url ? (
              <div className="space-y-2">
                {isImage ? (
                  <div className="rounded-lg overflow-hidden border border-slate-200">
                    <img
                      src={getPublicAssetUrl(incident.supporting_document_url)}
                      alt="Documento de sustento"
                      className="w-full object-contain max-h-64"
                      onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                    />
                    <div style={{ display: "none" }} className="p-4 items-center gap-2 text-slate-500 text-sm">
                      <Image className="w-4 h-4" /> No se pudo cargar la imagen
                    </div>
                  </div>
                ) : null}
                <a
                  href={getPublicAssetUrl(incident.supporting_document_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline bg-indigo-50 px-3 py-2 rounded-lg w-full"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {isImage ? "Ver imagen en tamaño completo" : "Descargar documento adjunto"}
                </a>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2 text-slate-400">
                <FileText className="w-4 h-4" />
                <span className="text-sm">Sin archivo de justificación adjunto</span>
              </div>
            )}
          </div>

          {/* Revisión */}
          {(incident.reviewed_by || incident.review_date) && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <User className="w-3 h-3" />Revisado por
              </p>
              <p className="text-sm text-slate-800">{incident.reviewed_by || "N/A"}</p>
              {incident.review_date && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {format(parseDateLima(incident.review_date), "dd MMM yyyy", { locale: es })}
                </p>
              )}
              {incident.review_comments && (
                <p className="text-sm text-slate-700 mt-2 italic">"{incident.review_comments}"</p>
              )}
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={onClose}>Cerrar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
