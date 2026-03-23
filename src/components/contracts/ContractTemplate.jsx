import jsPDF from "jspdf";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const generateContractPDF = async (employee, contract, companyData = {}, templateData = null) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = 20;

  // Cargar plantilla si no se proporciona
  let template = templateData;
  let customClauses = [];
  
  if (!template) {
    try {
      const { base44 } = await import("@/api/base44Client");
      const templates = await base44.entities.ContractTemplate?.list();
      if (templates && templates.length > 0) {
        // Si el contrato tiene una plantilla específica, usarla
        if (contract.template_id) {
          template = templates.find(t => t.id === contract.template_id);
        }
        // Si no, buscar una plantilla específica para el tipo de contrato
        if (!template) {
          template = templates.find(t => 
            t.contract_types?.includes(contract.contract_type) && t.is_active
          );
        }
        // Si no, usar la plantilla por defecto
        if (!template) {
          template = templates.find(t => t.is_default && t.is_active);
        }
        // Si no hay ninguna, usar la primera disponible
        if (!template) {
          template = templates[0];
        }
      }

      // Cargar cláusulas personalizadas
      const clauses = await base44.entities.ContractClause?.list("order");
      if (clauses && clauses.length > 0) {
        customClauses = clauses.filter(c => 
          c.is_active && 
          (c.type === "obligatoria" || 
           !c.contract_types?.length || 
           c.contract_types.includes(contract.contract_type))
        );
      }
    } catch (error) {
      console.log("No se encontró plantilla personalizada, usando valores por defecto");
    }
  }

  // IMPORTANTE: Cargar datos ACTUALES de la empresa desde CompanyInfo SIEMPRE
  let freshCompanyData = {};
  try {
    const { base44 } = await import("@/api/base44Client");
    const companyInfoList = await base44.entities.CompanyInfo?.list("-created_date");
    if (companyInfoList && companyInfoList.length > 0) {
      const info = companyInfoList[0];
      freshCompanyData = {
        name: info.company_name,
        ruc: info.ruc,
        address: info.address,
        representative: info.legal_representative,
        representativeDoc: info.legal_representative_dni ? `DNI ${info.legal_representative_dni}` : "",
      };
    }
  } catch (error) {
    console.error("Error cargando información de empresa:", error);
    throw new Error("No se pudo cargar la información de la empresa. Por favor, configure los datos de la empresa en Configuración de Empresa.");
  }

  // Validar que exista información de empresa
  if (!freshCompanyData.name || !freshCompanyData.ruc) {
    throw new Error("No se encontró información de empresa registrada. Por favor, configure los datos en Configuración de Empresa.");
  }

  // Datos de la empresa (solo desde CompanyInfo)
  const company = {
    name: freshCompanyData.name,
    ruc: freshCompanyData.ruc,
    address: freshCompanyData.address,
    representative: freshCompanyData.representative,
    representativeDoc: freshCompanyData.representativeDoc,
  };

  // Variables dinámicas para reemplazo
  const variables = {
    "{contract_type}": contract.contract_type,
    "{contract_number}": contract.contract_number || "S/N",
    "{employee_name}": `${employee.first_name} ${employee.last_name}`,
    "{employee_doc_type}": employee.document_type || "DNI",
    "{employee_doc_number}": employee.document_number || "",
    "{employee_address}": `${employee.address || "No especificado"}, ${employee.district || ""}, ${employee.province || ""}`,
    "{position}": contract.position,
    "{department}": contract.department || employee.department_name || "",
    "{start_date}": format(new Date(contract.start_date), "dd 'de' MMMM 'de' yyyy", { locale: es }),
    "{end_date}": contract.end_date ? format(new Date(contract.end_date), "dd 'de' MMMM 'de' yyyy", { locale: es }) : "",
    "{salary}": contract.salary.toFixed(2),
    "{salary_words}": numberToWords(contract.salary),
    "{weekly_hours}": (contract.weekly_hours || 48).toString(),
    "{work_schedule}": contract.work_schedule || "Lunes a Viernes de 9:00 AM a 6:00 PM",
    "{work_location}": contract.work_location || employee.site || company.address,
    "{trial_period_days}": (contract.trial_period_days || 90).toString(),
    "{functions}": contract.functions || "",
    "{benefits}": contract.benefits || "",
    "{benefits_additional}": contract.benefits || "",
    "{notes}": contract.notes || "",
    "{activity_cost}": (contract.activity_cost || 0).toFixed(2),
    "{food_cost}": (contract.food_cost || 0).toFixed(2),
    "{transport_cost}": (contract.transport_cost || 0).toFixed(2),
    "{renewable_clause}": contract.renewable ? ", siendo renovable según las necesidades de la empresa" : "",
    "{signed_date}": format(new Date(contract.signed_date || contract.start_date), "dd 'de' MMMM 'de' yyyy", { locale: es }),
    "{company_representative}": company.representative || "",
    "{company_representative_doc}": company.representativeDoc || "",
  };

  // Función para reemplazar variables en texto
  const replaceVariables = (text) => {
    if (!text) return "";
    let result = text;
    Object.keys(variables).forEach(key => {
      result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), variables[key]);
    });
    return result;
  };

  // Función auxiliar para agregar texto con salto de página automático
  const addText = (text, fontSize = 10, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont(undefined, isBold ? 'bold' : 'normal');
    
    const lines = doc.splitTextToSize(text, pageWidth - 2 * margin);
    
    lines.forEach(line => {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += fontSize * 0.5;
    });
    y += 2;
  };

  // Título
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text("CONTRATO DE TRABAJO", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(12);
  doc.text(`${contract.contract_type.toUpperCase()}`, pageWidth / 2, y, { align: "center" });
  y += 8;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Contrato N° ${contract.contract_number || "S/N"}`, pageWidth / 2, y, { align: "center" });
  y += 3;
  doc.text(`Fecha de Firma: ${format(new Date(contract.signed_date || contract.start_date), "dd/MM/yyyy")}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  // Conste por el presente documento
  const introText = template?.introduction_text || 
    `Conste por el presente documento el Contrato de Trabajo ${contract.contract_type}, que celebran al amparo del Texto Único Ordenado del Decreto Legislativo N° 728, Ley de Productividad y Competitividad Laboral, aprobado por Decreto Supremo N° 003-97-TR, y normas complementarias:`;
  addText(replaceVariables(introText), 10);
  y += 3;

  // Datos del empleador
  addText("I. DATOS DEL EMPLEADOR:", 11, true);
  addText(`Empresa: ${company.name}`);
  addText(`RUC: ${company.ruc}`);
  addText(`Domicilio: ${company.address}`);
  addText(`Representante Legal: ${company.representative}`);
  addText(`${company.representativeDoc}`);
  y += 3;

  // Datos del trabajador
  addText("II. DATOS DEL TRABAJADOR:", 11, true);
  addText(`Nombres y Apellidos: ${employee.first_name} ${employee.last_name}`);
  addText(`${employee.document_type}: ${employee.document_number}`);
  addText(`Domicilio: ${employee.address || "No especificado"}, ${employee.district || ""}, ${employee.province || ""}`);
  y += 3;

  // Condiciones del contrato
  addText("III. OBJETO DEL CONTRATO:", 11, true);
  const objectText = template?.contract_object_text ||
    `Por el presente contrato, EL TRABAJADOR se obliga a prestar sus servicios personales a EL EMPLEADOR, desempeñando el cargo de ${contract.position} en el área de ${contract.department || employee.department_name}, bajo subordinación y dependencia de EL EMPLEADOR.`;
  addText(replaceVariables(objectText));
  y += 3;

  // Funciones
  if (contract.functions) {
    addText("IV. FUNCIONES Y RESPONSABILIDADES:", 11, true);
    const functionsIntro = template?.functions_intro_text || "";
    if (functionsIntro) addText(replaceVariables(functionsIntro));
    addText(contract.functions);
    y += 3;
  }

  // Vigencia
  addText("V. VIGENCIA DEL CONTRATO:", 11, true);
  
  if (contract.contract_type === "Indeterminado") {
    const durationText = template?.duration_indeterminate_text ||
      `El presente contrato tiene carácter de INDETERMINADO, iniciando su vigencia el {start_date}.`;
    addText(replaceVariables(durationText));
  } else {
    const durationText = template?.duration_fixed_text ||
      `El presente contrato tendrá una duración determinada, iniciando el {start_date} y finalizando el {end_date}{renewable_clause}.`;
    addText(replaceVariables(durationText));
  }
  
  if (contract.trial_period_days > 0) {
    const trialText = template?.trial_period_text ||
      `El contrato está sujeto a un período de prueba de {trial_period_days} días calendario, durante el cual cualquiera de las partes puede darlo por terminado sin expresión de causa.`;
    addText(replaceVariables(trialText));
  }
  y += 3;

  // Remuneración
  addText("VI. REMUNERACIÓN:", 11, true);
  const salaryText = template?.salary_text ||
    `EL EMPLEADOR pagará a EL TRABAJADOR una remuneración mensual de S/ {salary} ({salary_words} SOLES), pagadera mensualmente, sujeta a los descuentos de ley.`;
  addText(replaceVariables(salaryText));
  
  if (contract.benefits) {
    addText(`Beneficios adicionales: ${contract.benefits}`);
  }
  y += 3;

  // Jornada y horario
  addText("VII. JORNADA Y HORARIO DE TRABAJO:", 11, true);
  const scheduleText = template?.schedule_text ||
    `La jornada laboral será de {weekly_hours} horas semanales, distribuidas de la siguiente manera: {work_schedule}.`;
  addText(replaceVariables(scheduleText));
  
  const locationText = template?.work_location_text ||
    `EL TRABAJADOR prestará sus servicios en: {work_location}.`;
  addText(replaceVariables(locationText));
  y += 3;

  // Obligaciones
  addText("VIII. OBLIGACIONES DEL TRABAJADOR:", 11, true);
  const obligationsText = template?.obligations_text ||
    `1. Cumplir con el horario de trabajo establecido y registrar su asistencia.
2. Desempeñar sus funciones con diligencia, eficiencia y lealtad.
3. Cumplir con el Reglamento Interno de Trabajo y las políticas de la empresa.
4. Guardar confidencialidad sobre la información de la empresa.
5. Cuidar los bienes y recursos de la empresa.`;
  addText(replaceVariables(obligationsText));
  y += 3;

  // Beneficios sociales
  addText("IX. BENEFICIOS SOCIALES:", 11, true);
  const benefitsText = template?.benefits_text ||
    `EL TRABAJADOR tiene derecho a los siguientes beneficios de acuerdo a la legislación laboral peruana:
- Gratificaciones legales (Fiestas Patrias y Navidad)
- Compensación por Tiempo de Servicios (CTS)
- Vacaciones (30 días calendario por año de servicios)
- Asignación familiar (si corresponde)
- Seguro social de salud (EsSalud)`;
  addText(replaceVariables(benefitsText));
  y += 3;

  // Término del contrato
  addText("X. TÉRMINO DEL CONTRATO:", 11, true);
  const terminationText = template?.termination_text ||
    "El presente contrato podrá darse por terminado por las causas previstas en la legislación laboral vigente, especialmente las establecidas en el Decreto Supremo N° 003-97-TR.";
  addText(replaceVariables(terminationText));
  y += 3;

  // Cláusulas Personalizadas
  if (customClauses.length > 0) {
    let clauseNumber = 11;
    const clauseNumberMap = {
      "general": "GENERAL",
      "derechos": "DERECHOS",
      "obligaciones": "OBLIGACIONES",
      "confidencialidad": "CONFIDENCIALIDAD",
      "terminacion": "TERMINACIÓN",
      "otros": "OTROS"
    };

    for (const clause of customClauses) {
      const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
      const numeral = clauseNumber < romanNumerals.length ? romanNumerals[clauseNumber - 1] : `${clauseNumber}`;
      
      addText(`${numeral}. ${clause.title.toUpperCase()}:`, 11, true);
      addText(replaceVariables(clause.content));
      y += 3;
      
      clauseNumber++;
    }
  }

  // Domicilio
  addText("XI. DOMICILIO:", 11, true);
  const domicileText = template?.domicile_text ||
    "Para efectos del presente contrato, las partes señalan como sus domicilios los indicados en la introducción del presente documento.";
  addText(replaceVariables(domicileText));
  y += 10;

  // Firma
  const signatureY = y > pageHeight - 60 ? (doc.addPage(), 40) : y;
  
  doc.setFontSize(10);
  doc.text(
    `Lima, ${format(new Date(contract.signed_date || contract.start_date), "dd 'de' MMMM 'de' yyyy", { locale: es })}`,
    pageWidth / 2,
    signatureY,
    { align: "center" }
  );

  const sigY = signatureY + 30;
  doc.line(30, sigY, 80, sigY);
  doc.line(pageWidth - 80, sigY, pageWidth - 30, sigY);
  
  doc.text("EL EMPLEADOR", 55, sigY + 5, { align: "center" });
  doc.text("EL TRABAJADOR", pageWidth - 55, sigY + 5, { align: "center" });
  
  doc.setFontSize(8);
  doc.text(company.representative, 55, sigY + 10, { align: "center" });
  doc.text(company.representativeDoc, 55, sigY + 14, { align: "center" });
  
  doc.text(`${employee.first_name} ${employee.last_name}`, pageWidth - 55, sigY + 10, { align: "center" });
  doc.text(`${employee.document_type} ${employee.document_number}`, pageWidth - 55, sigY + 14, { align: "center" });

  // Guardar PDF
  doc.save(`Contrato_${employee.last_name}_${employee.first_name}_${contract.contract_number || contract.id}.pdf`);
  
  return doc;
};

// Función auxiliar para convertir números a palabras (simplificada)
const numberToWords = (num) => {
  const units = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const tens = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const hundreds = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];
  
  const n = Math.floor(num);
  
  if (n === 0) return "CERO";
  if (n < 10) return units[n];
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    return tens[ten] + (unit ? " Y " + units[unit] : "");
  }
  if (n < 1000) {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    return (hundred === 1 && rest === 0 ? "CIEN" : hundreds[hundred]) + (rest ? " " + numberToWords(rest) : "");
  }
  if (n < 10000) {
    const thousand = Math.floor(n / 1000);
    const rest = n % 1000;
    return (thousand === 1 ? "MIL" : units[thousand] + " MIL") + (rest ? " " + numberToWords(rest) : "");
  }
  
  return num.toString();
};