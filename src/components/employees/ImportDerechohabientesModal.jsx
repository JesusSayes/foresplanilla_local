import React, { useState, useRef } from "react";
// import { base44 } from "@/api/base44Client";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, CheckCircle, XCircle, FileText, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// Parsea una línea del archivo TXT con separador |
function parseLine(line) {
  const parts = line.split("|");
  return {
    doc_titular:      parts[0]?.trim() || "",
    num_titular:      parts[1]?.trim() || "",
    doc_dhabiente:    parts[2]?.trim() || "",
    num_dhabiente:    parts[3]?.trim() || "",
    cod_pais:         parts[4]?.trim() || "",
    fec_nac:          parts[5]?.trim() || "",
    ape_paterno:      parts[6]?.trim() || "",
    ape_materno:      parts[7]?.trim() || "",
    nombres:          parts[8]?.trim() || "",
    sexo:             parts[9]?.trim() || "",
    tip_vin_fam:      parts[10]?.trim() || "",
    tip_doc_sust:     parts[11]?.trim() || "",
    num_doc_sust:     parts[12]?.trim() || "",
    mes_concep:       parts[13]?.trim() || "",
    desc_dir1:        parts[14]?.trim() || "",
    ref_dir1:         parts[15]?.trim() || "",
    ubigeo_dir1:      parts[16]?.trim() || "",
    desc_dir2:        parts[17]?.trim() || "",
    ref_dir2:         parts[18]?.trim() || "",
    ubigeo_dir2:      parts[19]?.trim() || "",
    ind_centro:       parts[20]?.trim() || "",
    cod_ciudad:       parts[21]?.trim() || "",
    telefono:         parts[22]?.trim() || "",
    correo:           parts[23]?.trim() || "",
  };
}

