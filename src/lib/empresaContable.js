// Empresas contables: 001/002 = prueba, 003 = final (FORESTAL PAMA SAC)
export const EMPRESAS_CONTABLES = [
  { codigo: "001", nombre: "Empresa de Prueba 001", es_prueba: true },
  { codigo: "002", nombre: "Empresa de Prueba 002", es_prueba: true },
  { codigo: "003", nombre: "FORESTAL PAMA SAC (Final)", es_prueba: false },
];

const STORAGE_KEY = "empresa_contable_activa";

export function getActiveEmpresaCodigo() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "003";
  } catch {
    return "003";
  }
}

export function setActiveEmpresaCodigo(codigo) {
  try {
    localStorage.setItem(STORAGE_KEY, codigo);
  } catch {
    // ignore
  }
}

export function getActiveEmpresa() {
  const codigo = getActiveEmpresaCodigo();
  return EMPRESAS_CONTABLES.find((e) => e.codigo === codigo) || EMPRESAS_CONTABLES[2];
}

// Mapeos por defecto para tipo_planilla (cuentas PCGE estándar)
export const DEFAULT_MAPEOS_TIPO_PLANILLA = [
  { clave: "Quincenal", descripcion: "Remuneración (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "Quincenal", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "Quincenal", descripcion: "Descuentos y Tributos (Haber)", cuenta: "4030000", debe_haber: "H", subdiario: "08", orden: 3 },
  { clave: "Mensual", descripcion: "Remuneración (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "Mensual", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "Mensual", descripcion: "Descuentos y Tributos (Haber)", cuenta: "4030000", debe_haber: "H", subdiario: "08", orden: 3 },
  { clave: "Adicional", descripcion: "Remuneración (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "Adicional", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "Adicional", descripcion: "Descuentos y Tributos (Haber)", cuenta: "4030000", debe_haber: "H", subdiario: "08", orden: 3 },
  { clave: "SNP", descripcion: "Honorario Bruto (Debe)", cuenta: "6320000", debe_haber: "D", subdiario: "07", orden: 1 },
  { clave: "SNP", descripcion: "Neto a pagar (Haber)", cuenta: "4212100", debe_haber: "H", subdiario: "07", orden: 2 },
  { clave: "SNP", descripcion: "Retención 4ta (Haber)", cuenta: "4017100", debe_haber: "H", subdiario: "07", orden: 3 },
  { clave: "CTS", descripcion: "CTS (Debe)", cuenta: "6390000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "CTS", descripcion: "CTS por pagar (Haber)", cuenta: "2610000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "Gratificacion", descripcion: "Gratificación (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "Gratificacion", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "Liquidacion", descripcion: "Liquidación (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "Liquidacion", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 2 },
];

export const DEFAULT_MAPEOS_ORIGEN = [
  { clave: "Planilla", descripcion: "Remuneración (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "Planilla", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "CTS", descripcion: "CTS (Debe)", cuenta: "6390000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "CTS", descripcion: "CTS por pagar (Haber)", cuenta: "2610000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "Gratificacion", descripcion: "Gratificación (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "Gratificacion", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "Liquidacion", descripcion: "Liquidación (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "Liquidacion", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "Vacaciones", descripcion: "Vacaciones (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "Vacaciones", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 2 },
  { clave: "Prestamo", descripcion: "Préstamo (Debe)", cuenta: "1610000", debe_haber: "D", subdiario: "01", orden: 1 },
  { clave: "Prestamo", descripcion: "Préstamo por pagar (Haber)", cuenta: "1010000", debe_haber: "H", subdiario: "01", orden: 2 },
];

export const DEFAULT_MAPEOS_CONCEPTO = [
  { clave: "remuneracion_base", descripcion: "Remuneración Base (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 1 },
  { clave: "asignacion_familiar", descripcion: "Asignación Familiar (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 2 },
  { clave: "horas_extras_25", descripcion: "Horas Extras 25% (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 3 },
  { clave: "horas_extras_35", descripcion: "Horas Extras 35% (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 4 },
  { clave: "bonificaciones", descripcion: "Bonificaciones (Debe)", cuenta: "6210000", debe_haber: "D", subdiario: "08", orden: 5 },
  { clave: "afp_aporte_obligatorio", descripcion: "AFP Aporte Obligatorio (Haber)", cuenta: "4030901", debe_haber: "H", subdiario: "08", orden: 10 },
  { clave: "afp_prima_seguro", descripcion: "AFP Prima de Seguro (Haber)", cuenta: "4030902", debe_haber: "H", subdiario: "08", orden: 11 },
  { clave: "afp_comision", descripcion: "AFP Comisión (Haber)", cuenta: "4030903", debe_haber: "H", subdiario: "08", orden: 12 },
  { clave: "onp_aporte", descripcion: "ONP Aporte (Haber)", cuenta: "4030904", debe_haber: "H", subdiario: "08", orden: 13 },
  { clave: "essalud", descripcion: "EsSalud (Haber)", cuenta: "4030101", debe_haber: "H", subdiario: "08", orden: 14 },
  { clave: "impuesto_5ta", descripcion: "Impuesto 5ta Categoría (Haber)", cuenta: "4030501", debe_haber: "H", subdiario: "08", orden: 15 },
  { clave: "neto_pagar", descripcion: "Neto a pagar (Haber)", cuenta: "4110000", debe_haber: "H", subdiario: "08", orden: 20 },
  { clave: "prestamos_cuota", descripcion: "Préstamos - Cuota (Haber)", cuenta: "4031101", debe_haber: "H", subdiario: "08", orden: 21 },
  { clave: "adelanto_quincenal", descripcion: "Adelanto Quincenal (Haber)", cuenta: "4031102", debe_haber: "H", subdiario: "08", orden: 22 },
];

// Resuelve los mapeos desde la configuración cargada, con fallback a defaults
export function resolveMapeos(configs, tipoMapeo, clave) {
  const matches = (configs || []).filter(
    (c) => c.tipo_mapeo === tipoMapeo && c.clave === clave && c.activo !== false
  );
  if (matches.length > 0) {
    return matches.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }
  const defaults =
    tipoMapeo === "tipo_planilla"
      ? DEFAULT_MAPEOS_TIPO_PLANILLA
      : tipoMapeo === "origen_asiento"
      ? DEFAULT_MAPEOS_ORIGEN
      : DEFAULT_MAPEOS_CONCEPTO;
  return defaults.filter((d) => d.clave === clave);
}

export function getAllDefaults() {
  return [
    ...DEFAULT_MAPEOS_TIPO_PLANILLA.map((d) => ({ ...d, tipo_mapeo: "tipo_planilla" })),
    ...DEFAULT_MAPEOS_ORIGEN.map((d) => ({ ...d, tipo_mapeo: "origen_asiento" })),
    ...DEFAULT_MAPEOS_CONCEPTO.map((d) => ({ ...d, tipo_mapeo: "concepto_planilla" })),
  ];
}