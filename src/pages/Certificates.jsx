import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Award, Download, FileText, Plus, Clock, 
  CheckCircle, AlertCircle, Calendar
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function Certificates() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestType, setRequestType] = useState("Certificado de Trabajo");
  const [requestDescription, setRequestDescription] = useState("");

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

  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ["certificates", employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      return await base44.entities.Certificate.filter(
        { employee_id: employee.id },
        "-created_date"
      );
    },
    enabled: !!employee?.id,
  });

  const requestCertificateMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Certificate.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["certificates"]);
      toast.success("Solicitud enviada correctamente");
      setShowRequestForm(false);
      setRequestType("Certificado de Trabajo");
      setRequestDescription("");
    },
    onError: (error) => {
      toast.error("Error al enviar la solicitud");
      console.error(error);
    },
  });

  const handleRequestSubmit = () => {
    if (!requestType) {
      toast.error("Por favor selecciona un tipo de certificado");
      return;
    }

    const requestData = {
      employee_id: employee.id,
      certificate_type: requestType,
      description: requestDescription || `Solicitud de ${requestType}`,
      requested_by_employee: true,
      status: "Solicitado",
    };

    requestCertificateMutation.mutate(requestData);
  };

  const handleDownload = (certificate) => {
    if (certificate.pdf_url) {
      window.open(certificate.pdf_url, '_blank');
    } else {
      toast.error("Certificado aún no disponible");
    }
  };

  const getStatusConfig = (status) => {
    const configs = {
      "Solicitado": {
        color: "bg-yellow-100 text-yellow-700 border-yellow-200",
        icon: Clock,
      },
      "En Proceso": {
        color: "bg-blue-100 text-blue-700 border-blue-200",
        icon: AlertCircle,
      },
      "Emitido": {
        color: "bg-green-100 text-green-700 border-green-200",
        icon: CheckCircle,
      },
    };
    return configs[status] || configs["Solicitado"];
  };

  const certificateTypes = [
    {
      type: "Certificado de Trabajo",
      description: "Documento que acredita tu relación laboral, cargo y periodo trabajado",
      icon: FileText,
      color: "bg-blue-500",
    },
    {
      type: "Constancia de Ingresos",
      description: "Certificado de tus ingresos mensuales y anuales",
      icon: Award,
      color: "bg-green-500",
    },
    {
      type: "Liquidación de Beneficios",
      description: "Detalle de CTS, gratificaciones y vacaciones",
      icon: FileText,
      color: "bg-purple-500",
    },
    {
      type: "CTS",
      description: "Constancia de depósitos de CTS realizados",
      icon: FileText,
      color: "bg-orange-500",
    },
    {
      type: "Gratificación",
      description: "Constancia de gratificaciones pagadas",
      icon: FileText,
      color: "bg-pink-500",
    },
  ];

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Certificados y Constancias
          </h1>
          <p className="text-slate-600 text-lg">
            Solicita y descarga certificados laborales
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Request Form / Certificate Types */}
          <div className="lg:col-span-2 space-y-6">
            {!showRequestForm ? (
              <>
                {/* Certificate Types Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {certificateTypes.map((cert, index) => {
                    const Icon = cert.icon;
                    return (
                      <Card 
                        key={index}
                        className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group"
                        onClick={() => {
                          setRequestType(cert.type);
                          setShowRequestForm(true);
                        }}
                      >
                        <CardContent className="p-6">
                          <div className={`w-14 h-14 ${cert.color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                            <Icon className="w-7 h-7 text-white" />
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mb-2">
                            {cert.type}
                          </h3>
                          <p className="text-slate-600 text-sm mb-4">
                            {cert.description}
                          </p>
                          <Button 
                            variant="outline" 
                            className="w-full group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:border-indigo-200"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Solicitar
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Info Card */}
                <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-blue-100 rounded-xl">
                        <AlertCircle className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 mb-2">
                          Información importante
                        </h3>
                        <ul className="text-sm text-slate-700 space-y-2">
                          <li>• Los certificados son procesados por el área de RRHH</li>
                          <li>• El tiempo de emisión es de 2 a 3 días hábiles</li>
                          <li>• Recibirás una notificación cuando esté listo</li>
                          <li>• Los certificados tienen validez oficial</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold">
                      Solicitar Certificado
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => {
                        setShowRequestForm(false);
                        setRequestDescription("");
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-6">
                    <div>
                      <Label className="text-sm font-semibold text-slate-900 mb-2 block">
                        Tipo de Certificado
                      </Label>
                      <Select value={requestType} onValueChange={setRequestType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {certificateTypes.map((cert) => (
                            <SelectItem key={cert.type} value={cert.type}>
                              {cert.type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold text-slate-900 mb-2 block">
                        Información adicional (opcional)
                      </Label>
                      <Textarea
                        placeholder="Indica detalles adicionales de tu solicitud..."
                        value={requestDescription}
                        onChange={(e) => setRequestDescription(e.target.value)}
                        rows={4}
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Ej: Necesito el certificado para trámite bancario, fecha específica requerida, etc.
                      </p>
                    </div>

                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <h4 className="font-semibold text-slate-900 mb-2">Datos del empleado:</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-slate-600">Nombre:</span>
                          <p className="font-semibold text-slate-900">
                            {employee.first_name} {employee.last_name}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-600">Documento:</span>
                          <p className="font-semibold text-slate-900">
                            {employee.document_type} {employee.document_number}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-600">Cargo:</span>
                          <p className="font-semibold text-slate-900">
                            {employee.position}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-600">Fecha de ingreso:</span>
                          <p className="font-semibold text-slate-900">
                            {employee.hire_date && format(new Date(employee.hire_date), "dd/MM/yyyy")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setShowRequestForm(false);
                          setRequestDescription("");
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                        onClick={handleRequestSubmit}
                        disabled={requestCertificateMutation.isPending}
                      >
                        {requestCertificateMutation.isPending ? "Enviando..." : "Enviar Solicitud"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* History Sidebar */}
          <div>
            <Card className="border-0 shadow-lg sticky top-8">
              <CardHeader className="border-b">
                <CardTitle className="text-xl font-bold">Mis Solicitudes</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : certificates.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 text-sm">No hay solicitudes</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {certificates.map((cert) => {
                      const StatusIcon = getStatusConfig(cert.status).icon;
                      return (
                        <div 
                          key={cert.id}
                          className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h4 className="font-semibold text-slate-900 text-sm mb-1">
                                {cert.certificate_type}
                              </h4>
                              {cert.issue_date && (
                                <p className="text-xs text-slate-600 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(cert.issue_date), "dd MMM yyyy", { locale: es })}
                                </p>
                              )}
                            </div>
                            <Badge className={getStatusConfig(cert.status).color + " text-xs"}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {cert.status}
                            </Badge>
                          </div>

                          {cert.description && (
                            <p className="text-xs text-slate-600 mb-3 line-clamp-2">
                              {cert.description}
                            </p>
                          )}

                          {cert.status === "Emitido" && cert.pdf_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => handleDownload(cert)}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Descargar
                            </Button>
                          )}

                          {cert.status === "Solicitado" && (
                            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                              ⏱ En espera de procesamiento
                            </div>
                          )}

                          {cert.status === "En Proceso" && (
                            <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-200">
                              🔄 RRHH está generando tu certificado
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}