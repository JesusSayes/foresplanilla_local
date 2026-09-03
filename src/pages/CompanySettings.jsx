import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { getPublicAssetUrl } from "@/api/apiConfig";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2, Save, Upload, Phone, Mail,
  Globe, User, CreditCard, MapPin, FileText, PenLine, X, UserCheck
} from "lucide-react";
import { toast } from "sonner";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";
import { uploadFile } from "@/services/uploadService";

export default function CompanySettings() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [logoFile, setLogoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingDelegatedSignature, setUploadingDelegatedSignature] = useState(false);
  const [formData, setFormData] = useState({
    company_name: "",
    ruc: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    logo_url: "",
    legal_representative: "",
    legal_representative_dni: "",
    legal_representative_position: "",
    legal_representative_signature_url: "",
    enable_delegated_signature: false,
    delegated_representative: "",
    delegated_representative_dni: "",
    delegated_representative_position: "",
    delegated_representative_signature_url: "",
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
  }, [currentUser]);

  const { data: companyInfo, isLoading } = useQuery({
    queryKey: ["companyInfo"],
    queryFn: async () => {
      const info = await entitiesAPI.CompanyInfo.list("-created_date");
      return info.length > 0 ? info[0] : null;
    },
  });

  useEffect(() => {
    if (companyInfo) {
      setFormData({
        company_name: companyInfo.company_name || "",
        ruc: companyInfo.ruc || "",
        address: companyInfo.address || "",
        phone: companyInfo.phone || "",
        email: companyInfo.email || "",
        website: companyInfo.website || "",
        logo_url: companyInfo.logo_url || "",
        legal_representative: companyInfo.legal_representative || "",
        legal_representative_dni: companyInfo.legal_representative_dni || "",
        legal_representative_position: companyInfo.legal_representative_position || "",
        legal_representative_signature_url: companyInfo.legal_representative_signature_url || "",
        enable_delegated_signature: companyInfo.enable_delegated_signature || false,
        delegated_representative: companyInfo.delegated_representative || "",
        delegated_representative_dni: companyInfo.delegated_representative_dni || "",
        delegated_representative_position: companyInfo.delegated_representative_position || "",
        delegated_representative_signature_url: companyInfo.delegated_representative_signature_url || "",
      });
    }
  }, [companyInfo]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (companyInfo) {
        return await entitiesAPI.CompanyInfo.update(companyInfo.id, data);
      } else {
        return await entitiesAPI.CompanyInfo.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["companyInfo"]);
      toast.success("Información de la empresa guardada correctamente");
    },
    onError: () => {
      toast.error("Error al guardar la información");
    },
  });

  const handleSignatureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen válida");
      return;
    }
    setUploadingSignature(true);
    try {
      const { file_url } = await uploadFile(file);
      setFormData(prev => ({ ...prev, legal_representative_signature_url: file_url }));
      toast.success("Firma subida correctamente");
    } catch (error) {
      toast.error("Error al subir la firma");
      console.error(error);
    } finally {
      setUploadingSignature(false);
    }
  };

  const handleDelegatedSignatureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen válida");
      return;
    }
    setUploadingDelegatedSignature(true);
    try {
      const { file_url } = await uploadFile(file);
      setFormData(prev => ({ ...prev, delegated_representative_signature_url: file_url }));
      toast.success("Firma delegada subida correctamente");
    } catch (error) {
      toast.error("Error al subir la firma delegada");
      console.error(error);
    } finally {
      setUploadingDelegatedSignature(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen válida");
      return;
    }

    setUploading(true);
    setLogoFile(file);

    try {
      const { file_url } = await uploadFile(file);
      setFormData(prev => ({ ...prev, logo_url: file_url }));
      toast.success("Logo subido correctamente");
    } catch (error) {
      toast.error("Error al subir el logo");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.company_name || !formData.ruc) {
      toast.error("El nombre y RUC son obligatorios");
      return;
    }

    saveMutation.mutate(formData);
  };

  if (!employee || isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!["admin", "super_admin"].includes(employee.role)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden configurar la empresa</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Información de la Empresa
          </h1>
          <p className="text-slate-600 text-lg">
            Configura los datos básicos de tu empresa
          </p>
        </div>

        <div className="space-y-6">
          {/* Logo */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Logo de la Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center gap-6">
                {formData.logo_url ? (
                  <div className="w-32 h-32 border-2 border-slate-200 rounded-lg overflow-hidden bg-white flex items-center justify-center">
                    <img
                      src={formData.logo_url}
                      alt="Logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50">
                    <Building2 className="w-12 h-12 text-slate-300" />
                  </div>
                )}

                <div className="flex-1">
                  <Label htmlFor="logo" className="cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 border-2 border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors w-fit">
                      <Upload className="w-4 h-4" />
                      {uploading ? "Subiendo..." : "Subir Logo"}
                    </div>
                  </Label>
                  <input
                    id="logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Formatos aceptados: PNG, JPG, SVG. Tamaño recomendado: 400x400px
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información General */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Información General
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre de la Empresa *</Label>
                  <Input
                    value={formData.company_name}
                    onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                    placeholder="Empresa S.A.C."
                  />
                </div>
                <div>
                  <Label>RUC *</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      value={formData.ruc}
                      onChange={(e) => setFormData({...formData, ruc: e.target.value})}
                      placeholder="20XXXXXXXXX"
                      className="pl-10"
                      maxLength={11}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Dirección</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                  <Textarea
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    placeholder="Av. Principal 123, Lima, Perú"
                    className="pl-10 min-h-[80px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      placeholder="(01) 123-4567"
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      placeholder="contacto@empresa.com"
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Sitio Web</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    value={formData.website}
                    onChange={(e) => setFormData({...formData, website: e.target.value})}
                    placeholder="www.empresa.com"
                    className="pl-10"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Representante Legal */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <User className="w-5 h-5" />
                Representante Legal
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre Completo</Label>
                  <Input
                    value={formData.legal_representative}
                    onChange={(e) => setFormData({...formData, legal_representative: e.target.value})}
                    placeholder="Juan Pérez García"
                  />
                </div>
                <div>
                  <Label>DNI</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      value={formData.legal_representative_dni}
                      onChange={(e) => setFormData({...formData, legal_representative_dni: e.target.value})}
                      placeholder="12345678"
                      className="pl-10"
                      maxLength={8}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Cargo</Label>
                <Input
                  value={formData.legal_representative_position}
                  onChange={(e) => setFormData({...formData, legal_representative_position: e.target.value})}
                  placeholder="Gerente General"
                />
              </div>

              {/* Firma digital */}
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <PenLine className="w-4 h-4 text-indigo-600" />
                  Firma Digital del Representante Legal
                </Label>
                <p className="text-xs text-slate-500 mb-3">
                  Esta firma se usará automáticamente en los contratos y documentos oficiales.
                </p>
                {formData.legal_representative_signature_url ? (
                  <div className="flex items-center gap-4 p-4 border border-green-200 bg-green-50 rounded-lg">
                    <img
                      src={getPublicAssetUrl(formData.legal_representative_signature_url)}
                      alt="Firma del representante legal"
                      className="h-16 object-contain border border-slate-200 bg-white rounded px-2"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">Firma registrada correctamente</p>
                      <p className="text-xs text-green-600">Se aplicará en contratos y documentos oficiales</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setFormData(prev => ({ ...prev, legal_representative_signature_url: "" }))}
                    >
                      <X className="w-4 h-4 mr-1" /> Quitar
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-6 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors w-full">
                    {uploadingSignature ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        Subiendo firma...
                      </div>
                    ) : (
                      <>
                        <PenLine className="w-8 h-8 text-slate-400 mb-2" />
                        <span className="text-sm font-medium text-slate-700">Subir imagen de firma / rúbrica</span>
                        <span className="text-xs text-slate-400 mt-1">PNG, JPG — fondo blanco o transparente recomendado</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleSignatureUpload}
                      disabled={uploadingSignature}
                    />
                  </label>
                )}
              </div>

              {/* ── Firma Delegada ── */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enable_delegated_signature}
                      onChange={(e) => setFormData({...formData, enable_delegated_signature: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <UserCheck className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-semibold text-slate-700">Habilitar Firma Delegada</span>
                  </Label>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Al habilitar esta opción, la firma del representante delegado (ej: Gerente Operativo) aparecerá como opción en el modal de firma masiva de boletas.
                </p>

                {formData.enable_delegated_signature && (
                  <div className="space-y-3 p-4 bg-purple-50/50 rounded-lg border border-purple-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Nombre del Delegado</Label>
                        <Input
                          value={formData.delegated_representative}
                          onChange={(e) => setFormData({...formData, delegated_representative: e.target.value})}
                          placeholder="Ej: Pedro Ramírez Soto"
                        />
                      </div>
                      <div>
                        <Label>DNI del Delegado</Label>
                        <div className="relative">
                          <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                          <Input
                            value={formData.delegated_representative_dni}
                            onChange={(e) => setFormData({...formData, delegated_representative_dni: e.target.value})}
                            placeholder="12345678"
                            className="pl-10"
                            maxLength={8}
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label>Cargo del Delegado</Label>
                      <Input
                        value={formData.delegated_representative_position}
                        onChange={(e) => setFormData({...formData, delegated_representative_position: e.target.value})}
                        placeholder="Gerente Operativo"
                      />
                    </div>
                    {/* Firma digital delegada */}
                    <div>
                      <Label className="flex items-center gap-2 mb-2">
                        <PenLine className="w-4 h-4 text-purple-600" />
                        Firma Digital del Delegado
                      </Label>
                      {formData.delegated_representative_signature_url ? (
                        <div className="flex items-center gap-4 p-3 border border-green-200 bg-green-50 rounded-lg">
                          <img
                            src={getPublicAssetUrl(formData.delegated_representative_signature_url)}
                            alt="Firma delegada"
                            className="h-14 object-contain border border-slate-200 bg-white rounded px-2"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-green-800">Firma delegada registrada</p>
                            <p className="text-xs text-green-600">Aparecerá en el modal de firma masiva</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setFormData(prev => ({ ...prev, delegated_representative_signature_url: "" }))}
                          >
                            <X className="w-4 h-4 mr-1" /> Quitar
                          </Button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center border-2 border-dashed border-purple-300 rounded-lg p-4 cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-colors w-full">
                          {uploadingDelegatedSignature ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                              Subiendo firma...
                            </div>
                          ) : (
                            <>
                              <PenLine className="w-6 h-6 text-purple-400 mb-1" />
                              <span className="text-sm font-medium text-slate-700">Subir firma del delegado</span>
                              <span className="text-xs text-slate-400 mt-1">PNG, JPG — fondo blanco o transparente</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleDelegatedSignatureUpload}
                            disabled={uploadingDelegatedSignature}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Guardar */}
          <div className="flex justify-end gap-3">
            <Button
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
              size="lg"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
