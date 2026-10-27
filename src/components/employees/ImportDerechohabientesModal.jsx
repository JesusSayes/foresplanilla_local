import React, { useState, useRef } from "react";
import { entitiesAPI } from '@/api/entitiesClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, AlertCircle, FileText, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { downloadTemplate } from "@/lib/derechohabienteTemplate";
import { decodeBufferToText, parseDerechohabienteFile } from "@/lib/derechohabienteParser";
import {
  buildDerechohabientePayload,
  classifyDerechohabienteRows,
} from "@/lib/derechohabienteImportPlan";
import { fetchExistingDerechohabientes } from "@/lib/derechohabienteExisting";
import DerechohabienteImportGuide from "./DerechohabienteImportGuide";
import DerechohabientePreviewPanel from "./DerechohabientePreviewPanel";
import DerechohabienteImportResult from "./DerechohabienteImportResult";

export default function ImportDerechohabientesModal({ employees, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [classification, setClassification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const fileInputRef = useRef(null);

  const resetFile = () => {
    setFile(null);
    setParsed(null);
    setClassification(null);
    setLoadError("");
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected || loading || processing) return;
    setFile(selected);
    setParsed(null);
    setClassification(null);
    setResult(null);
    setLoadError("");
    setLoading(true);
    try {
      const text = decodeBufferToText(await selected.arrayBuffer());
      const fileParsed = parseDerechohabienteFile(text);

      // Primero se resuelven los titulares para saber qué derechohabientes leer,
      // luego se clasifica con los registros existentes (duplicados reales).
      const preliminar = classifyDerechohabienteRows({
        rows: fileParsed.rows,
        employees,
        existing: [],
      });
      const titularIds = [...new Set(preliminar.valid.map((item) => item.titular.id))];
      const existing =
        titularIds.length > 0 ? await fetchExistingDerechohabientes(titularIds) : [];

      setParsed(fileParsed);
      setClassification(
        classifyDerechohabienteRows({ rows: fileParsed.rows, employees, existing })
      );
    } catch (error) {
      console.error(error);
      setLoadError(error?.message || "No se pudo leer el archivo. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (loading || processing || !classification?.valid?.length) return;
    setProcessing(true);

    const saved = [];
    const failed = [];
    const skipped = [
      ...classification.duplicates.map((item) => ({ row: item.row, reason: item.reason })),
      ...classification.missingTitular.map((item) => ({ row: item.row, reason: item.reason })),
      ...classification.invalid.map((item) => ({ row: item.row, reason: item.reason })),
    ];
    const registrationDate = format(new Date(), "yyyy-MM-dd");

    for (const item of classification.valid) {
      try {
        await entitiesAPI.Derechohabiente.create(
          buildDerechohabientePayload(item.row, item.titular, registrationDate)
        );
        saved.push(item.row);
      } catch (error) {
        failed.push({ row: item.row, reason: error?.message || "no se pudo guardar el registro" });
      }
    }

    setResult({ saved, skipped, failed });
    setProcessing(false);
    if (saved.length > 0) {
      toast.success(`${saved.length} derechohabiente(s) importado(s) correctamente`);
      onSuccess?.();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Upload className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Importar Derechohabientes</CardTitle>
                <p className="text-sm text-slate-500 mt-0.5">
                  Archivo TXT con separador "|" de 24 columnas (SIT_ACTIVOS o plantilla del sistema)
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {!result && (
            <div>
              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  {loading
                    ? "Leyendo archivo..."
                    : file
                      ? file.name
                      : "Haz clic para seleccionar el archivo TXT"}
                </p>
                {parsed && !loading && (
                  <p className="text-xs text-slate-500 mt-1">
                    {parsed.dataLineCount} registro(s) leído(s)
                    {parsed.headerLineNumber ? " · encabezado detectado" : ""}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  Se acepta el archivo tal como lo descarga RR.HH. (UTF-8 o Latin-1), con o sin el
                  "|" final y con o sin encabezado.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.dat"
                disabled={loading || processing}
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex flex-wrap gap-2 mt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => downloadTemplate()}>
                  <FileText className="w-4 h-4 mr-1.5" />
                  Descargar plantilla TXT
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowGuide(!showGuide)}>
                  {showGuide ? "Ocultar guía de campos" : "Ver guía de campos"}
                </Button>
              </div>
              {showGuide && (
                <div className="mt-3 border rounded-lg p-4 bg-white">
                  <DerechohabienteImportGuide />
                </div>
              )}

              {loadError && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{loadError}</p>
                </div>
              )}
            </div>
          )}

          {!result && !loading && parsed && parsed.dataLineCount === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              El archivo no contiene registros de derechohabientes.
            </div>
          )}

          {!result && !loading && classification && parsed.dataLineCount > 0 && (
            <DerechohabientePreviewPanel
              parsed={parsed}
              classification={classification}
              processing={processing}
              onImport={handleImport}
              onReset={resetFile}
            />
          )}

          {result && <DerechohabienteImportResult result={result} onClose={onClose} />}
        </CardContent>
      </Card>
    </div>
  );
}
