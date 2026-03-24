import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Trash2, Plus, Edit, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
// import { base44 } from "@/api/base44Client";
import { usePermissions } from "../hooks/usePermissions";
import { uploadFile } from "@/services/uploadService";

export default function EmployeeForm({
  editingEmployee,
  formData,
  setFormData,
  onSubmit,
  onCancel,
  isSubmitting,
  sites,
  positions,
  departments,
  banks,
  afps,
  ubigeos,
  professions,
  allContracts,
  derechohabientes,
  onDerechohabienteAdd,
  onDerechohabienteEdit,
  onDerechohabienteDelete,
}) {
  const { hasPermission } = usePermissions();
  const [positionSearchTerm, setPositionSearchTerm] = React.useState("");
  const [departmentSearchTerm, setDepartmentSearchTerm] = React.useState("");
  const [professionSearchTerm, setProfessionSearchTerm] = React.useState("");
  const [bankSearchTerm, setBankSearchTerm] = React.useState("");
  const [ctsBankSearchTerm, setCtsBankSearchTerm] = React.useState("");
  const [deptoSearchTerm, setDeptoSearchTerm] = React.useState("");
  const [provSearchTerm, setProvSearchTerm] = React.useState("");
  const [distSearchTerm, setDistSearchTerm] = React.useState("");
  const [selectedDepartamento, setSelectedDepartamento] = React.useState(editingEmployee?.department || "");
  const [selectedProvincia, setSelectedProvincia] = React.useState(editingEmployee?.province || "");
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [showDerechohabienteForm, setShowDerechohabienteForm] = React.useState(false);
  const [editingDH, setEditingDH] = React.useState(null);
  const [dhFormData, setDhFormData] = React.useState({});

  const departamentos = [...new Set(ubigeos.map(u => u.departamento))].sort();
  const provincias = selectedDepartamento
    ? [...new Set(ubigeos.filter(u => u.departamento === selectedDepartamento).map(u => u.provincia))].sort()
    : [];
  const distritos = selectedProvincia
    ? [...new Set(ubigeos.filter(u => u.departamento === selectedDepartamento && u.provincia === selectedProvincia).map(u => u.distrito))].sort()
    : [];

  const calculateAge = (birthDate) => {
    if (!birthDate) return "";
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const vigentContract = editingEmployee
    ? allContracts.find(c => c.employee_id === editingEmployee.id && c.status === "Vigente")
    : null;

  const handleSaveDH = () => {
    if (!dhFormData.document_number || !dhFormData.first_name || !dhFormData.last_name || !dhFormData.birth_date) {
      toast.error("Complete los campos obligatorios");
      return;
    }
    if (editingDH) {
      onDerechohabienteEdit(editingDH.id, dhFormData);
    } else {
      onDerechohabienteAdd({ ...dhFormData, employee_id: editingEmployee.id });
    }
    setShowDerechohabienteForm(false);
    setEditingDH(null);
    setDhFormData({});
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto">
      <Card className="max-w-5xl w-full my-8">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">
              {editingEmployee ? "Editar Empleado" : "Nuevo Empleado"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 max-h-[70vh] overflow-y-auto">
          <Tabs defaultValue="personal" className="space-y-6">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="contact">Contacto</TabsTrigger>
              <TabsTrigger value="work">Laboral</TabsTrigger>
              <TabsTrigger value="financial" disabled={!hasPermission("employees.view_financials")}>
                Financiero{!hasPermission("employees.view_financials") ? " 🔒" : ""}
              </TabsTrigger>
              <TabsTrigger value="emergency">Emergencia</TabsTrigger>
              <TabsTrigger value="derechohabientes" disabled={!editingEmployee}>Derechohabientes</TabsTrigger>
            </TabsList>

            {/* PERSONAL */}
            <TabsContent value="personal" className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <p className="text-sm text-amber-800"><strong>Los campos marcados con <span className="text-red-600">*</span> son obligatorios</strong></p>
              </div>
              <div className="flex gap-4">
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Código de Empleado <span className="text-red-600">*</span></Label>
                      <Input value={formData.employee_code} onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })} className={!formData.employee_code ? "border-red-300" : ""} />
                    </div>
                    <div>
                      <Label>Tipo de Documento <span className="text-red-600">*</span></Label>
                      <Select value={formData.document_type} onValueChange={(v) => setFormData({ ...formData, document_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DNI">DNI</SelectItem>
                          <SelectItem value="CE">CE</SelectItem>
                          <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                          <SelectItem value="CPP">CPP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Número de Documento <span className="text-red-600">*</span></Label>
                      <Input
                        value={formData.document_number}
                        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setFormData({ ...formData, document_number: v.slice(0, formData.document_type === 'DNI' ? 8 : 20) }); }}
                        className={!formData.document_number ? "border-red-300" : ""}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Nombres <span className="text-red-600">*</span></Label>
                      <Input value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className={!formData.first_name ? "border-red-300" : ""} />
                    </div>
                    <div>
                      <Label>Apellidos <span className="text-red-600">*</span></Label>
                      <Input value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className={!formData.last_name ? "border-red-300" : ""} />
                    </div>
                    <div>
                      <Label>Género</Label>
                      <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M">Masculino</SelectItem>
                          <SelectItem value="F">Femenino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Fecha de Nacimiento</Label>
                      <Input type="date" value={formData.birth_date} onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })} />
                    </div>
                    <div>
                      <Label>Edad</Label>
                      <Input value={formData.birth_date ? `${calculateAge(formData.birth_date)} años` : ""} disabled className="bg-slate-100" />
                    </div>
                    <div>
                      <Label>Profesión</Label>
                      <Select value={formData.profession} onValueChange={(v) => setFormData({ ...formData, profession: v })}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        <SelectContent>
                          <div className="p-2 border-b sticky top-0 bg-white z-10">
                            <Input placeholder="Buscar..." value={professionSearchTerm} onChange={(e) => setProfessionSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
                          </div>
                          {professions.filter(p => p.name.toLowerCase().includes(professionSearchTerm.toLowerCase())).map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="w-[150px] flex-shrink-0">
                  <Label className="text-xs">Foto</Label>
                  <div className="mt-2">
                    {formData.photo_url ? (
                      <div className="relative group">
                        <img src={`${import.meta.env.VITE_API_URL}${formData.photo_url}`} alt="Foto" className="w-[150px] h-[150px] rounded-lg object-cover border-2 border-indigo-200" />
                        <Button size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100" onClick={() => setFormData({ ...formData, photo_url: "" })}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="w-[150px] h-[150px] border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50">
                        <Users className="w-12 h-12 text-slate-400" />
                      </div>
                    )}
                    <Input type="file" accept="image/*" disabled={uploadingPhoto} className="mt-2 text-xs h-8"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingPhoto(true);
                        try {
                          // const { file_url } = await base44.integrations.Core.UploadFile({ file });
                          const { file_url } = await uploadFile(file);
                          setFormData({ ...formData, photo_url: file_url });
                          toast.success("Foto subida");
                        } catch { toast.error("Error al subir la foto"); } finally { setUploadingPhoto(false); }
                      }}
                    />
                    {uploadingPhoto && <p className="text-xs text-blue-600 mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Subiendo...</p>}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* CONTACT */}
            <TabsContent value="contact" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email Personal</Label><Input type="email" value={formData.personal_email} onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })} /></div>
                <div><Label>Email Corporativo</Label><Input type="email" value={formData.work_email} onChange={(e) => setFormData({ ...formData, work_email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Teléfono</Label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g,'').slice(0,9) })} /></div>
                <div><Label>Celular</Label><Input value={formData.mobile} onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g,'').slice(0,9) })} /></div>
              </div>
              <div><Label>Dirección</Label><Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Departamento</Label>
                  <Select value={selectedDepartamento} onValueChange={(v) => { setSelectedDepartamento(v); setSelectedProvincia(""); setFormData({ ...formData, department: v, province: "", district: "" }); }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-2 border-b sticky top-0 bg-white z-10"><Input placeholder="Buscar..." value={deptoSearchTerm} onChange={(e) => setDeptoSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} /></div>
                      {departamentos.filter(d => d.toLowerCase().includes(deptoSearchTerm.toLowerCase())).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Provincia</Label>
                  <Select value={selectedProvincia} onValueChange={(v) => { setSelectedProvincia(v); setFormData({ ...formData, province: v, district: "" }); }} disabled={!selectedDepartamento}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-2 border-b sticky top-0 bg-white z-10"><Input placeholder="Buscar..." value={provSearchTerm} onChange={(e) => setProvSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} /></div>
                      {provincias.filter(p => p.toLowerCase().includes(provSearchTerm.toLowerCase())).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Distrito</Label>
                  <Select value={formData.district} onValueChange={(v) => setFormData({ ...formData, district: v })} disabled={!selectedProvincia}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-2 border-b sticky top-0 bg-white z-10"><Input placeholder="Buscar..." value={distSearchTerm} onChange={(e) => setDistSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} /></div>
                      {distritos.filter(d => d.toLowerCase().includes(distSearchTerm.toLowerCase())).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* WORK */}
            <TabsContent value="work" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Empresa</Label><Input value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} /></div>
                <div>
                  <Label>Sede</Label>
                  <Select value={formData.site} onValueChange={(v) => setFormData({ ...formData, site: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar sede" /></SelectTrigger>
                    <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Cargo</Label>
                  <Select value={formData.position} onValueChange={(v) => setFormData({ ...formData, position: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-2 border-b sticky top-0 bg-white z-10"><Input placeholder="Buscar..." value={positionSearchTerm} onChange={(e) => setPositionSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} /></div>
                      {positions.filter(p => p.name.toLowerCase().includes(positionSearchTerm.toLowerCase())).map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Nivel</Label><Input value={formData.position_level} onChange={(e) => setFormData({ ...formData, position_level: e.target.value })} /></div>
                <div>
                  <Label>Tipo de Contrato</Label>
                  <Select value={formData.contract_type} onValueChange={(v) => setFormData({ ...formData, contract_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Indeterminado">Indeterminado</SelectItem>
                      <SelectItem value="Plazo Fijo">Plazo Fijo</SelectItem>
                      <SelectItem value="Part-Time">Part-Time</SelectItem>
                      <SelectItem value="Prácticas">Prácticas</SelectItem>
                      <SelectItem value="SNP">SNP</SelectItem>
                    </SelectContent>
                  </Select>
                  {vigentContract ? <p className="text-xs text-indigo-600 mt-1">Contrato vigente: {vigentContract.contract_type}</p> : <p className="text-xs text-amber-600 mt-1">Sin contrato vigente</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Área/Departamento</Label>
                  <Select value={formData.department_name} onValueChange={(v) => setFormData({ ...formData, department_name: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-2 border-b sticky top-0 bg-white z-10"><Input placeholder="Buscar..." value={departmentSearchTerm} onChange={(e) => setDepartmentSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} /></div>
                      {departments.filter(d => d.name.toLowerCase().includes(departmentSearchTerm.toLowerCase())).map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Unidad de Trabajo</Label><Input value={formData.work_unit} onChange={(e) => setFormData({ ...formData, work_unit: e.target.value })} /></div>
                <div><Label>Supervisor Directo</Label><Input value={formData.supervisor_name} onChange={(e) => setFormData({ ...formData, supervisor_name: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Fecha de Ingreso</Label><Input type="date" value={formData.hire_date} onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })} /></div>
                <div><Label>Fecha de Cese</Label><Input type="date" value={formData.termination_date} onChange={(e) => setFormData({ ...formData, termination_date: e.target.value })} /></div>
                <div>
                  <Label>Estado</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Activo">Activo</SelectItem>
                      <SelectItem value="Suspendido">Suspendido</SelectItem>
                      <SelectItem value="Cesado">Cesado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* FINANCIAL */}
            <TabsContent value="financial" className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Sistema de Pensiones</Label>
                  <Select value={formData.pension_system || "Ninguno"} onValueChange={(v) => setFormData({ ...formData, pension_system: v, afp_id: v === "AFP" ? formData.afp_id : "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ninguno">Ninguno</SelectItem>
                      <SelectItem value="AFP">AFP</SelectItem>
                      <SelectItem value="ONP">ONP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.pension_system === "AFP" && (
                  <>
                    <div>
                      <Label>AFP Afiliada</Label>
                      <Select value={formData.afp_id || ""} onValueChange={(v) => setFormData({ ...formData, afp_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar AFP" /></SelectTrigger>
                        <SelectContent>{afps.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Fecha Afiliación AFP</Label><Input type="date" value={formData.afp_affiliation_date} onChange={(e) => setFormData({ ...formData, afp_affiliation_date: e.target.value })} /></div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Banco</Label>
                  <Select value={formData.bank_name} onValueChange={(v) => setFormData({ ...formData, bank_name: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-2 border-b sticky top-0 bg-white z-10"><Input placeholder="Buscar..." value={bankSearchTerm} onChange={(e) => setBankSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} /></div>
                      {banks.filter(b => b.name.toLowerCase().includes(bankSearchTerm.toLowerCase())).map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>N° de Cuenta</Label><Input value={formData.bank_account} onChange={(e) => setFormData({ ...formData, bank_account: e.target.value.replace(/\D/g,'').slice(0,20) })} /></div>
                <div><Label>CCI</Label><Input value={formData.cci_account} onChange={(e) => setFormData({ ...formData, cci_account: e.target.value.replace(/\D/g,'').slice(0,20) })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Banco CTS</Label>
                  <Select value={formData.cts_bank} onValueChange={(v) => setFormData({ ...formData, cts_bank: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <div className="p-2 border-b sticky top-0 bg-white z-10"><Input placeholder="Buscar..." value={ctsBankSearchTerm} onChange={(e) => setCtsBankSearchTerm(e.target.value)} className="h-8" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} /></div>
                      {banks.filter(b => b.name.toLowerCase().includes(ctsBankSearchTerm.toLowerCase())).map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>N° Cuenta CTS</Label><Input value={formData.cts_account_number} onChange={(e) => setFormData({ ...formData, cts_account_number: e.target.value.replace(/\D/g,'').slice(0,20) })} /></div>
                <div>
                  <Label>Moneda CTS</Label>
                  <Select value={formData.cts_currency} onValueChange={(v) => setFormData({ ...formData, cts_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Soles">Soles</SelectItem><SelectItem value="Dólares">Dólares</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* EMERGENCY */}
            <TabsContent value="emergency" className="space-y-4">
              <div><Label>Nombre del Contacto</Label><Input value={formData.emergency_contact_name} onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Teléfono</Label><Input value={formData.emergency_contact_phone} onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value.replace(/\D/g,'').slice(0,9) })} /></div>
                <div><Label>Relación</Label><Input placeholder="Ej: Madre, Esposo/a" value={formData.emergency_contact_relationship} onChange={(e) => setFormData({ ...formData, emergency_contact_relationship: e.target.value })} /></div>
              </div>
            </TabsContent>

            {/* DERECHOHABIENTES */}
            <TabsContent value="derechohabientes" className="space-y-4">
              {editingEmployee && (
                <>
                  <div className="flex justify-end">
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setDhFormData({ employee_id: editingEmployee.id, document_type: "DNI", document_number: "", first_name: "", last_name: "", gender: "M", birth_date: "", relationship: "Hijo/a", registration_date: new Date().toISOString().split('T')[0], is_active: true }); setEditingDH(null); setShowDerechohabienteForm(true); }}>
                      <Plus className="w-4 h-4 mr-2" />Agregar Derechohabiente
                    </Button>
                  </div>
                  {derechohabientes.length === 0 ? (
                    <p className="text-center py-8 text-slate-500">No hay derechohabientes registrados</p>
                  ) : (
                    <div className="space-y-3">
                      {derechohabientes.map(dh => (
                        <div key={dh.id} className="p-4 border rounded-lg hover:bg-slate-50">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-slate-900">{dh.first_name} {dh.last_name}</h4>
                              <div className="grid grid-cols-2 gap-4 mt-2 text-sm text-slate-600">
                                <span><strong>Documento:</strong> {dh.document_type} {dh.document_number}</span>
                                <span><strong>Relación:</strong> {dh.relationship}</span>
                                <span><strong>Nacimiento:</strong> {dh.birth_date ? format(new Date(dh.birth_date), "dd/MM/yyyy") : "N/A"}</span>
                                <span><strong>Edad:</strong> {calculateAge(dh.birth_date)} años</span>
                              </div>
                              <Badge className={`mt-2 ${dh.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{dh.is_active ? "Activo" : "Inactivo"}</Badge>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => { setDhFormData(dh); setEditingDH(dh); setShowDerechohabienteForm(true); }}><Edit className="w-4 h-4" /></Button>
                              <Button size="sm" variant="outline" className="text-red-600" onClick={() => { if(confirm("¿Eliminar?")) onDerechohabienteDelete(dh.id); }}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showDerechohabienteForm && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-6">
                      <Card className="max-w-2xl w-full">
                        <CardHeader className="border-b">
                          <div className="flex items-center justify-between">
                            <CardTitle>{editingDH ? "Editar" : "Agregar"} Derechohabiente</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => { setShowDerechohabienteForm(false); setEditingDH(null); setDhFormData({}); }}>✕</Button>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div><Label>Tipo Doc *</Label>
                              <Select value={dhFormData.document_type} onValueChange={(v) => setDhFormData({...dhFormData, document_type: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="DNI">DNI</SelectItem><SelectItem value="CE">CE</SelectItem><SelectItem value="Pasaporte">Pasaporte</SelectItem><SelectItem value="Partida de Nacimiento">Partida de Nac.</SelectItem></SelectContent>
                              </Select>
                            </div>
                            <div><Label>N° Documento *</Label><Input value={dhFormData.document_number} onChange={(e) => setDhFormData({...dhFormData, document_number: e.target.value.replace(/\D/g,'')})} /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div><Label>Nombres *</Label><Input value={dhFormData.first_name} onChange={(e) => setDhFormData({...dhFormData, first_name: e.target.value})} /></div>
                            <div><Label>Apellidos *</Label><Input value={dhFormData.last_name} onChange={(e) => setDhFormData({...dhFormData, last_name: e.target.value})} /></div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div><Label>Género</Label>
                              <Select value={dhFormData.gender} onValueChange={(v) => setDhFormData({...dhFormData, gender: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="M">Masculino</SelectItem><SelectItem value="F">Femenino</SelectItem></SelectContent>
                              </Select>
                            </div>
                            <div><Label>Fecha Nacimiento *</Label><Input type="date" value={dhFormData.birth_date} onChange={(e) => setDhFormData({...dhFormData, birth_date: e.target.value})} /></div>
                            <div><Label>Relación</Label>
                              <Select value={dhFormData.relationship} onValueChange={(v) => setDhFormData({...dhFormData, relationship: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="Cónyuge">Cónyuge</SelectItem><SelectItem value="Hijo/a">Hijo/a</SelectItem><SelectItem value="Padre">Padre</SelectItem><SelectItem value="Madre">Madre</SelectItem><SelectItem value="Otro">Otro</SelectItem></SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex gap-3 pt-4 border-t">
                            <Button variant="outline" className="flex-1" onClick={() => { setShowDerechohabienteForm(false); setEditingDH(null); setDhFormData({}); }}>Cancelar</Button>
                            <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={handleSaveDH}>Guardar</Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex gap-3 mt-6 pt-6 border-t">
            <Button variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
            <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={onSubmit} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{editingEmployee ? "Actualizando..." : "Creando..."}</> : <>{editingEmployee ? "Actualizar" : "Crear"} Empleado</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
