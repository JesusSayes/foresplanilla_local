import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Users, DollarSign, Eye, Printer, ChevronRight,
  CheckCircle, Search, Calendar, ArrowLeft, Settings,
  Loader2, BookOpen, AlertCircle, X, PenTool
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import PayslipPreview, { buildBoletaInner, BOLETA_CSS } from "../components/payroll/PayslipPreview";
import PlanillaCompletaView from "../components/payroll/PlanillaCompletaView";
import ConfigFirmantesModal from "../components/payroll/ConfigFirmantesModal";
import FirmarBoletasModal from "../components/payroll/FirmarBoletasModal";
import PrintBoletasModal from "../components/payroll/PrintBoletasModal";
import { safePayrollNumber, formatMoney, roundMoney } from "@/lib/payrollUtils";
import { parseDateLima } from "@/lib/dateUtils";

const TIPO_COLORS = {
  Quincenal:    "bg-blue-100 text-blue-700 border-blue-200",
  Mensual:      "bg-green-100 text-green-700 border-green-200",
  Adicional:    "bg-purple-100 text-purple-700 border-purple-200",
  SNP:          "bg-orange-100 text-orange-700 border-orange-200",
  CTS:          "bg-teal-100 text-teal-700 border-teal-200",
  Gratificacion:"bg-pink-100 text-pink-700 border-pink-200",
};

const STATUS_COLORS = {
  Generada:  "bg-yellow-100 text-yellow-700",
  Calculada: "bg-yellow-100 text-yellow-700",
  Aprobada:  "bg-blue-100 text-blue-700",
  Pagada:    "bg-green-100 text-green-700",
  default:   "bg-slate-100 text-slate-700",
};

// Deriva el status consolidado del grupo a partir de sus boletas
const getGrupoStatus = (payslips) => {
  if (!payslips || payslips.length === 0) return "Calculada";
  if (payslips.every(p => p.status === "Pagada")) return "Pagada";
  if (payslips.every(p => p.status === "Aprobada" || p.status === "Pagada")) return "Aprobada";
  if (payslips.some(p => p.status === "Aprobada")) return "Aprobada";
  return "Calculada";
};

