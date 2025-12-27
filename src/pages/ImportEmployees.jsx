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
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreviewData(null);
    setImportResult(null);
    setProcessing(true);

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ 
        file: selectedFile 
      });

      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: file_url,
        json_schema: employeeSchema
      });

      if (result.status === "success" && result.output) {
        setPreviewData(result.output);
        toast.success(`${result.output.length} empleados encontrados en el archivo`);
      } else {
        toast.error("Error al procesar el archivo: " + (result.details || "Formato inválido"));
      }
    } catch (error) {
      toast.error("Error al cargar el archivo");
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Employee.bulkCreate(data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(["allEmployees"]);
      setImportResult({
        success: true,
        count: result.length
      });
      toast.success(`${result.length} empleados importados correctamente`);
      setPreviewData(null);
      setFile(null);
    },
    onError: (error) => {
      setImportResult({
        success: false,
        error: error.message
      });
      toast.error("Error al importar empleados");
      console.error(error);
    },
  });

  const validateEmployeeData = (employees) => {
    const errors = [];
    const validatedEmployees = employees.map((emp, index) => {
      const validated = { ...emp };
      
      // Validar y limpiar número de documento
      if (validated.document_number) {
        validated.document_number = String(validated.document_number).replace(/\D/g, '');
        const maxLength = validated.document_type === 'DNI' ? 8 : 20;
        validated.document_number = validated.document_number.slice(0, maxLength);
        
        if (validated.document_type === 'DNI' && validated.document_number.length !== 8) {
          errors.push(`Fila ${index + 1}: DNI debe tener 8 dígitos`);
        }
      }
      
      // Validar y limpiar teléfonos
      if (validated.mobile) {
        validated.mobile = String(validated.mobile).replace(/\D/g, '').slice(0, 9);
      }
      if (validated.phone) {
        validated.phone = String(validated.phone).replace(/\D/g, '').slice(0, 9);
      }
      if (validated.emergency_contact_phone) {
        validated.emergency_contact_phone = String(validated.emergency_contact_phone).replace(/\D/g, '').slice(0, 9);
      }
      
      // Validar y limpiar cuentas bancarias
      if (validated.bank_account) {
        validated.bank_account = String(validated.bank_account).replace(/\D/g, '').slice(0, 20);
      }
      if (validated.cci_account) {
        validated.cci_account = String(validated.cci_account).replace(/\D/g, '').slice(0, 20);
        if (validated.cci_account.length > 0 && validated.cci_account.length !== 20) {
          errors.push(`Fila ${index + 1}: CCI debe tener 20 dígitos`);
        }
      }
      if (validated.cts_account_number) {
        validated.cts_account_number = String(validated.cts_account_number).replace(/\D/g, '').slice(0, 20);
      }
      
      // Validar CUSPP
      if (validated.cuspp) {
        validated.cuspp = String(validated.cuspp).replace(/\D/g, '');
        if (validated.pension_system === 'AFP' && validated.cuspp.length !== 12) {
          errors.push(`Fila ${index + 1}: CUSPP de AFP debe tener 12 dígitos`);
        }
      }
      
      return validated;
    });
    
    return { validatedEmployees, errors };
  };

  const handleImport = () => {
    if (!previewData || previewData.length === 0) {
      toast.error("No hay datos para importar");
      return;
    }

    const { validatedEmployees, errors } = validateEmployeeData(previewData);
    
    if (errors.length > 0) {
      toast.error(`Errores de validación encontrados:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... y ${errors.length - 5} más` : ''}`);
      return;
    }

    importMutation.mutate(validatedEmployees);
  };

  const downloadTemplate = () => {
    const template = `employee_code,document_type,document_number,first_name,last_name,birth_date,gender,personal_email,work_email,mobile,phone,address,district,province,department,company,position,position_level,profession,department_name,work_unit,site,hire_date,termination_date,contract_type,base_salary,pension_system,afp_id,afp_affiliation_date,cuspp,worker_type,tax_residence,bank_name,bank_account,cci_account,cts_bank,cts_account_number,cts_currency,status,role,supervisor_name,emergency_contact_name,emergency_contact_phone,emergency_contact_relationship
EMP001,DNI,12345678,Juan,Pérez,1990-05-15,M,juan.perez@email.com,juan.perez@empresa.com,987654321,014567890,Av. Principal 123,San Isidro,Lima,Lima,Empresa Principal,Analista de Sistemas,Junior,Ingeniero de Sistemas,Sistemas,Desarrollo,Sede Central,2023-01-15,,Indeterminado,3500,AFP,afp-id-123,2023-01-10,123456789012,Empleado,Domiciliado,BCP,19100012345678,00219100012345678901,BCP,19100012345679,Soles,Activo,empleado,Carlos Manager,Rosa Pérez,987654320,Madre
EMP002,DNI,23456789,María,García,1988-08-20,F,maria.garcia@email.com,maria.garcia@empresa.com,987654322,014567891,Jr. Secundaria 456,Miraflores,Lima,Lima,Empresa Principal,Diseñadora Gráfica,Senior,Diseñadora,Marketing,Comunicaciones,Sede Central,2023-03-10,,Indeterminado,3800,ONP,,,098765432101,Empleado,Domiciliado,Interbank,20012345678901,00220012345678901234,Interbank,20012345678902,Soles,Activo,empleado,Ana Supervisor,Pedro García,987654323,Esposo
EMP003,DNI,34567890,Carlos,Rodríguez,1985-12-10,M,carlos.rodriguez@email.com,carlos.rodriguez@empresa.com,987654324,014567892,Calle Comercio 789,Surco,Lima,Lima,Empresa Principal,Gerente de Ventas,Gerente,Administrador,Ventas,Ventas Lima,Sede Central,2022-06-01,,Indeterminado,5500,AFP,afp-id-456,2022-05-25,987654321098,Empleado,Domiciliado,BBVA,20123456789012,00220123456789012345,BBVA,20123456789013,Dólares,Activo,manager,Director General,Ana Rodríguez,987654325,Esposa`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_empleados.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success("Plantilla descargada");
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
                    <li>• <strong>Roles válidos:</strong> empleado, manager, admin, super_admin, hr_readonly</li>
                    <li>• <strong>Estados válidos:</strong> Activo, Suspendido, Cesado</li>
                    <li>• <strong>Tipos de documento:</strong> DNI, CE, Pasaporte</li>
                    <li>• <strong>Sistemas de pensión:</strong> AFP, ONP, Ninguno</li>
                    <li>• <strong>Tipos de contrato:</strong> Indeterminado, Plazo Fijo, Part-Time, Prácticas, SNP</li>
                    <li>• <strong>Tipos de trabajador:</strong> Empleado, Obrero, Practicante, Directivo</li>
                    <li>• <strong>Residencia tributaria:</strong> Domiciliado, No Domiciliado</li>
                    <li>• <strong>Moneda CTS:</strong> Soles, Dólares</li>
                    <li>• <strong>DNI:</strong> Exactamente 8 dígitos</li>
                    <li>• <strong>Celulares/Teléfonos:</strong> Máximo 9 dígitos</li>
                    <li>• <strong>CCI:</strong> Exactamente 20 dígitos</li>
                    <li>• <strong>CUSPP AFP:</strong> Exactamente 12 dígitos</li>
                    <li>• <strong>Cuentas bancarias:</strong> Máximo 20 dígitos</li>
                    <li>• <strong>Nota:</strong> Todos los campos numéricos se validarán automáticamente</li>
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
                    <span className="text-blue-900 font-semibold">
                      Procesando archivo...
                    </span>
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
                    onClick={handleImport}
                    disabled={importMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {importMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Confirmar Importación
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