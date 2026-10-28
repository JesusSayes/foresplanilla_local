import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { formatRmvDate } from "@/lib/rmvDate";

export default function RmvCompliancePanel({ activeRmv, rule, matches, onReview }) {
  const months = rule?.renewal_months || 12;
  const count = matches?.length || 0;

  return (
    <Card className="border-0 shadow-lg mb-8">
      <CardHeader className="border-b bg-indigo-50/50">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-slate-900">
                Sueldo base inferior a la RMV
              </CardTitle>
              <p className="text-sm text-slate-600">
                {activeRmv
                  ? `RMV activa: S/ ${Number(activeRmv.amount).toFixed(2)} · vigente desde ${formatRmvDate(activeRmv.effective_date)}`
                  : "No hay una RMV activa registrada"}
              </p>
            </div>
          </div>
          <Button
            onClick={onReview}
            disabled={!activeRmv || count === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Revisar y aprobar ({count})
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {!activeRmv ? (
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>Registra y activa una RMV en Datos Maestros para poder aplicar esta regla.</p>
          </div>
        ) : count === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <p>Ningún contrato vigente tiene sueldo base por debajo de la RMV activa.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-700 mb-3">
              <strong>{count}</strong> contrato{count !== 1 ? "s" : ""} vigente{count !== 1 ? "s" : ""} con sueldo base
              menor a S/ {Number(activeRmv.amount).toFixed(2)}. Al aprobarlos se actualiza el sueldo del empleado a la RMV
              activa y se renueva el contrato por {months} mes{months !== 1 ? "es" : ""}.
            </p>
            <div className="space-y-2">
              {matches.slice(0, 5).map(({ contract, employee, baseSalary }) => (
                <div key={contract.id} className="flex items-center justify-between gap-3 p-3 bg-white rounded-lg border border-indigo-100">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {employee.first_name} {employee.last_name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {contract.position || "Sin cargo"} · {contract.contract_number || "Sin número"}
                    </p>
                  </div>
                  <Badge className="bg-red-100 text-red-700 shrink-0">
                    S/ {baseSalary.toFixed(2)}
                  </Badge>
                </div>
              ))}
            </div>
            {count > 5 && (
              <p className="text-xs text-slate-500 mt-2">y {count - 5} contrato{count - 5 !== 1 ? "s" : ""} más…</p>
            )}
          </>
        )}

        {!rule && activeRmv && (
          <p className="text-xs text-slate-500 mt-3">
            Sin regla configurada se aplica una renovación de 12 meses. Crea una regla de tipo
            "Sueldo inferior a la RMV" para definir la duración, la aprobación funciona igual.
          </p>
        )}
      </CardContent>
    </Card>
  );
}