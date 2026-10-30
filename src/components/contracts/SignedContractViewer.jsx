import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Download, Loader2, Lock, PenLine, X } from "lucide-react";
import { buildContractPDF, generateContractPDF } from "@/components/contracts/ContractTemplate";
import ContractVariablesGrid from "@/components/contracts/ContractVariablesGrid";

export default function SignedContractViewer({ contract, employee, template, companyInfo, onClose }) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [building, setBuilding] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  // La previsualización es el mismo documento que se genera para el PDF:
  // se construye sin descargarlo y se muestra embebido.
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setBuilding(true);
    setError("");
    setPdfUrl("");
    if (!employee) {
      setBuilding(false);
      setError("No se encontró la ficha del trabajador asociada a este contrato. Verifica que el empleado siga registrado.");
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const doc = await buildContractPDF(employee, contract, companyInfo || {}, template || null);
        if (!cancelled) {
          objectUrl = String(doc.output("bloburl"));
          setPdfUrl(objectUrl);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "No se pudo generar la previsualización del contrato");
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [contract?.id, employee?.id, template?.id]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await generateContractPDF(employee, contract, companyInfo || {}, template || null);
    } catch (e) {
      setError(e?.message || "No se pudo descargar el contrato");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <Card className="max-w-6xl w-full my-4" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-xl font-bold flex flex-wrap items-center gap-2">
                Contrato firmado
                <Badge className="bg-purple-100 text-purple-700">#{contract.contract_number || "S/N"}</Badge>
                <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                  <PenLine className="w-3 h-3 mr-1" />Firmado
                </Badge>
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1 truncate">
                {employee ? `${employee.employee_code} · ${employee.first_name} ${employee.last_name}` : "Empleado no disponible"}
              </p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Consulta de solo lectura: no permite editar el contrato
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto">
          <Tabs defaultValue="variables" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="variables">Datos del contrato</TabsTrigger>
              <TabsTrigger value="preview">Previsualización</TabsTrigger>
            </TabsList>

            <TabsContent value="variables">
              <ContractVariablesGrid contract={contract} employee={employee} template={template} />
            </TabsContent>

            <TabsContent value="preview">
              {error ? (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">No se pudo mostrar el documento</p>
                    <p className="text-sm text-red-700 mt-0.5">{error}</p>
                  </div>
                </div>
              ) : building ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  <p className="text-sm">Generando la previsualización del contrato...</p>
                </div>
              ) : (
                <iframe
                  src={pdfUrl}
                  title={`Contrato ${contract.contract_number || ""}`}
                  className="w-full h-[65vh] rounded-lg border border-slate-200 bg-slate-100"
                />
              )}
            </TabsContent>
          </Tabs>

          <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cerrar</Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando...</> : <><Download className="w-4 h-4 mr-2" />Descargar PDF</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}