export default function ConsultaPlanillas() {
  const { user: currentUser } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [firmantes, setFirmantes] = useState(null);

  // Filtros cabecera
  const [filterYear, setFilterYear]   = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterTipo, setFilterTipo]   = useState("all");
  const [searchTerm, setSearchTerm]   = useState("");

  // Vista activa
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [previewPayslip, setPreviewPayslip] = useState(null);
  const [showPlanillaCompleta, setShowPlanillaCompleta] = useState(false);
  const [showConfigFirmantes, setShowConfigFirmantes] = useState(false);
  const [showFirmarModal, setShowFirmarModal] = useState(null); // grupo a firmar
  const [showPrintBoletasModal, setShowPrintBoletasModal] = useState(null); // grupo a imprimir masivo
  const [generatingAsiento, setGeneratingAsiento] = useState(null); // payroll_number en proceso
  const [balanceAlert, setBalanceAlert] = useState(null); // { period, payrollType, issues: [{employee, debe, haber, diferencia}] }

  const queryClient = useQueryClient();

  useEffect(() => {
    if (currentUser?.email) {
      entitiesAPI.Employee.filter({ work_email: currentUser.email }).then(emps => {
        if (emps?.length > 0) setEmployee(emps[0]);
      });

      entitiesAPI.CompanyInfo.filter({ is_active: true }).then(res => {
        if (res?.length > 0) {
          const ci = res[0];
          setCompanyInfo(ci);
          try {
            const gg = ci.firmante_gg ? JSON.parse(ci.firmante_gg) : null;
            const del = ci.firmante_delegado ? JSON.parse(ci.firmante_delegado) : null;

            if (gg || del) { setFirmantes({ firmante_gg: gg, firmante_delegado: del }); }
          } catch (e) {
            console.log("Error parseando firmantes");
          }
        }
      });
    }
  }, [currentUser]);

  const { data: allPayslips = [], isLoading } = useQuery({
    queryKey: ["allPayslipsConsulta"],
    queryFn: () => entitiesAPI.Payslip.list("-created_date", 5000),
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployeesConsulta"],
    queryFn: () => entitiesAPI.Employee.list("-created_date"),
  });

  const { data: allAsientos = [] } = useQuery({
    queryKey: ["asientosContablesConsulta"],
    queryFn: () => entitiesAPI.AsientoContable.list("-fecha_registro", 5000),
  });

  const { data: costCenterAssignments = [] } = useQuery({
    queryKey: ["ccAssignmentsConsulta"],
    queryFn: () => entitiesAPI.CostCenterAssignment.list("-created_date"),
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ["costCentersConsulta"],
    queryFn: () => entitiesAPI.CostCenter.list("code"),
  });

  const { data: tiposAnexo = [] } = useQuery({
    queryKey: ["tiposAnexoConsulta"],
    queryFn: () => entitiesAPI.TipoAnexo.list("codigo_tipo_anexo"),
  });

  const { data: subdiariosCatalog = [] } = useQuery({
    queryKey: ["subdiariosConsulta"],
    queryFn: () => entitiesAPI.Subdiario.list("codigo"),
  });

  // AFP y conceptos necesarios para generar el HTML fiel de cada boleta
  const { data: afpList = [] } = useQuery({
    queryKey: ["afpListConsulta"],
    queryFn: () => entitiesAPI.AFP.list(),
  });
  const { data: payrollConcepts = [] } = useQuery({
    queryKey: ["payrollConceptsConsulta"],
    queryFn: () => entitiesAPI.PayrollConcept.list("-created_date"),
  });

  // Devuelve el código de tipo de anexo según su descripción (TRABAJADORES, HONORARIOS, etc.)
  const getTipoAnexoCodigo = (descripcion) => {
    const found = tiposAnexo.find(
      t => String(t.descripcion || "").trim().toUpperCase() === descripcion.toUpperCase()
        && (t.estado || "A") === "A"
    );
    return found?.codigo_tipo_anexo || "";
  };

  // Agrupar boletas en cabeceras de planilla
  const grupos = React.useMemo(() => {
    const map = {};
    allPayslips.forEach(p => {
      const key = `${p.year}-${String(p.month).padStart(2,"0")}-${p.payroll_type}-${p.payroll_number || ""}`;
      if (!map[key]) {
        map[key] = {
          key,
          year: p.year,
          month: p.month,
          payroll_type: p.payroll_type,
          payroll_number: p.payroll_number || `${p.payroll_type}-${p.year}-${String(p.month).padStart(2,"0")}`,
          period: p.period || format(new Date(p.year, p.month - 1), "MMMM yyyy", { locale: es }),
          attendance_period_start: p.attendance_period_start || null,
          attendance_period_end: p.attendance_period_end || null,
          payslips: [],
        };
      }
      map[key].payslips.push(p);
    });
    // Calcular status consolidado para cada grupo
    Object.values(map).forEach(g => { g.status = getGrupoStatus(g.payslips); });
    return Object.values(map).sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      if (b.month !== a.month) return b.month - a.month;
      return a.payroll_type.localeCompare(b.payroll_type);
    });
  }, [allPayslips]);

  // Filtrar grupos
  const filteredGrupos = grupos.filter(g => {
    const matchYear  = g.year === filterYear;
    const matchMonth = filterMonth === "all" || g.month === parseInt(filterMonth);
    const matchTipo  = filterTipo  === "all" || g.payroll_type === filterTipo;
    const matchSearch = !searchTerm || g.period.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.payroll_number?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchYear && matchMonth && matchTipo && matchSearch;
  });

  // Estadísticas del año seleccionado
  const gruposAnio = grupos.filter(g => g.year === filterYear);
  const totalAnio  = gruposAnio.reduce((s, g) => s + g.payslips.reduce((ss, p) => ss + safePayrollNumber(p.net_pay), 0), 0);
  const totalEmps  = new Set(gruposAnio.flatMap(g => g.payslips.map(p => p.employee_id))).size;

  const availableYears = [...new Set(allPayslips.map(p => p.year))].sort((a, b) => b - a);
  if (!availableYears.includes(new Date().getFullYear())) availableYears.unshift(new Date().getFullYear());

  const getGrupoStats = (g) => ({
    empleados:   g.payslips.length,
    totalIncome: g.payslips.reduce((s, p) => s + safePayrollNumber(p.total_income), 0),
    totalDesc:   g.payslips.reduce((s, p) => s + safePayrollNumber(p.total_deductions), 0),
    totalNeto:   g.payslips.reduce((s, p) => s + safePayrollNumber(p.net_pay), 0),
  });

  // Totales dinámicos calculados directo sobre payslips de los grupos filtrados
  const filteredTotals = useMemo(() => {
    const allPs = filteredGrupos.flatMap(g => g.payslips);
    return {
      empleados:    filteredGrupos.reduce((s, g) => s + g.payslips.length, 0),
      totalIncome:  allPs.reduce((s, p) => s + (Number(p.total_income)      || 0), 0),
      totalDesc:    allPs.reduce((s, p) => s + (Number(p.total_deductions)  || 0), 0),
      totalNeto:    allPs.reduce((s, p) => s + (Number(p.net_pay)           || 0), 0),
    };
  }, [filteredGrupos]);

  // Verifica si un grupo ya tiene asientos generados
  const getGrupoAsientoStatus = (grupo) => {
    const existing = allAsientos.filter(
      a => a.payroll_period === grupo.period && a.payroll_type === grupo.payroll_type &&
        (a.origen === "Planilla" || a.origen === "Otro")
    );
    if (existing.length > 0) return "Generado";
    return null;
  };

  // Genera o actualiza asientos contables agrupados por centro de costo
  // Para SNP: genera un asiento individual por cada trabajador (Recibo de Honorarios)
  const handleGenerarAsiento = async (grupo) => {
    setGeneratingAsiento(grupo.key);
    try {
      const period = grupo.period;
      const payrollType = grupo.payroll_type;
      const isSNP = payrollType === "SNP";
      const annomes = `${grupo.year}${String(grupo.month).padStart(2, "0")}`;
      const fechaDoc = format(new Date(grupo.year, grupo.month, 0), "yyyy-MM-dd");
      const fechaRegistro = format(new Date(), "yyyy-MM-dd");
      // Comprobante: correlativo de 4 dígitos por trabajador dentro del período
      // (0001, 0002, ...). Se reinicia cada período (mes). El subdiario y annomes
      // conservan el tipo de planilla y el período completo.

      // Obtener el código de empresa activo y la homologación de cuentas por concepto
      // desde la configuración Starsoft activa. Si no hay configuración activa o no
      // tiene código de empresa, se interrumpe la generación (no se asume "003").
      let codEmpresaActiva = null;
      let cuentasConcepto = [];
      let subdiariosPorPlanilla = [];
      try {
        const configs = await entitiesAPI.StarsoftConfig.filter({ is_active: true });
        if (configs && configs.length > 0 && configs[0].cod_empresa) {
          codEmpresaActiva = String(configs[0].cod_empresa);
          cuentasConcepto = Array.isArray(configs[0].cuentas_por_concepto) ? configs[0].cuentas_por_concepto : [];
          subdiariosPorPlanilla = Array.isArray(configs[0].subdiarios_por_planilla) ? configs[0].subdiarios_por_planilla : [];
        }
      } catch (e) {
        console.warn("No se pudo leer la configuración Starsoft", e);
      }

      if (!codEmpresaActiva) {
        toast.error("No se pudo determinar el código de empresa destino. Active una empresa (Prueba o Producción) con su código en la Configuración Starsoft antes de generar los asientos.");
        return;
      }

      if (cuentasConcepto.length === 0) {
        toast.error("No hay cuentas por concepto configuradas. Configure la homologación en Configuración Starsoft → Cuentas por Planilla antes de generar los asientos.");
        return;
      }

      // Resolver el subdiario por tipo de planilla desde la homologación configurada.
      // Prioriza la entrada explícita por payroll_type; si no existe, usa el registro is_default.
      const subdiarioDefault = subdiariosPorPlanilla.find(s => s && s.is_default && s.subdiario) || null;
      const subdiarioEntry = subdiariosPorPlanilla.find(s => s && !s.is_default && String(s.payroll_type) === String(payrollType) && s.subdiario) || subdiarioDefault;
      if (!subdiarioEntry || !subdiarioEntry.subdiario) {
        toast.error(`No hay subdiario configurado para el tipo de planilla "${payrollType}". Configure la homologación en Configuración Starsoft → Subdiarios por Planilla antes de generar los asientos.`);
        return;
      }
      // Validar que el código exista y esté activo en el catálogo Subdiario.
      const subdiarioCatalogo = subdiariosCatalog.find(s => String(s.codigo) === String(subdiarioEntry.subdiario) && (s.estado || "A") !== "I");
      if (!subdiarioCatalogo) {
        toast.error(`El subdiario "${subdiarioEntry.subdiario}" configurado para "${payrollType}" no existe o está inactivo en el catálogo de Subdiarios (Datos Maestros). Regístrelo o actívelo y reintente.`);
        return;
      }
      const subdiarioCodigo = String(subdiarioEntry.subdiario);

      // Índices de resolución de la homologación: por código PLAME y por nombre (normalizado).
      // Se admiten MÚLTIPLES entradas por código/nombre (ej: un aporte del empleador que
      // genera una línea DEBE gasto 62x y otra HABER pasivo 40x con el mismo codigo_plame).
      const normStr = (s) => String(s || "").toLowerCase().trim();
      const homByCode = {};
      const homByName = {};
      let netoConfig = null;
      cuentasConcepto.forEach(c => {
        if (!c || !c.cuenta || !c.debe_haber) return;
        if (c.categoria === "Neto" && c.debe_haber === "H" && !netoConfig) netoConfig = c;
        if (c.codigo_plame) {
          const key = String(c.codigo_plame);
          if (!homByCode[key]) homByCode[key] = [];
          homByCode[key].push(c);
        }
        if (c.concepto) {
          const key = normStr(c.concepto);
          if (!homByName[key]) homByName[key] = [];
          homByName[key].push(c);
        }
      });

      // El neto a pagar es la figura de balanceo del asiento. Sin cuenta de Neto (H)
      // configurada no es posible generar un asiento cuadrado → se bloquea la generación.
      if (!netoConfig) {
        toast.error("Falta configurar la cuenta de 'Neto a pagar' (categoría Neto, lado H) en Configuración Starsoft → Cuentas por Planilla. Es obligatoria para generar asientos balanceados.");
        return;
      }

      // Resuelve la cuenta contable y el lado (D/H) de un concepto del calculation_summary.
      // Prioriza coincidencia por código PLAME; si no hay, busca por nombre normalizado.
      // Devuelve un array (puede haber varias entradas D/H para un mismo código).
      const resolveConcept = (item) => {
        if (!item) return [];
        if (item.concept_code && homByCode[String(item.concept_code)]) return homByCode[String(item.concept_code)];
        if (item.name && homByName[normStr(item.name)]) return homByName[normStr(item.name)];
        return [];
      };

      // Búsqueda flexible por palabra clave dentro del nombre del concepto (respaldo
      // para descuentos planos y movilidad cuando el nombre exacto no coincide).
      const findHomByKeyword = (keyword) => {
        const kw = normStr(keyword);
        for (const [name, entries] of Object.entries(homByName)) {
          if (name.includes(kw)) return entries[0];
        }
        return null;
      };

      // Resolver el tipo de anexo desde la tabla Tipos de Anexo (Datos Maestros).
      // Planilla regular → TRABAJADORES; SNP → HONORARIOS.
      const tipoAnexoTrabajadores = getTipoAnexoCodigo("TRABAJADORES");
      const tipoAnexoHonorarios = getTipoAnexoCodigo("HONORARIOS");
      const tipoAnexoAplicar = isSNP ? tipoAnexoHonorarios : tipoAnexoTrabajadores;
      if (!tipoAnexoAplicar) {
        const faltante = isSNP ? "HONORARIOS" : "TRABAJADORES";
        toast.error(`No se encontró el tipo de anexo "${faltante}" en la tabla de Tipos de Anexo (Datos Maestros). Regístrelo y reintente.`);
        return;
      }

      // Identificar asientos anteriores de esta planilla para reemplazarlos
      // solo después de persistir correctamente las nuevas líneas.
      const existing = allAsientos.filter(
        a => a.payroll_period === period && a.payroll_type === payrollType &&
          (a.origen === "Planilla" || (isSNP && a.origen === "Otro"))
      );

      const asientosToCreate = [];

      const missingConcepts = [];
      const balanceIssues = []; // descuadres por trabajador (Debe != Haber)
      const netoConfigMissing = !netoConfig;

      const buildBase = (emp, p, comprobante) => {
        let assignment = costCenterAssignments.find(
          a => a.assignment_type === "Empleado" && a.employee_id === emp.id && a.is_active
        );
        if (!assignment && emp.department_name) {
          assignment = costCenterAssignments.find(
            a => a.assignment_type === "Departamento" && a.department_name === emp.department_name && a.is_active
          );
        }
        const cc = assignment?.cost_center_id ? costCenters.find(c => c.id === assignment.cost_center_id) : null;
        const empName = `${emp.first_name} ${emp.last_name}`;
        const base = {
          annomes,
          subdiario: subdiarioCodigo,
          comprobante,
          fecha_doc: fechaDoc,
          fecha_registro: fechaRegistro,
          tipo_doc: isSNP ? "RH" : "PL",
          nro_doc: isSNP ? `RH-${annomes}-${emp.document_number}` : comprobante,
          tipo_anexo: tipoAnexoAplicar,
          cod_anexo: emp.document_number || "",
          conversion_tc: "",
          moneda: "PEN",
          tc: 1,
          glosa: isSNP ? `SNP ${period}` : `${payrollType} - ${period}`,
          centro_costos: cc?.code || "",
          centro_costos_id: assignment?.cost_center_id || "",
          employee_id: emp.id,
          payroll_period: period,
          payroll_type: payrollType,
          payslip_id: p.id,
          origen: isSNP ? "Otro" : "Planilla",
          empresa: codEmpresaActiva,
          estado_migracion: "Pendiente",
          anulado: false,
        };
        base.fecha_vencimiento = fechaDoc;
        return { base, empName };
      };

      // Genera una línea de asiento por concepto por persona, leyendo el
      // calculation_summary de cada boleta y resolviendo la cuenta desde la
      // homologación (cuentas_por_concepto). El neto a pagar se calcula como
      // figura de balanceo (Total Debe − Total Haber) para garantizar que el
      // asiento cuadre persona por persona.
      let correlativo = 0;
      for (const p of grupo.payslips) {
        const emp = allEmployees.find(e => e.id === p.employee_id);
        if (!emp) continue;

        const cs = p.calculation_summary;
        if (!cs || !cs.breakdown) {
          missingConcepts.push({ employee: `${emp.first_name} ${emp.last_name}`, code: "—", name: "Boleta sin desglose (calculation_summary)" });
          continue;
        }

        correlativo += 1;
        const comprobante = String(correlativo).padStart(4, "0");
        const { base, empName } = buildBase(emp, p, comprobante);

        // Acumulador local de líneas y totales por persona (para calcular el neto
        // de balanceo y verificar que Debe = Haber).
        const personLines = [];
        let totalDebe = 0;
        let totalHaber = 0;
        const pushPersonLine = (cuenta, importe, debeHaber, glosaMov) => {
          const imp = roundMoney(Math.abs(Number(importe) || 0));
          if (imp === 0) return;
          personLines.push({
            ...base,
            cuenta,
            importe: imp,
            importe_soles: imp,
            debe_haber: debeHaber,
            glosa_mov: String(glosaMov || "").slice(0, 40),
          });
          if (debeHaber === "D") totalDebe += imp; else totalHaber += imp;
        };

        const processItems = (items, sectionLabel) => {
          (items || []).forEach(item => {
            const homs = resolveConcept(item);
            if (homs.length === 0) {
              missingConcepts.push({ employee: empName, code: item.concept_code || "—", name: item.name || "—" });
              return;
            }
            homs.forEach(hom => {
              pushPersonLine(hom.cuenta, item.amount, hom.debe_haber, `${empName} - ${item.name || hom.concepto || sectionLabel}`);
            });
          });
        };

        // Registro de conceptos ya generados desde el breakdown (para evitar duplicados
        // al inyectar descuentos planos y el respaldo de movilidad desde campos del payslip).
        const generatedNames = new Set();
        (cs.breakdown.incomes?.items || []).forEach(i => i.name && generatedNames.add(normStr(i.name)));
        (cs.breakdown.deductions?.items || []).forEach(i => i.name && generatedNames.add(normStr(i.name)));

        processItems(cs.breakdown.incomes?.items, "Ingreso");
        processItems(cs.breakdown.deductions?.items, "Descuento");
        processItems(cs.breakdown.contributions?.items, "Aportación");

        // ── Descuentos planos del payslip (no viven en el breakdown) ──────────
        // Adelanto quincenal, tardanzas e inasistencias se almacenan como campos
        // del payslip; se inyectan resolviendo cuenta por nombre exacto o por
        // palabra clave (respaldo flexible) con el lado configurado (H).
        const flatDiscounts = [
          { field: "advance_deduction",   label: "Adelanto Quincenal",          glosa: "ADELANTO QUINCENAL",      keyword: "adelanto" },
          { field: "tardiness_discount",  label: "Descuento por Tardanzas",     glosa: "DESC. POR TARDANZAS",     keyword: "tardanza" },
          { field: "absence_discount",    label: "Descuento por Inasistencias", glosa: "DESC. POR INASISTENCIAS", keyword: "inasistencia" },
        ];
        flatDiscounts.forEach(({ field, label, glosa, keyword }) => {
          const amt = safePayrollNumber(p[field]);
          if (amt <= 0) return;
          if (generatedNames.has(normStr(label))) return; // ya vino en el breakdown
          const hom = (homByName[normStr(label)] || [])[0] || findHomByKeyword(keyword);
          if (!hom) {
            missingConcepts.push({ employee: empName, code: "—", name: label });
            return;
          }
          pushPersonLine(hom.cuenta, amt, hom.debe_haber, `${empName} - ${glosa}`);
        });

        // ── Respaldo de movilidad (ingreso) si no se generó desde el breakdown ─
        // El chequeo usa generatedNames (nombres completos del breakdown) y no la
        // glosa_mov, porque esta última se trunca a 40 chars y "movilidad" puede
        // quedar cortado, lo que causaba una línea duplicada de movilidad.
        const movilidadAmt = safePayrollNumber(p.transport_cost_amount);
        if (movilidadAmt > 0) {
          const yaGenerada = [...generatedNames].some(n => n.includes("movilidad"));
          if (!yaGenerada) {
            const homMov =
              (homByName[normStr("Movilidad")] || [])[0] ||
              (homByName[normStr("Bonificación por Movilidad")] || [])[0] ||
              findHomByKeyword("movilidad");
            if (homMov) {
              pushPersonLine(homMov.cuenta, movilidadAmt, homMov.debe_haber, `${empName} - MOVILIDAD`);
            } else {
              missingConcepts.push({ employee: empName, code: "—", name: "Movilidad" });
            }
          }
        }

        // ── Neto a pagar = neto EXACTO de la boleta (p.net_pay) ────────────────
        // El asiento debe reflejar estrictamente la boleta: el neto es el neto
        // real de la boleta, NO una figura de balanceo. El asiento cuadra
        // (Debe = Haber) solo si todos los conceptos están homologados con su
        // lado correcto; en particular, cada aporte del empleador necesita DOS
        // entradas en la homologación (cuentas_por_concepto): una DEBE gasto
        // (62x) y una HABER pasivo (40x) con el mismo codigo_plame. Si falta un
        // lado, el descuadre se reporta abajo para que se complete la homologación.
        const realNeto = safePayrollNumber(p.net_pay);
        if (realNeto > 0) {
          pushPersonLine(netoConfig.cuenta, realNeto, "H", `${empName} - Neto a pagar`);
        }
        const diferencia = roundMoney(totalDebe - totalHaber);
        if (Math.abs(diferencia) > 0.01) {
          balanceIssues.push({
            employee: empName,
            document_number: emp.document_number || "",
            debe: totalDebe,
            haber: totalHaber,
            diferencia,
          });
        }

        asientosToCreate.push(...personLines);
      }

      if (asientosToCreate.length === 0) {
        toast.error("No se generaron líneas contables. Revise los empleados, el desglose de las boletas y la homologación de conceptos.");
        return;
      }

      await entitiesAPI.AsientoContable.bulkCreate(asientosToCreate);
      for (const a of existing) {
        await entitiesAPI.AsientoContable.delete(a.id);
      }
      queryClient.invalidateQueries(["asientosContablesConsulta"]);
      queryClient.invalidateQueries(["asientosContables"]);

      // Banner persistente de descuadres por trabajador (se muestra hasta regenerar)
      setBalanceAlert(balanceIssues.length > 0 ? { period, payrollType, issues: balanceIssues } : null);

      const label = existing.length > 0 ? "Asientos actualizados" : "Asientos generados";
      let msg = `${label}: ${asientosToCreate.length} líneas${isSNP ? ` (${grupo.payslips.length} Recibos de Honorarios)` : ""}`;
      if (missingConcepts.length > 0) {
        const unique = new Set(missingConcepts.map(m => `${m.code}|${m.name}`));
        msg += `. ${missingConcepts.length} concepto(s) sin homologar (${unique.size} únicos).`;
      }
      if (balanceIssues.length > 0) {
        msg += `. ⚠ ${balanceIssues.length} trabajador(es) con descuadre (Debe ≠ Haber). Revise el detalle de la alerta.`;
      }
      if (netoConfigMissing) {
        msg += " Falta configurar la cuenta de Neto a pagar (categoría Neto, H).";
      }
      if (missingConcepts.length > 0 || balanceIssues.length > 0 || netoConfigMissing) {
        toast.warning(msg);
      } else {
        toast.success(msg);
      }
    } catch (error) {
      toast.error("Error al generar asientos contables");
      console.error(error);
    } finally {
      setGeneratingAsiento(null);
    }
  };

  // --- Si hay boleta individual seleccionada ---
  if (previewPayslip) {
    const emp = allEmployees.find(e => e.id === previewPayslip.employee_id);
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" onClick={() => setPreviewPayslip(null)}>
              <ArrowLeft className="w-4 h-4 mr-2" />Volver al Detalle
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />Imprimir Boleta
            </Button>
          </div>
          <PayslipPreview
            payslip={previewPayslip}
            employee={emp}
            companyInfo={companyInfo}
            firmantes={firmantes}
            showPrintButton={true}
          />
        </div>
      </div>
    );
  }

  // --- Si hay planilla completa seleccionada ---
  if (showPlanillaCompleta && selectedGroup) {
    const payslipsGrupo = selectedGroup.payslips.map(p => ({
      payslip: p,
      employee: allEmployees.find(e => e.id === p.employee_id),
    })).filter(r => r.employee);
    return (
      <PlanillaCompletaView
        grupo={selectedGroup}
        payslips={payslipsGrupo}
        companyInfo={companyInfo}
        firmantes={firmantes}
        onBack={() => setShowPlanillaCompleta(false)}
      />
    );
  }

  // --- Detalle de un grupo ---
  if (selectedGroup) {
    const stats = getGrupoStats(selectedGroup);
    const payslipsConEmp = selectedGroup.payslips.map(p => ({
      p,
      emp: allEmployees.find(e => e.id === p.employee_id),
    })).filter(r => r.emp);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Banner de alerta de descuadres por trabajador */}
          {balanceAlert && balanceAlert.period === selectedGroup.period && balanceAlert.payrollType === selectedGroup.payroll_type && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-red-800">
                    {balanceAlert.issues.length} trabajador(es) con asiento descuadrado (Debe ≠ Haber)
                  </h3>
                  <p className="text-xs text-red-600 mt-0.5">
                    Cada concepto del desglose debe estar homologado con su lado (D/H). En particular, cada aporte del empleador necesita una entrada DEBE (gasto 62x) y una HABER (pasivo 40x) con el mismo código PLAME en Configuración Starsoft → Cuentas por Planilla.
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-red-700 border-b border-red-200">
                          <th className="py-1.5 pr-3 font-semibold">Trabajador</th>
                          <th className="py-1.5 pr-3 font-semibold">Documento</th>
                          <th className="py-1.5 pr-3 font-semibold text-right">Debe</th>
                          <th className="py-1.5 pr-3 font-semibold text-right">Haber</th>
                          <th className="py-1.5 pr-3 font-semibold text-right">Diferencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balanceAlert.issues.map((it, idx) => (
                          <tr key={idx} className="border-b border-red-100">
                            <td className="py-1.5 pr-3 text-red-900 font-medium">{it.employee}</td>
                            <td className="py-1.5 pr-3 text-red-700 font-mono">{it.document_number}</td>
                            <td className="py-1.5 pr-3 text-right text-red-700">{it.debe.toFixed(2)}</td>
                            <td className="py-1.5 pr-3 text-right text-red-700">{it.haber.toFixed(2)}</td>
                            <td className="py-1.5 pr-3 text-right text-red-900 font-bold">{it.diferencia > 0 ? "+" : ""}{it.diferencia.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <button
                  onClick={() => setBalanceAlert(null)}
                  className="text-red-400 hover:text-red-600 shrink-0"
                  title="Cerrar alerta"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Header detalle */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-start gap-4">
              <Button variant="outline" onClick={() => setSelectedGroup(null)}>
                <ArrowLeft className="w-4 h-4 mr-2" />Volver
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  {selectedGroup.period}
                </h1>
                <div className="flex items-center gap-3 mt-2">
                  <Badge className={TIPO_COLORS[selectedGroup.payroll_type] || "bg-slate-100 text-slate-700"}>
                    {selectedGroup.payroll_type}
                  </Badge>
                  <Badge className={STATUS_COLORS[selectedGroup.status] || "bg-slate-100"}>
                    {selectedGroup.status}
                  </Badge>
                  <span className="text-sm text-slate-500">N° {selectedGroup.payroll_number}</span>
                </div>
                {selectedGroup.attendance_period_start && selectedGroup.attendance_period_end && (
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-indigo-600 font-medium">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Cómputo de asistencias: {format(parseDateLima(selectedGroup.attendance_period_start), "dd/MM/yyyy", { locale: es })} → {format(parseDateLima(selectedGroup.attendance_period_end), "dd/MM/yyyy", { locale: es })}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={() => setShowPlanillaCompleta(true)}
              >
                <Eye className="w-4 h-4 mr-2" />Ver Planilla Completa
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => { setShowPlanillaCompleta(true); setTimeout(() => window.print(), 800); }}
              >
                <Printer className="w-4 h-4 mr-2" />Imprimir Planilla
              </Button>
            </div>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Empleados incluidos", value: stats.empleados, icon: Users, color: "blue" },
              { label: "Total Ingresos", value: formatMoney(stats.totalIncome), icon: DollarSign, color: "green" },
              { label: "Total Descuentos", value: formatMoney(stats.totalDesc), icon: DollarSign, color: "red" },
              { label: "Total Neto a Pagar", value: formatMoney(stats.totalNeto), icon: DollarSign, color: "indigo" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="border-0 shadow-lg">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 bg-${color}-100 rounded-lg shrink-0`}>
                      <Icon className={`w-4 h-4 text-${color}-600`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xl font-bold text-slate-900 leading-tight">{value}</div>
                      <p className="text-slate-600 text-xs truncate">{label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabla de boletas */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-500" />
                Detalle por Empleado — {stats.empleados} persona(s)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {["#","DNI","Empleado","Cargo","Área","Días","Ingresos","Descuentos","Neto a Pagar","Estado","Acciones"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payslipsConEmp.map(({ p, emp }, idx) => (
                      <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                         <td className="px-4 py-3 font-mono text-xs text-slate-700">{emp.document_type} {emp.document_number}</td>
                         <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {emp.first_name[0]}{emp.last_name[0]}
                            </div>
                            <span className="font-medium text-slate-900 whitespace-nowrap">{emp.first_name} {emp.last_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{emp.position || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{emp.department_name || "—"}</td>
                        <td className="px-4 py-3 text-center font-medium">{p.worked_days}</td>
                        <td className="px-4 py-3 text-green-700 font-semibold">{formatMoney(p.total_income)}</td>
                        <td className="px-4 py-3 text-red-600 font-semibold">{formatMoney(p.total_deductions)}</td>
                        <td className="px-4 py-3 font-bold text-indigo-700 text-base">{formatMoney(p.net_pay)}</td>
                        <td className="px-4 py-3">
                          <Badge className={STATUS_COLORS[p.status] || "bg-slate-100"}>{p.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs"
                              onClick={() => setPreviewPayslip(p)}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />Ver Boleta
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-slate-600 hover:bg-slate-50 text-xs"
                              onClick={() => { setPreviewPayslip(p); setTimeout(() => window.print(), 600); }}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 font-bold text-slate-900 text-sm">TOTALES</td>
                      <td className="px-4 py-3 font-bold text-center">{payslipsConEmp.reduce((s, {p}) => s + (p.worked_days || 0), 0)}</td>
                      <td className="px-4 py-3 font-bold text-green-700">{formatMoney(stats.totalIncome)}</td>
                      <td className="px-4 py-3 font-bold text-red-600">{formatMoney(stats.totalDesc)}</td>
                      <td className="px-4 py-3 font-bold text-indigo-700 text-base">{formatMoney(stats.totalNeto)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // --- Imprimir todas las boletas de un grupo de un solo golpe ---
  // Usa el mismo generador HTML que la vista individual (PayslipPreview.buildBoletaInner)
  // para garantizar que todas las visualizaciones sean estrictamente idénticas.
  const handlePrintAllBoletas = (grupo, copies = 1) => {
    const ci = companyInfo || { company_name: "Empresa", ruc: "00000000000", address: "" };

    // Índice de AFP por id
    const afpMap = {};
    (afpList || []).forEach(a => { afpMap[a.id] = a.name; });

    const conceptsMap = payrollConcepts || [];

    const buildOne = (p) => {
      const emp = allEmployees.find(e => e.id === p.employee_id);
      if (!emp) return "";
      const afpName = emp.afp_id ? (afpMap[emp.afp_id] || emp.afp_id) : "";
      return buildBoletaInner({
        payslip: p,
        employee: emp,
        company: ci,
        afpName,
        conceptsMap,
      });
    };

    // copies === 2 → dos copias de la MISMA boleta por hoja (una por columna)
    const boletasHTML = grupo.payslips.map(p => {
      const html = buildOne(p);
      if (!html) return "";
      if (copies === 2) {
        // Cada hoja A4 horizontal contiene dos copias del mismo trabajador
        return `<div class="sheet"><div class="sheet-inner">${html}</div><div class="sheet-inner">${html}</div></div>`;
      }
      return html;
    }).filter(Boolean).join("\n");

    const pageStyle = copies === 2
      ? `@page { size: A4 landscape; margin: 6mm; }
         .wrapper {}
         .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; page-break-after: always; }
         .sheet-inner { overflow: hidden; }`
      : `@page { size: A4 portrait; margin: 10mm; } .wrapper {}`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Boletas ${grupo.period} - ${grupo.payroll_type}</title>
<style>
  ${pageStyle}
  ${BOLETA_CSS}
</style>
</head>
<body>
<div class="wrapper">
${boletasHTML}
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) { toast.error("Permite las ventanas emergentes para imprimir."); return; }
    win.document.write(html);
    win.document.close();
    toast.success(`Preparando ${grupo.payslips.length} boleta(s) para imprimir…`);
  };

  // --- Vista principal: lista de cabeceras ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-[1600px] mx-auto px-4 py-6">

        {/* Fila 1: Título del módulo + botón Firmantes */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
            <span className="text-xl font-bold text-slate-900">Consulta de Planillas</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-slate-300 hover:bg-slate-50 gap-2 h-9"
            onClick={() => setShowConfigFirmantes(true)}
          >
            <Settings className="w-4 h-4" />Configurar Firmantes
          </Button>
        </div>

        {/* Fila 2: Filtros del datagrid */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-4 px-4 py-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input placeholder="Buscar período o número..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9" />
            </div>
            <Select value={String(filterYear)} onValueChange={v => setFilterYear(parseInt(v))}>
              <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Todos los meses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los meses</SelectItem>
                {Array.from({length: 12}, (_, i) => (
                  <SelectItem key={i+1} value={String(i+1)}>
                    {format(new Date(2024, i), "MMMM", { locale: es })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {["Quincenal","Mensual","Adicional","SNP","CTS","Gratificacion"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-slate-500 whitespace-nowrap ml-auto">{filteredGrupos.length} planilla(s)</span>
          </div>
        </div>

        {/* Lista de planillas — scroll horizontal único en este bloque */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filteredGrupos.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="py-20 text-center">
              <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No se encontraron planillas para los filtros seleccionados</p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            {/* Cabecera de columnas */}
            <div className="grid items-center mb-1 px-1" style={{
              minWidth: "1120px",
              gridTemplateColumns: "minmax(200px,1.8fr) 1px minmax(60px,0.5fr) 1px minmax(120px,1fr) 1px minmax(120px,1fr) 1px minmax(130px,1fr) 1px 320px 1px 210px 32px"
            }}>
              <div className="px-4 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Período / Tipo</div>
              <div />
              <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-center">Empl.</div>
              <div />
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-right">Ingresos</div>
              <div />
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-right">Descuentos</div>
              <div />
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-right">Neto Total</div>
              <div />
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-center">Acciones</div>
              <div />
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-center">Contabilidad</div>
              <div />
            </div>

            <div className="space-y-2" style={{ minWidth: "1120px" }}>
              {filteredGrupos.map(g => {
                const stats = getGrupoStats(g);
                const asientoStatus = getGrupoAsientoStatus(g);
                return (
                  <Card
                    key={g.key}
                    className="border-0 shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer group overflow-hidden"
                    onClick={() => setSelectedGroup(g)}
                  >
                    <CardContent className="p-0">
                      {/* Grid dinámico: info crece, botones fijos y sin superposición */}
                      <div className="grid items-center w-full min-h-[76px]" style={{
                        gridTemplateColumns: "minmax(200px,1.8fr) 1px minmax(60px,0.5fr) 1px minmax(120px,1fr) 1px minmax(120px,1fr) 1px minmax(130px,1fr) 1px 320px 1px 210px 32px"
                      }}>

                        {/* Col 1 — Período + badges */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="w-[44px] h-[44px] rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center text-white shrink-0">
                            <span className="text-[9px] font-bold leading-none uppercase">
                              {format(new Date(g.year, g.month - 1), "MMM", { locale: es })}
                            </span>
                            <span className="text-sm font-bold leading-none">{g.year}</span>
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 capitalize leading-tight truncate">{g.period}</h3>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <Badge className={`text-[10px] px-1.5 py-0 ${TIPO_COLORS[g.payroll_type] || "bg-slate-100 text-slate-700"}`}>{g.payroll_type}</Badge>
                              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[g.status] || "bg-slate-100"}`}>{g.status}</Badge>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate">N° {g.payroll_number}</p>
                            {g.attendance_period_start && g.attendance_period_end && (
                              <p className="text-[10px] text-indigo-500 mt-0.5 truncate font-medium">
                                📅 {format(parseDateLima(g.attendance_period_start), "dd/MM", { locale: es })} → {format(parseDateLima(g.attendance_period_end), "dd/MM/yyyy", { locale: es })}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Separador */}
                        <div className="bg-slate-100 self-stretch my-3" />

                        {/* Col 2 — Empleados */}
                        <div className="flex flex-col items-center justify-center px-2 py-3">
                          <p className="text-[10px] text-slate-400 mb-0.5 whitespace-nowrap">Empleados</p>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-blue-500 shrink-0" />
                            <span className="font-bold text-slate-900 text-sm">{stats.empleados}</span>
                          </div>
                        </div>

                        <div className="bg-slate-100 self-stretch my-3" />

                        {/* Col 3 — Ingresos */}
                        <div className="flex flex-col items-end justify-center px-3 py-3">
                          <p className="text-[10px] text-slate-400 mb-0.5">Ingresos</p>
                          <p className="font-semibold text-slate-700 text-xs whitespace-nowrap">{formatMoney(stats.totalIncome)}</p>
                        </div>

                        <div className="bg-slate-100 self-stretch my-3" />

                        {/* Col 4 — Descuentos */}
                        <div className="flex flex-col items-end justify-center px-3 py-3">
                          <p className="text-[10px] text-slate-400 mb-0.5">Descuentos</p>
                          <p className="font-semibold text-red-500 text-xs whitespace-nowrap">{formatMoney(stats.totalDesc)}</p>
                        </div>

                        <div className="bg-slate-100 self-stretch my-3" />

                        {/* Col 5 — Neto Total */}
                        <div className="flex flex-col items-end justify-center px-3 py-3">
                          <p className="text-[10px] text-slate-400 mb-0.5">Neto Total</p>
                          <p className="font-bold text-indigo-700 text-sm whitespace-nowrap">{formatMoney(stats.totalNeto)}</p>
                        </div>

                        <div className="bg-slate-100 self-stretch my-3" />

                        {/* Col 6 — Botones Ver / Imprimir / Boletas */}
                        <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="outline" className="h-8 px-3 text-xs whitespace-nowrap"
                            onClick={e => { e.stopPropagation(); setSelectedGroup(g); setShowPlanillaCompleta(true); }}>
                            <Eye className="w-3 h-3 mr-1" />Ver
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 px-3 text-xs whitespace-nowrap"
                            onClick={e => { e.stopPropagation(); setSelectedGroup(g); setShowPlanillaCompleta(true); setTimeout(() => window.print(), 800); }}>
                            <Printer className="w-3 h-3 mr-1" />Imprimir
                          </Button>
                          {(() => {
                            const signedCount = g.payslips.filter(p => p.digital_signature_url).length;
                            const allSigned = signedCount === g.payslips.length && g.payslips.length > 0;
                            return (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs whitespace-nowrap text-purple-700 border-purple-200 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                                disabled={!allSigned}
                                title={allSigned ? "Imprimir boletas firmadas" : `Faltan firmar ${g.payslips.length - signedCount} de ${g.payslips.length} boleta(s)`}
                                onClick={e => { e.stopPropagation(); setShowPrintBoletasModal(g); }}
                              >
                                <Printer className="w-3 h-3 mr-1" />Boletas
                              </Button>
                            );
                          })()}
                          <Button size="sm" variant="outline" className="h-8 px-3 text-xs whitespace-nowrap text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            onClick={e => { e.stopPropagation(); setShowFirmarModal(g); }}>
                            <PenTool className="w-3 h-3 mr-1" />Firmar
                          </Button>
                        </div>

                        <div className="bg-slate-100 self-stretch my-3" />

                        {/* Col 7 — Generar Asiento */}
                        <div className="flex items-center justify-center px-3 py-3" onClick={e => e.stopPropagation()}>
                          {g.payroll_type !== "Quincenal" ? (
                            <div className="flex flex-col items-stretch gap-1 w-full">
                              {asientoStatus && (
                                <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                  <CheckCircle className="w-2.5 h-2.5" />Asiento generado
                                </span>
                              )}
                              <Button
                                size="sm"
                                className={`h-8 text-xs whitespace-nowrap w-full ${asientoStatus ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
                                disabled={generatingAsiento === g.key}
                                onClick={e => { e.stopPropagation(); handleGenerarAsiento(g); }}
                              >
                                {generatingAsiento === g.key
                                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                  : <BookOpen className="w-3 h-3 mr-1" />}
                                {asientoStatus ? "Actualizar" : "Gen. Asiento"}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-slate-200 text-sm">—</span>
                          )}
                        </div>

                        {/* Flecha navegación */}
                        <div className="flex items-center justify-center">
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                        </div>

                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Fila de totales dinámicos — al pie del datagrid */}
            <div className="grid items-center mt-2 bg-indigo-600 rounded-xl px-1 py-3" style={{
              minWidth: "1120px",
              gridTemplateColumns: "minmax(200px,1.8fr) 1px minmax(60px,0.5fr) 1px minmax(120px,1fr) 1px minmax(120px,1fr) 1px minmax(130px,1fr) 1px 320px 1px 210px 32px"
            }}>
              <div className="px-4 text-xs font-bold text-white uppercase tracking-wide">
                TOTALES — {filteredGrupos.length} planilla(s)
              </div>
              <div />
              <div className="px-2 text-center text-sm font-bold text-white">{filteredTotals.empleados}</div>
              <div />
              <div className="px-3 text-right text-sm font-bold text-emerald-200">{formatMoney(filteredTotals.totalIncome)}</div>
              <div />
              <div className="px-3 text-right text-sm font-bold text-red-300">{formatMoney(filteredTotals.totalDesc)}</div>
              <div />
              <div className="px-3 text-right text-sm font-bold text-white">{formatMoney(filteredTotals.totalNeto)}</div>
              <div /><div /><div /><div /><div />
            </div>
          </div>
        )}
      </div>

      {/* Modal configuración de firmantes */}

      {showConfigFirmantes && (
        <ConfigFirmantesModal
          companyInfo={companyInfo}
          onClose={() => setShowConfigFirmantes(false)}
          onSave={async (data) => {
            setFirmantes(data);
            setShowConfigFirmantes(false);
            toast.success("Firmantes configurados correctamente");
            // Persistir en CompanyInfo para que se recarguen automáticamente
            if (companyInfo?.id) {
              await entitiesAPI.CompanyInfo.update(companyInfo.id, {
                firmante_gg: JSON.stringify(data.firmante_gg || {}),
                firmante_delegado: JSON.stringify(data.firmante_delegado || {}),
              });
            }
          }}
        />
      )}

      {/* Modal firma masiva de boletas */}
      {showFirmarModal && (
        <FirmarBoletasModal
          grupo={showFirmarModal}
          companyInfo={companyInfo}
          onClose={() => setShowFirmarModal(null)}
          onSuccess={() => {
            setShowFirmarModal(null);
            queryClient.invalidateQueries({ queryKey: ["allPayslipsConsulta"] });
          }}
        />
      )}

      {/* Modal de opciones de impresión masiva de boletas */}
      {showPrintBoletasModal && (
        <PrintBoletasModal
          grupo={showPrintBoletasModal}
          onClose={() => setShowPrintBoletasModal(null)}
          onPrint={(copies) => {
            handlePrintAllBoletas(showPrintBoletasModal, copies);
            setShowPrintBoletasModal(null);
          }}
        />
      )}
    </div>
  );
}
