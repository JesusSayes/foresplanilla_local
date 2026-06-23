import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { getPublicAssetUrl } from "@/api/apiConfig";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PenTool, Upload, User, Loader2, Trash2, Settings } from "lucide-react";
import { toast } from "sonner";
import { uploadFile } from "@/services/uploadService";

const EMPTY_FIRMANTE = { nombre: "", cargo: "", dni: "", firma_url: "" };

export default function ConfigFirmantesModal({ companyInfo, onClose, onSave }) {
  const queryClient = useQueryClient();

  const [firmante1, setFirmante1] = useState({
    nombre: "",
    cargo: "Gerente General",
    dni: "",
    firma_url: "",
  });
  const [firmante2, setFirmante2] = useState({
    nombre: "",
    cargo: "Jefe de Recursos Humanos",
    dni: "",
    firma_url: "",
  });

  const [uploading1, setUploading1] = useState(false);
  const [uploading2, setUploading2] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cargar datos existentes desde CompanyInfo
  useEffect(() => {
    if (companyInfo) {
      if (companyInfo.firmante_gg) {
        try {
          const parsed = JSON.parse(companyInfo.firmante_gg);
          if (parsed && Object.keys(parsed).length > 0) {
            setFirmante1(parsed);
            console.log("=========> no parsed");
            console.log(parsed);
          }
        } catch (err){
          console.log("=======> error: ");
          console.log(err);
        }
      }
      if (companyInfo.firmante_delegado) {
        try {
          const parsed = JSON.parse(companyInfo.firmante_delegado);
          if (parsed && Object.keys(parsed).length > 0) {
            setFirmante2(parsed);
          }
        } catch {}
      }
    }
  }, [companyInfo]);

  // Buscar empleados para autocompletar
  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployeesConfig"],
    queryFn: () => entitiesAPI.Employee.list("-created_date"),
  });

  const [empSearch1, setEmpSearch1] = useState("");
  const [empSearch2, setEmpSearch2] = useState("");

  const filteredEmps1 = empSearch1.length > 1
    ? allEmployees.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(empSearch1.toLowerCase())
      ).slice(0, 5)
    : [];

  const filteredEmps2 = empSearch2.length > 1
    ? allEmployees.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(empSearch2.toLowerCase())
      ).slice(0, 5)
    : [];

  const selectEmp1 = (emp) => {
    setFirmante1(prev => ({
      ...prev,
      nombre: `${emp.first_name} ${emp.last_name}`,
      cargo: emp.position || prev.cargo,
      dni: emp.document_number || prev.dni,
      firma_url: emp.digital_signature_image_url || prev.firma_url,
    }));
    setEmpSearch1("");
  };

  const selectEmp2 = (emp) => {
    setFirmante2(prev => ({
      ...prev,
      nombre: `${emp.first_name} ${emp.last_name}`,
      cargo: emp.position || prev.cargo,
      dni: emp.document_number || prev.dni,
      firma_url: emp.digital_signature_image_url || prev.firma_url,
    }));
    setEmpSearch2("");
  };

  const handleUploadFirma = async (setFn, setUploading) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const { file_url } = await uploadFile(file);
        setFn(prev => ({ ...prev, firma_url: file_url }));
        toast.success("Firma subida correctamente");
      } catch {
        toast.error("Error al subir la firma");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleSave = async () => {
    console.log("=== SAVE PROCESS START ===");
    console.log("firmante1:", firmante1);
    console.log("firmante2:", firmante2);
    console.log("firmante1 JSON:", JSON.stringify(firmante1));
    console.log("firmante2 JSON:", JSON.stringify(firmante2));

    if (!firmante1.nombre || !firmante1.cargo) {
      toast.error("Por favor complete los datos del Firmante Principal");
      return;
    }

    setSaving(true);
    try {
      if (companyInfo?.id) {
        // const payload = {
          // firmante_gg: JSON.stringify(firmante1),
          // firmante_delegado: JSON.stringify(firmante2),
        // };
        /* ====== CUSTOM VALIDATION BLOCK (NO BASE44) ====== */

        // Función para validar si un firmante tiene datos reales
        const isEmptyFirmante = (f) => {
          return !f || (
            (!f.nombre || f.nombre.trim() === "") &&
            (!f.cargo || f.cargo.trim() === "") &&
            (!f.dni || f.dni.trim() === "") &&
            (!f.firma_url || f.firma_url.trim() === "")
          );
        };

        // Validar firmante principal (obligatorio)
        if (isEmptyFirmante(firmante1)) {
          toast.error("Debe completar al menos el nombre o cargo del Firmante Principal");
          return;
        }

        // Validar firmante delegado (opcional pero si existe debe tener datos)
        if (!isEmptyFirmante(firmante2) && !firmante2.nombre) {
          toast.error("El Firmante Delegado debe tener al menos un nombre válido");
          return;
        }

        // Construcción segura del payload
        const payload = {
          firmante_gg: isEmptyFirmante(firmante1) ? null : JSON.stringify(firmante1),
          firmante_delegado: isEmptyFirmante(firmante2) ? null : JSON.stringify(firmante2),
        };

        /* ====== END CUSTOM BLOCK ====== */

        console.log("firmante1=>>>>>>>>:", JSON.stringify(firmante1));
        console.log("Payload being sent:", payload);

        const result = await entitiesAPI.CompanyInfo.update(companyInfo.id, payload);

        const fresh = await entitiesAPI.CompanyInfo.get(companyInfo.id);

        if (fresh.firmante_gg !== payload.firmante_gg) {
          console.error("❌ No persistió en DB");
        } else {
          console.log("✅ Persistencia confirmada");
        }

        console.log("API Response:", result);
        console.log("firmante_gg from response:", result.firmante_gg);
        console.log("firmante_delegado from response:", result.firmante_delegado);

        await queryClient.invalidateQueries({ queryKey: ["companyInfo"] });

        toast.success("Firmantes guardados correctamente");

        if (onSave) {
          onSave({ gerente_general: firmante1, delegado: firmante2 });
        }

        setTimeout(() => {
          if (onClose) {
            onClose();
          }
        }, 500);
      } else {
        toast.error("No se encontró información de la empresa");
      }
    } catch (err) {
      console.error("Error al guardar firmantes:", err);
      toast.error(`Error al guardar los firmantes: ${err.message || 'Por favor intente nuevamente'}`);
    } finally {
      setSaving(false);
      console.log("=== SAVE PROCESS END ===");
    }
  };

  const FirmanteSection = ({ title, badge, data, setData, uploading, setUploading, empSearch, setEmpSearch, filteredEmps, onSelectEmp }) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <User className="w-4 h-4 text-indigo-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{badge}</p>
        </div>
      </div>

      {/* Buscar empleado */}
      <div className="relative">
        <Label className="text-xs text-slate-500 mb-1 block">Buscar empleado del sistema</Label>
        <Input
          placeholder="Escriba el nombre..."
          value={empSearch}
          onChange={e => setEmpSearch(e.target.value)}
          className="text-sm"
        />
        {filteredEmps.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1">
            {filteredEmps.map(emp => (
              <button
                key={emp.id}
                className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 transition-colors"
                onClick={() => onSelectEmp(emp)}
              >
                <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                <span className="text-slate-400 ml-2 text-xs">— {emp.position}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-slate-500">Nombres y Apellidos *</Label>
          <Input
            value={data.nombre}
            onChange={e => setData(prev => ({ ...prev, nombre: e.target.value }))}
            placeholder="Nombre completo"
          />
        </div>
        <div>
          <Label className="text-xs text-slate-500">Cargo *</Label>
          <Input
            value={data.cargo}
            onChange={e => setData(prev => ({ ...prev, cargo: e.target.value }))}
            placeholder="Cargo"
          />
        </div>
        <div>
          <Label className="text-xs text-slate-500">DNI</Label>
          <Input
            value={data.dni}
            onChange={e => setData(prev => ({ ...prev, dni: e.target.value }))}
            placeholder="00000000"
            maxLength={8}
          />
        </div>
      </div>

      {/* Firma */}
      <div>
        <Label className="text-xs text-slate-500 block mb-2">Imagen de Firma / Rúbrica</Label>
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center">
          {data.firma_url ? (
            <div className="space-y-2">
              <img src={getPublicAssetUrl(data.firma_url)} alt="firma" className="max-h-20 mx-auto object-contain" />
              <div className="flex gap-2 justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUploadFirma(setData, setUploading)}
                  disabled={uploading}
                >
                  <Upload className="w-3 h-3 mr-1" />Cambiar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-500 hover:bg-red-50"
                  onClick={() => setData(prev => ({ ...prev, firma_url: "" }))}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <PenTool className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUploadFirma(setData, setUploading)}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                Subir firma
              </Button>
              <p className="text-xs text-slate-400 mt-1">PNG, JPG recomendado</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg"><Settings className="w-5 h-5 text-indigo-600" /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Configuración de Firmantes</h2>
              <p className="text-sm text-slate-500">Define quién autoriza y firma las planillas</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-xl">
              <FirmanteSection
                title="Firmante Principal"
                badge="Gerente General o equivalente"
                data={firmante1}
                setData={setFirmante1}
                uploading={uploading1}
                setUploading={setUploading1}
                empSearch={empSearch1}
                setEmpSearch={setEmpSearch1}
                filteredEmps={filteredEmps1}
                onSelectEmp={selectEmp1}
              />
            </div>
            <div className="p-5 bg-slate-50/80 border border-slate-100 rounded-xl">
              <FirmanteSection
                title="Firmante Delegado"
                badge="Gerente Central o Jefe de RRHH"
                data={firmante2}
                setData={setFirmante2}
                uploading={uploading2}
                setUploading={setUploading2}
                empSearch={empSearch2}
                setEmpSearch={setEmpSearch2}
                filteredEmps={filteredEmps2}
                onSelectEmp={selectEmp2}
              />
            </div>
          </div>

          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <strong>💡 Tip:</strong> Puedes buscar el empleado directamente del sistema para completar los datos automáticamente, o ingresarlos manualmente. La firma digital se puede subir como imagen PNG/JPG.
          </div>

          <div className="flex gap-3 mt-6 pt-6 border-t">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button
              type="button"
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Button clicked!");
                handleSave();
              }}
              disabled={saving}
            >
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</> : "Guardar Firmantes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
