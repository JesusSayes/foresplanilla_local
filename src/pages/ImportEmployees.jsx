import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Upload, Download, CheckCircle, AlertCircle, FileSpreadsheet,
  Users, Loader2, XCircle
} from "lucide-react";
import { toast } from "sonner";
import PermissionGuard from "../components/PermissionGuard";

export default function ImportEmployees() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState("");

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);

        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };

    loadUserData();
  }, []);

  const employeeSchema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        employee_code: { type: "string" },
        document_type: { type: "string" },
        document_number: { type: "string" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        birth_date: { type: "string" },
        gender: { type: "string" },
        personal_email: { type: "string" },
        work_email: { type: "string" },
        mobile: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        district: { type: "string" },
        province: { type: "string" },
        department: { type: "string" },
        company: { type: "string" },
        position: { type: "string" },
        position_level: { type: "string" },
        profession: { type: "string" },
        department_name: { type: "string" },
        work_unit: { type: "string" },
        site: { type: "string" },
        hire_date: { type: "string" },
        termination_date: { type: "string" },
        contract_type: { type: "string" },
        base_salary: { type: "number" },
        pension_system: { type: "string" },
        afp_id: { type: "string" },
        afp_affiliation_date: { type: "string" },
        cuspp: { type: "string" },
        worker_type: { type: "string" },
        tax_residence: { type: "string" },
        bank_name: { type: "string" },
        bank_account: { type: "string" },
        cci_account: { type: "string" },
        cts_bank: { type: "string" },
        cts_account_number: { type: "string" },
        cts_currency: { type: "string" },
        status: { type: "string" },
        role: { type: "string" },
        supervisor_name: { type: "string" },
        emergency_contact_name: { type: "string" },
        emergency_contact_phone: { type: "string" },
        emergency_contact_relationship: { type: "string" },
      },
      required: ["employee_code", "document_number", "first_name", "last_name"]
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) {
      console.log("❌ No se seleccionó archivo");
      return;
    }

    console.log("📁 Archivo seleccionado:", selectedFile.name, selectedFile.size, "bytes", "tipo:", selectedFile.type);

    // Validar tamaño del archivo (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      const errorMsg = "El archivo es demasiado grande. Tamaño máximo: 10MB";
      setUploadError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setFile(selectedFile);
    setPreviewData(null);
    setImportResult(null);
    setUploadError(null);
    setProcessing(true);
    setUploadProgress("Iniciando...");

    let currentStep = "inicio";

    try {
      // Paso 1: Subir archivo
      currentStep = "subiendo archivo";
      setUploadProgress("Paso 1/2: Subiendo archivo al servidor...");
      console.log("📤 PASO 1: Iniciando subida de archivo...");
      toast.loading("Subiendo archivo al servidor...", { id: "upload" });
      
      const uploadResult = await Promise.race([
        base44.integrations.Core.UploadFile({ file: selectedFile }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout: La subida tardó más de 2 minutos")), 120000)
        )
      ]);
      
      console.log("✅ PASO 1 COMPLETADO - Archivo subido:", uploadResult);

      if (!uploadResult || !uploadResult.file_url) {
        throw new Error("Error del servidor: No se recibió la URL del archivo");
      }

      const { file_url } = uploadResult;
      console.log("🔗 URL del archivo obtenida:", file_url);

      // Paso 2: Extraer datos
      currentStep = "extrayendo datos del archivo";
      setUploadProgress("Paso 2/2: Extrayendo datos de empleados...");
      console.log("🔄 PASO 2: Iniciando extracción de datos...");
      toast.loading("Extrayendo datos de empleados...", { id: "upload" });

      const result = await Promise.race([
        base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url: file_url,
          json_schema: employeeSchema
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout: La extracción tardó más de 3 minutos")), 180000)
        )
      ]);

      console.log("📊 PASO 2 COMPLETADO - Resultado:", result);

      if (result.status === "success" && result.output) {
        if (!Array.isArray(result.output)) {
          throw new Error("El formato de respuesta no es válido");
        }
        
        if (result.output.length === 0) {
          throw new Error("El archivo está vacío o no contiene empleados válidos");
        }

        console.log("✅ Extracción exitosa:", result.output.length, "empleados");
        console.log("Muestra:", result.output.slice(0, 2));
        
        setPreviewData(result.output);
        setUploadProgress("");
        toast.success(`✓ ${result.output.length} empleados listos para importar`, { id: "upload", duration: 5000 });
      } else {
        let errorMsg = result.details || result.error || "No se pudo procesar el archivo. Verifica el formato.";
        
        // Detectar problema de delimitador
        if (errorMsg.includes("delimiter") || errorMsg.includes("CSV Error") || errorMsg.includes("byte sequence")) {
          errorMsg = "El archivo CSV tiene un formato incorrecto. Por favor, descarga y usa la plantilla proporcionada. Asegúrate de usar comas (,) como separadores, no punto y coma (;).";
        }
        
        console.error("❌ Error en extracción:", result);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("❌ ERROR EN:", currentStep);
      console.error("❌ Error completo:", error);
      console.error("❌ Stack:", error.stack);
      
      let userMessage = "";
      
      if (error.message.includes("Timeout")) {
        userMessage = "El proceso está tardando demasiado. Intenta con un archivo más pequeño o con menos empleados.";
      } else if (error.message.includes("network") || error.message.includes("fetch") || error.message.includes("Failed to fetch")) {
        userMessage = "Error de conexión. Verifica tu internet e intenta de nuevo.";
      } else if (error.message.includes("formato") || error.message.includes("válido")) {
        userMessage = "Formato de archivo incorrecto. Descarga y usa la plantilla CSV proporcionada.";
      } else if (error.message.includes("vacío")) {
        userMessage = error.message;
      } else {
        userMessage = `Error: ${error.message || "Ocurrió un problema desconocido"}`;
      }
      
      setUploadError(userMessage);
      setUploadProgress("");
      toast.error(userMessage, { id: "upload", duration: 10000 });
      setPreviewData(null);
    } finally {
      setProcessing(false);
      if (e.target) {
        e.target.value = '';
      }
      console.log("✅ Proceso finalizado");
    }
  };

  const importMutation = useMutation({
    mutationFn: async (data) => {
      console.log("Ejecutando importación de", data.length, "empleados");
      toast.loading(`Importando ${data.length} empleados, por favor espera...`, { id: "import" });
      const result = await base44.entities.Employee.bulkCreate(data);
      console.log("Importación completada:", result);
      return result;
    },
    onSuccess: (result) => {
      console.log("Importación exitosa, resultado:", result);
      const count = Array.isArray(result) ? result.length : (result ? 1 : 0);
      
      queryClient.invalidateQueries(["allEmployees"]);
      
      setImportResult({
        success: true,
        count: count
      });
      
      toast.success(`✓ ${count} empleados importados exitosamente`, { id: "import", duration: 5000 });
      
      // Limpiar vista previa después de un breve delay
      setTimeout(() => {
        setPreviewData(null);
        setFile(null);
      }, 1000);
    },
    onError: (error) => {
      console.error("Error en importación:", error);
      setImportResult({
        success: false,
        error: error.message || "Error desconocido"
      });
      toast.error(`Error al importar: ${error.message || "Error desconocido"}`, { id: "import", duration: 7000 });
    },
  });

  const validateEmployeeData = (employees) => {
    const errors = [];
    const validatedEmployees = employees.map((emp, index) => {
      const validated = { ...emp };
      
      // Validar campos requeridos
      if (!validated.employee_code) {
        errors.push(`Fila ${index + 1}: Falta código de empleado`);
      }
      if (!validated.document_number) {
        errors.push(`Fila ${index + 1}: Falta número de documento`);
      }
      if (!validated.first_name) {
        errors.push(`Fila ${index + 1}: Falta nombre`);
      }
      if (!validated.last_name) {
        errors.push(`Fila ${index + 1}: Falta apellido`);
      }
      
      // Validar y limpiar número de documento
      if (validated.document_number) {
        validated.document_number = String(validated.document_number).replace(/\D/g, '');
        const maxLength = validated.document_type === 'DNI' ? 8 : 20;
        validated.document_number = validated.document_number.slice(0, maxLength);
        
        if (validated.document_type === 'DNI' && validated.document_number.length !== 8) {
          errors.push(`Fila ${index + 1}: DNI debe tener 8 dígitos (tiene ${validated.document_number.length})`);
        }
      }
      
      // Validar y limpiar teléfonos (no son obligatorios, solo si existen)
      if (validated.mobile) {
        validated.mobile = String(validated.mobile).replace(/\D/g, '').slice(0, 9);
      }
      if (validated.phone) {
        validated.phone = String(validated.phone).replace(/\D/g, '').slice(0, 9);
      }
      if (validated.emergency_contact_phone) {
        validated.emergency_contact_phone = String(validated.emergency_contact_phone).replace(/\D/g, '').slice(0, 9);
      }
      
      // Validar y limpiar cuentas bancarias (no obligatorias)
      if (validated.bank_account) {
        validated.bank_account = String(validated.bank_account).replace(/\D/g, '').slice(0, 20);
      }
      if (validated.cci_account) {
        validated.cci_account = String(validated.cci_account).replace(/\D/g, '').slice(0, 20);
        // Solo validar longitud si hay datos
        if (validated.cci_account.length > 0 && validated.cci_account.length !== 20) {
          errors.push(`Fila ${index + 1}: CCI debe tener 20 dígitos (tiene ${validated.cci_account.length})`);
        }
      }
      if (validated.cts_account_number) {
        validated.cts_account_number = String(validated.cts_account_number).replace(/\D/g, '').slice(0, 20);
      }
      
      // Validar CUSPP solo si hay sistema de pensiones AFP
      if (validated.cuspp) {
        validated.cuspp = String(validated.cuspp).replace(/\D/g, '');
        if (validated.pension_system === 'AFP' && validated.cuspp.length > 0 && validated.cuspp.length !== 12) {
          errors.push(`Fila ${index + 1}: CUSPP de AFP debe tener 12 dígitos (tiene ${validated.cuspp.length})`);
        }
      }
      
      return validated;
    });
    
    console.log("Validación completada:", {
      total: employees.length,
      errores: errors.length,
      validados: validatedEmployees.length
    });
    
    return { validatedEmployees, errors };
  };

  const handleImport = async () => {
    console.log("🔵 handleImport llamado");
    
    if (!previewData || previewData.length === 0) {
      toast.error("No hay datos para importar");
      return;
    }

    console.log("🚀 Iniciando importación de", previewData.length, "empleados");
    console.log("Datos a importar:", previewData);
    
    // Importar directamente sin validación estricta - solo limpieza
    const cleanedEmployees = previewData.map(emp => ({
      ...emp,
      // Asegurar que los campos requeridos existan
      employee_code: emp.employee_code || '',
      document_number: emp.document_number ? String(emp.document_number).replace(/\D/g, '') : '',
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      // Limpiar campos numéricos si existen
      mobile: emp.mobile ? String(emp.mobile).replace(/\D/g, '') : undefined,
      phone: emp.phone ? String(emp.phone).replace(/\D/g, '') : undefined,
      bank_account: emp.bank_account ? String(emp.bank_account).replace(/\D/g, '') : undefined,
      cci_account: emp.cci_account ? String(emp.cci_account).replace(/\D/g, '') : undefined,
      cts_account_number: emp.cts_account_number ? String(emp.cts_account_number).replace(/\D/g, '') : undefined,
      emergency_contact_phone: emp.emergency_contact_phone ? String(emp.emergency_contact_phone).replace(/\D/g, '') : undefined,
    }));

    console.log("✅ Datos limpiados, ejecutando importación...");
    
    try {
      await importMutation.mutateAsync(cleanedEmployees);
      console.log("✅ Importación completada exitosamente");
    } catch (error) {
      console.error("❌ Error al ejecutar mutación:", error);
      toast.error("Error en la importación: " + error.message);
    }
  };

  const downloadTemplate = () => {
    // Crear el CSV con UTF-8 BOM para asegurar compatibilidad
    const BOM = '\uFEFF';
    const template = `employee_code,document_type,document_number,first_name,last_name,birth_date,gender,personal_email,work_email,mobile,phone,address,district,province,department,company,position,position_level,profession,department_name,work_unit,site,hire_date,termination_date,contract_type,base_salary,pension_system,afp_id,afp_affiliation_date,cuspp,worker_type,tax_residence,bank_name,bank_account,cci_account,cts_bank,cts_account_number,cts_currency,status,role,supervisor_name,emergency_contact_name,emergency_contact_phone,emergency_contact_relationship
EMP001,DNI,12345678,Juan,Pérez,1990-05-15,M,juan.perez@email.com,juan.perez@empresa.com,987654321,014567890,Av. Principal 123,San Isidro,Lima,Lima,Empresa Principal,Analista de Sistemas,Junior,Ingeniero de Sistemas,Sistemas,Desarrollo,Sede Central,2023-01-15,,Indeterminado,3500,AFP,afp-id-123,2023-01-10,123456789012,Empleado,Domiciliado,BCP,19100012345678,00219100012345678901,BCP,19100012345679,Soles,Activo,empleado,Carlos Manager,Rosa Pérez,987654320,Madre
EMP002,DNI,23456789,María,García,1988-08-20,F,maria.garcia@email.com,maria.garcia@empresa.com,987654322,014567891,Jr. Secundaria 456,Miraflores,Lima,Lima,Empresa Principal,Diseñadora Gráfica,Senior,Diseñadora,Marketing,Comunicaciones,Sede Central,2023-03-10,,Indeterminado,3800,ONP,,,098765432101,Empleado,Domiciliado,Interbank,20012345678901,00220012345678901234,Interbank,20012345678902,Soles,Activo,empleado,Ana Supervisor,Pedro García,987654323,Esposo
EMP003,DNI,34567890,Carlos,Rodríguez,1985-12-10,M,carlos.rodriguez@email.com,carlos.rodriguez@empresa.com,987654324,014567892,Calle Comercio 789,Surco,Lima,Lima,Empresa Principal,Gerente de Ventas,Gerente,Administrador,Ventas,Ventas Lima,Sede Central,2022-06-01,,Indeterminado,5500,AFP,afp-id-456,2022-05-25,987654321098,Empleado,Domiciliado,BBVA,20123456789012,00220123456789012345,BBVA,20123456789013,Dólares,Activo,manager,Director General,Ana Rodríguez,987654325,Esposa
EMP004,CE,001234567,Luis,Martínez,1992-03-25,M,luis.martinez@email.com,luis.martinez@empresa.com,987654326,014567893,Av. Arequipa 890,Lince,Lima,Lima,Empresa Principal,Contador,Senior,Contador Público,Contabilidad,Finanzas,Sede Central,2023-06-01,,Indeterminado,4200,AFP,afp-id-789,2023-05-28,765432109876,Empleado,Domiciliado,Scotiabank,30012345678901,00230012345678901234,Scotiabank,30012345678902,Soles,Activo,empleado,Director Financiero,Carmen Martínez,987654327,Hermana
EMP005,Pasaporte,P12345678,Ana,Torres,1995-07-10,F,ana.torres@email.com,ana.torres@empresa.com,987654328,014567894,Jr. Huancayo 234,Breña,Lima,Lima,Empresa Principal,Asistente Administrativa,Junior,Administradora,Administración,Soporte,Sede Central,2024-01-10,,Part-Time,2500,Ninguno,,,,,Empleado,Domiciliado,BCP,19200098765432,00219200098765432109,BCP,19200098765433,Soles,Activo,empleado,Gerente Administrativo,Roberto Torres,987654329,Padre
EMP006,CPP,CPP0012345,Roberto,Silva,1988-11-15,M,roberto.silva@email.com,roberto.silva@empresa.com,987654330,014567895,Calle Los Pinos 567,San Miguel,Lima,Lima,Empresa Principal,Ingeniero de Soporte,Senior,Ingeniero Electrónico,Soporte Técnico,TI,Sede Central,2022-09-01,,Indeterminado,4800,AFP,afp-id-456,2022-08-25,654321098765,Empleado,No Domiciliado,Interbank,20098765432101,00220098765432101234,Interbank,20098765432102,Dólares,Activo,empleado,Jefe de TI,Patricia Silva,987654331,Esposa`;

    const blob = new Blob([BOM + template], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_empleados.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success("Plantilla descargada correctamente");
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <PermissionGuard employee={employee} requiredRole="admin">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Importación Masiva de Empleados
            </h1>
            <p className="text-slate-600 text-lg">
              Carga múltiples empleados mediante archivo CSV
            </p>
          </div>

          {/* Template Card */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Plantilla CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-2">
                    Descarga la plantilla
                  </h3>
                  <p className="text-slate-600 text-sm mb-4">
                    Utiliza nuestra plantilla CSV con ejemplos para asegurar que los datos
                    estén en el formato correcto. Incluye todos los campos requeridos.
                  </p>
                  <ul className="text-sm text-slate-600 space-y-1 mb-4">
                    <li>• <strong>Campos requeridos:</strong> employee_code, document_number, first_name, last_name</li>
                    <li>• <strong>Formato de fechas:</strong> YYYY-MM-DD (ej: 2023-01-15)</li>
                    <li>• <strong>Separador:</strong> Usa COMAS (,) no punto y coma (;)</li>
                    <li>• <strong>Codificación:</strong> UTF-8 (la plantilla ya está en el formato correcto)</li>
                    <li>• <strong>Roles válidos:</strong> empleado, manager, admin, super_admin, hr_readonly</li>
                    <li>• <strong>Estados válidos:</strong> Activo, Suspendido, Cesado</li>
                    <li>• <strong>Tipos de documento:</strong> DNI, CE, Pasaporte, CPP</li>
                    <li>• <strong>Sistemas de pensión:</strong> AFP, ONP, Ninguno</li>
                    <li>• <strong>Tipos de contrato:</strong> Indeterminado, Plazo Fijo, Part-Time, Prácticas, SNP</li>
                    <li>• <strong>Nota:</strong> Si editas en Excel, guarda como "CSV UTF-8" al exportar</li>
                  </ul>
                </div>
                <Button
                  onClick={downloadTemplate}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Plantilla
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Upload Card */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Subir Archivo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-indigo-400 transition-colors">
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    disabled={processing}
                    className="max-w-xs mx-auto"
                  />
                  <p className="text-sm text-slate-600 mt-2">
                    Formatos aceptados: CSV, Excel (.xlsx, .xls)
                  </p>
                </div>

                {processing && (
                  <div className="flex items-center justify-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    <div>
                      <p className="text-blue-900 font-semibold">
                        {uploadProgress || "Procesando archivo..."}
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Esto puede tardar varios segundos dependiendo del tamaño
                      </p>
                    </div>
                  </div>
                )}

                {uploadError && !processing && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-red-900 font-semibold mb-1">
                        Error al procesar archivo
                      </p>
                      <p className="text-sm text-red-700">
                        {uploadError}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUploadError(null)}
                        className="mt-3 text-red-700 border-red-300 hover:bg-red-100"
                      >
                        Intentar nuevamente
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {previewData && previewData.length > 0 && (
            <Card className="border-0 shadow-lg mb-6">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Vista Previa ({previewData.length} empleados)
                  </CardTitle>
                  <Button
                    onClick={(e) => {
                      e.preventDefault();
                      console.log("🔘 Click en botón de importación");
                      handleImport();
                    }}
                    disabled={importMutation.isPending || !previewData || previewData.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importando {previewData?.length} empleados...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Confirmar Importación ({previewData?.length} empleados)
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-semibold text-slate-700">Código</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Nombre</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Email</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Cargo</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Departamento</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Rol</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.slice(0, 10).map((emp, index) => (
                        <tr key={index} className="border-b hover:bg-slate-50">
                          <td className="p-3">{emp.employee_code}</td>
                          <td className="p-3">{emp.first_name} {emp.last_name}</td>
                          <td className="p-3">{emp.work_email}</td>
                          <td className="p-3">{emp.position}</td>
                          <td className="p-3">{emp.department_name}</td>
                          <td className="p-3">
                            <Badge className="bg-indigo-100 text-indigo-700">
                              {emp.role}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.length > 10 && (
                    <p className="text-center text-slate-500 text-sm mt-4">
                      Mostrando 10 de {previewData.length} registros
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {importResult && (
            <Card className={`border-0 shadow-lg ${importResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  {importResult.success ? (
                    <>
                      <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-green-900 mb-1">
                          ¡Importación Exitosa!
                        </h3>
                        <p className="text-green-700">
                          Se importaron correctamente {importResult.count} empleados al sistema.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                        <XCircle className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-red-900 mb-1">
                          Error en la Importación
                        </h3>
                        <p className="text-red-700">
                          {importResult.error || "Ocurrió un error al importar los empleados"}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PermissionGuard>
  );
}