// Convierte fecha "DD/MM/YYYY" a "YYYY-MM-DD"
function parseFecha(fechaStr) {
  if (!fechaStr) return null;
  const match = fechaStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

// Mapea el tipo de vínculo familiar al enum de la entidad
function mapRelationship(tip) {
  const t = tip.toUpperCase().trim();
  if (t.includes("CONYUGE") || t.includes("CÓNYUGE")) return "Cónyuge";
  if (t.includes("CONCUBINA") || t.includes("CONCUBINO")) return "Concubino/a";
  if (t.includes("HIJO MENOR")) return "Hijo Menor de Edad";
  if (t.includes("HIJO")) return "Hijo/a";
  if (t.includes("PADRE")) return "Padre";
  if (t.includes("MADRE")) return "Madre";
  return "Otro";
}

// Mapea el género
function mapGender(sexo) {
  const s = sexo.toUpperCase().trim();
  if (s === "MASCULINO" || s === "M") return "M";
  if (s === "FEMENINO" || s === "F") return "F";
  return null;
}

export default function ImportDerechohabientesModal({ employees, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]); // parsed rows
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null); // { imported, skipped }
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split("\n").map(l => l.replace(/\r/g, "").trim()).filter(Boolean);
      // Skip header line
      const dataLines = lines.slice(1);
      const parsed = dataLines.map(parseLine).filter(r => r.num_titular && r.num_dhabiente);
      setPreview(parsed);
    };
    reader.readAsText(f, "latin1");
  };

  const handleImport = async () => {
    if (!preview.length) return;
    setProcessing(true);

    // Construir mapa: document_number → employee
    const employeeByDni = {};
    employees.forEach(emp => {
      if (emp.document_number) {
        employeeByDni[emp.document_number.trim()] = emp;
      }
    });

    // Cargar derechohabientes existentes para evitar duplicados
    const existingDH = await entitiesAPI.Derechohabiente.list("-created_date", 2000);
    const existingSet = new Set(existingDH.map(d => `${d.employee_id}|${d.document_number}`));

    const imported = [];
    const skipped = []; // { row, reason }

    for (const row of preview) {
      const titular = employeeByDni[row.num_titular];
      if (!titular) {
        skipped.push({ row, reason: `Titular con DNI ${row.num_titular} no encontrado` });
        continue;
      }

      const key = `${titular.id}|${row.num_dhabiente}`;
      if (existingSet.has(key)) {
        skipped.push({ row, reason: `Ya existe (DNI ${row.num_dhabiente})` });
        continue;
      }

      const birthDate = parseFecha(row.fec_nac);
      const fullLastName = [row.ape_paterno, row.ape_materno].filter(Boolean).join(" ");

      const payload = {
        employee_id:             titular.id,
        document_type:           row.doc_dhabiente || "DNI",
        document_number:         row.num_dhabiente,
        first_name:              row.nombres,
        last_name:               fullLastName,
        last_name_paterno:       row.ape_paterno,
        last_name_materno:       row.ape_materno,
        gender:                  mapGender(row.sexo),
        birth_date:              birthDate,
        relationship:            mapRelationship(row.tip_vin_fam),
        country_code:            row.cod_pais,
        document_type_sustento:  row.tip_doc_sust,
        document_number_sustento: row.num_doc_sust,
        conception_month:        row.mes_concep,
        address:                 row.desc_dir1,
        address_reference:       row.ref_dir1,
        ubigeo:                  row.ubigeo_dir1,
        address2:                row.desc_dir2,
        address_reference2:      row.ref_dir2,
        ubigeo2:                 row.ubigeo_dir2,
        health_center_indicator: row.ind_centro,
        city_code:               row.cod_ciudad,
        phone:                   row.telefono,
        email:                   row.correo,
        registration_date:       format(new Date(), "yyyy-MM-dd"),
        is_active:               true,
      };

      await entitiesAPI.Derechohabiente.create(payload);
      existingSet.add(key);
      imported.push(row);
    }

    setResult({ imported, skipped });
    setProcessing(false);
    if (imported.length > 0) {
      toast.success(`${imported.length} derechohabiente(s) importado(s) correctamente`);
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
                <p className="text-sm text-slate-500 mt-0.5">Archivo TXT con separador "|" (formato EsSalud SIT_ACTIVOS)</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Selector de archivo */}
          {!result && (
            <div>
              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  {file ? file.name : "Haz clic para seleccionar el archivo TXT"}
                </p>
                {file && (
                  <p className="text-xs text-slate-500 mt-1">{preview.length} registros detectados</p>
                )}
                <p className="text-xs text-slate-400 mt-2">Formato: Doc.Titular|N°Doc.Titular|Doc.DHabiente|...</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Preview de registros */}
          {preview.length > 0 && !result && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900">Vista previa ({preview.length} registros)</h3>
                <Badge className="bg-indigo-100 text-indigo-700">{preview.length} derechohabientes</Badge>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">DNI Titular</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">DNI DH</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Nombres</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Ap. Paterno</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Vínculo</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Fec. Nac.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 font-mono">{row.num_titular}</td>
                          <td className="px-3 py-1.5 font-mono">{row.num_dhabiente}</td>
                          <td className="px-3 py-1.5">{row.nombres}</td>
                          <td className="px-3 py-1.5">{row.ape_paterno}</td>
                          <td className="px-3 py-1.5">{row.tip_vin_fam}</td>
                          <td className="px-3 py-1.5">{row.fec_nac}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 50 && (
                    <p className="text-xs text-slate-500 text-center py-2">... y {preview.length - 50} registros más</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => { setFile(null); setPreview([]); }}>
                  Cambiar archivo
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleImport}
                  disabled={processing}
                >
                  {processing ? "Importando..." : `Importar ${preview.length} registros`}
                </Button>
              </div>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-green-600 shrink-0" />
                  <div>
                    <p className="text-2xl font-bold text-green-700">{result.imported.length}</p>
                    <p className="text-sm text-green-600">Importados correctamente</p>
                  </div>
                </div>
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                  <XCircle className="w-8 h-8 text-red-600 shrink-0" />
                  <div>
                    <p className="text-2xl font-bold text-red-700">{result.skipped.length}</p>
                    <p className="text-sm text-red-600">No importados</p>
                  </div>
                </div>
              </div>

              {/* Detalle de omitidos */}
              {result.skipped.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <h3 className="font-semibold text-slate-900">
                      Derechohabientes no importados ({result.skipped.length})
                    </h3>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">DNI Titular</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Nombres DH</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">DNI DH</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-600">Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {result.skipped.map((s, i) => (
                            <tr key={i} className="hover:bg-red-50">
                              <td className="px-3 py-1.5 font-mono text-red-700">{s.row.num_titular}</td>
                              <td className="px-3 py-1.5">{s.row.nombres} {s.row.ape_paterno}</td>
                              <td className="px-3 py-1.5 font-mono">{s.row.num_dhabiente}</td>
                              <td className="px-3 py-1.5 text-red-600">{s.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <Button className="w-full" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
