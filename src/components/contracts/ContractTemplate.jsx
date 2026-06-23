import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { entitiesAPI } from "@/api/entitiesClient";
import { getPublicAssetUrl } from "@/api/apiConfig";

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
      const templates = await entitiesAPI.ContractTemplate.list();

      if (templates && templates.length > 0) {
        if (contract.template_id) {
          template = templates.find(t => t.id === contract.template_id);
        }
        if (!template) {
          template = templates.find(t => t.contract_types?.includes(contract.contract_type) && t.is_active);
        }
        if (!template) {
          template = templates.find(t => t.is_default && t.is_active);
        }
        if (!template) {
          template = templates[0];
        }
      }

      // Cargar cláusulas personalizadas
      const clauses = await entitiesAPI.ContractClause.list("order")
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

  // Cargar datos ACTUALES de la empresa desde CompanyInfo SIEMPRE
  let freshCompanyData = {};
  try {
    const companyInfoList = await entitiesAPI.CompanyInfo.list("-created_date");

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

  if (!freshCompanyData.name || !freshCompanyData.ruc) {
    throw new Error("No se encontró información de empresa registrada. Por favor, configure los datos en Configuración de Empresa.");
  }

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
    "{area_trabajo}": contract.area_trabajo || employee.area_trabajo || "",
    "{unidad_trabajo}": contract.unidad_trabajo || employee.unidad_trabajo || "",
    "{department}": contract.area_trabajo || contract.department || employee.department_name || "",
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
    "{activity_cost}": Number(contract.activity_cost || 0).toFixed(2),
    "{food_cost}": Number(contract.food_cost || 0).toFixed(2),
    "{transport_cost}": Number(contract.transport_cost || 0).toFixed(2),
    "{renewable_clause}": contract.renewable ? ", siendo renovable según las necesidades de la empresa" : "",
    "{signed_date}": format(new Date(contract.signed_date || contract.start_date), "dd 'de' MMMM 'de' yyyy", { locale: es }),
    "{company_name}": company.name || "",
    "{company_ruc}": company.ruc || "",
    "{company_address}": company.address || "",
    "{company_representative}": company.representative || "",
    "{company_representative_doc}": company.representativeDoc || "",
  };

  const replaceVariables = (text) => {
    if (!text) return "";
    let result = text;
    Object.keys(variables).forEach(key => {
      result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), variables[key]);
    });
    return result;
  };

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

  // ── TÍTULO ──
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  const contractTitle = replaceVariables(template?.contract_title || "CONTRATO DE TRABAJO");
  const titleLines = contractTitle.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  titleLines.forEach(line => {
    doc.text(line.toUpperCase(), pageWidth / 2, y, { align: "center" });
    y += 7;
  });

  doc.setFontSize(12);
  const contractSubtitle = replaceVariables(template?.contract_subtitle || "{contract_type}");
  doc.text(contractSubtitle.toUpperCase(), pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Contrato N° ${contract.contract_number || "S/N"}`, pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.text(`Fecha de Firma: ${format(new Date(contract.signed_date || contract.start_date), "dd/MM/yyyy")}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  // ── TEXTO INTRODUCTORIO ──
  const introText = template?.introduction_text ||
    `Conste por el presente documento el Contrato de Trabajo ${contract.contract_type}, que celebran al amparo del Texto Único Ordenado del Decreto Legislativo N° 728, Ley de Productividad y Competitividad Laboral, aprobado por Decreto Supremo N° 003-97-TR, y normas complementarias:`;
  addText(replaceVariables(introText), 10);
  y += 3;

  // ── SECCIÓN EMPLEADOR (configurable) ──
  const employerTitle = template?.employer_section_title || "I. DATOS DEL EMPLEADOR:";
  addText(replaceVariables(employerTitle), 11, true);
  const employerText = template?.employer_section_text ||
    "Empresa: {company_name}\nRUC: {company_ruc}\nDomicilio: {company_address}\nRepresentante Legal: {company_representative}\nDocumento: {company_representative_doc}";
  addText(replaceVariables(employerText));
  y += 3;

  // ── SECCIÓN TRABAJADOR (configurable) ──
  const workerTitle = template?.worker_section_title || "II. DATOS DEL TRABAJADOR:";
  addText(replaceVariables(workerTitle), 11, true);
  const workerText = template?.worker_section_text ||
    "Nombres y Apellidos: {employee_name}\n{employee_doc_type}: {employee_doc_number}\nDomicilio: {employee_address}";
  addText(replaceVariables(workerText));
  y += 3;

  // ── OBJETO DEL CONTRATO ──
  addText(replaceVariables(template?.section_object_title || "III. OBJETO DEL CONTRATO:"), 11, true);
  addText(replaceVariables(template?.contract_object_text ||
    "Por el presente contrato, EL TRABAJADOR se obliga a prestar sus servicios personales a EL EMPLEADOR, desempeñando el cargo de {position} en el área de {department}, bajo subordinación y dependencia de EL EMPLEADOR."));
  y += 3;

  // ── FUNCIONES Y RESPONSABILIDADES ──
  addText(replaceVariables(template?.section_functions_title || "IV. FUNCIONES Y RESPONSABILIDADES:"), 11, true);
  const functionsIntro = template?.functions_intro_text || "El trabajador desempeñará las siguientes funciones y responsabilidades:";
  if (functionsIntro) addText(replaceVariables(functionsIntro));
  if (contract.functions) addText(replaceVariables(contract.functions));
  y += 3;

  // ── VIGENCIA ──
  addText(replaceVariables(template?.section_duration_title || "V. VIGENCIA DEL CONTRATO:"), 11, true);
  if (contract.contract_type === "Indeterminado") {
    addText(replaceVariables(template?.duration_indeterminate_text ||
      "El presente contrato tiene carácter de INDETERMINADO, iniciando su vigencia el {start_date}."));
  } else {
    addText(replaceVariables(template?.duration_fixed_text ||
      "El presente contrato tendrá una duración determinada, iniciando el {start_date} y finalizando el {end_date}{renewable_clause}."));
  }
  if (contract.trial_period_days > 0) {
    addText(replaceVariables(template?.trial_period_text ||
      "El contrato está sujeto a un período de prueba de {trial_period_days} días calendario, durante el cual cualquiera de las partes puede darlo por terminado sin expresión de causa."));
  }
  y += 3;

  // ── REMUNERACIÓN ──
  addText(replaceVariables(template?.section_salary_title || "VI. REMUNERACIÓN:"), 11, true);
  addText(replaceVariables(template?.salary_text ||
    "EL EMPLEADOR pagará a EL TRABAJADOR una remuneración mensual de S/ {salary} ({salary_words} SOLES), pagadera mensualmente, sujeta a los descuentos de ley."));
  if (contract.activity_cost > 0) addText(`Costo de Actividad: S/ ${(contract.activity_cost || 0).toFixed(2)}`);
  if (contract.food_cost > 0) addText(`Costo de Alimento: S/ ${(contract.food_cost || 0).toFixed(2)}`);
  if (contract.transport_cost > 0) addText(`Costo de Movilidad: S/ ${(contract.transport_cost || 0).toFixed(2)}`);
  if (contract.benefits) addText(`Beneficios adicionales: ${contract.benefits}`);
  y += 3;

  // ── JORNADA Y HORARIO ──
  addText(replaceVariables(template?.section_schedule_title || "VII. JORNADA Y HORARIO DE TRABAJO:"), 11, true);
  addText(replaceVariables(template?.schedule_text ||
    "La jornada laboral será de {weekly_hours} horas semanales, distribuidas de la siguiente manera: {work_schedule}."));
  addText(replaceVariables(template?.work_location_text ||
    "EL TRABAJADOR prestará sus servicios en: {work_location}."));
  y += 3;

  // ── OBLIGACIONES ──
  addText(replaceVariables(template?.section_obligations_title || "VIII. OBLIGACIONES DEL TRABAJADOR:"), 11, true);
  addText(replaceVariables(template?.obligations_text ||
    `1. Cumplir con el horario de trabajo establecido y registrar su asistencia.\n2. Desempeñar sus funciones con diligencia, eficiencia y lealtad.\n3. Cumplir con el Reglamento Interno de Trabajo y las políticas de la empresa.\n4. Guardar confidencialidad sobre la información de la empresa.\n5. Cuidar los bienes y recursos de la empresa.`));
  y += 3;

  // ── BENEFICIOS SOCIALES ──
  addText(replaceVariables(template?.section_benefits_title || "IX. BENEFICIOS SOCIALES:"), 11, true);
  addText(replaceVariables(template?.benefits_text ||
    `EL TRABAJADOR tiene derecho a los siguientes beneficios de acuerdo a la legislación laboral peruana:\n- Gratificaciones legales (Fiestas Patrias y Navidad)\n- Compensación por Tiempo de Servicios (CTS)\n- Vacaciones (30 días calendario por año de servicios)\n- Asignación familiar (si corresponde)\n- Seguro social de salud (EsSalud)`));
  y += 3;

  // ── TÉRMINO DEL CONTRATO ──
  addText(replaceVariables(template?.section_termination_title || "X. TÉRMINO DEL CONTRATO:"), 11, true);
  addText(replaceVariables(template?.termination_text ||
    "El presente contrato podrá darse por terminado por las causas previstas en la legislación laboral vigente, especialmente las establecidas en el Decreto Supremo N° 003-97-TR."));
  y += 3;

  // ── DOMICILIO ──
  addText(replaceVariables(template?.section_domicile_title || "XI. DOMICILIO:"), 11, true);
  addText(replaceVariables(template?.domicile_text ||
    "Para efectos del presente contrato, las partes señalan como sus domicilios los indicados en la introducción del presente documento."));
  y += 3;

  // ── NOTAS (si existen) ──
  if (contract.notes) {
    addText("NOTAS:", 11, true);
    addText(replaceVariables(contract.notes));
    y += 3;
  }

  // ── CLÁUSULAS PERSONALIZADAS ──
  if (customClauses.length > 0) {
    const romanNumerals = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"];
    let clauseNumber = 12;
    for (const clause of customClauses) {
      const numeral = clauseNumber <= romanNumerals.length ? romanNumerals[clauseNumber - 1] : `${clauseNumber}`;
      addText(`${numeral}. ${clause.title.toUpperCase()}:`, 11, true);
      addText(replaceVariables(clause.content));
      y += 3;
      clauseNumber++;
    }
  }

  y += 7;

  // ── FIRMA ──
  if (y > pageHeight - 60) {
    doc.addPage();
    y = 40;
  }

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(
    `Lima, ${format(new Date(contract.signed_date || contract.start_date), "dd 'de' MMMM 'de' yyyy", { locale: es })}`,
    pageWidth / 2,
    y,
    { align: "center" }
  );

  const sigY = y + 30;

  // La firma digital del representante legal va al lado del EMPLEADOR (izquierda)
  if (contract.digital_signature_image_url && contract.is_digitally_signed) {
    try {
      await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const maxW = 40;
          const maxH = 20;
          const ratio = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * ratio;
          const h = img.height * ratio;
          // Centrado sobre la línea del EMPLEADOR (izquierda: x entre 30 y 80, centro = 55)
          const sigImgX = 55 - w / 2;
          const sigImgY = sigY - h - 2;
          doc.addImage(img, 'PNG', sigImgX, sigImgY, w, h);
          resolve();
        };
        img.onerror = () => resolve();

        // img.src = contract.digital_signature_image_url;
        console.log(contract.digital_signature_image_url);
        console.log(getPublicAssetUrl(contract.digital_signature_image_url));
        img.src = getPublicAssetUrl(contract.digital_signature_image_url);
      });
    } catch (error)
    { /* continuar sin imagen */
      console.log(error.message);
    }
  }

  doc.line(30, sigY, 80, sigY);
  doc.line(pageWidth - 80, sigY, pageWidth - 30, sigY);

  doc.text("EL EMPLEADOR", 55, sigY + 5, { align: "center" });
  doc.text("EL TRABAJADOR", pageWidth - 55, sigY + 5, { align: "center" });

  doc.setFontSize(8);
  doc.text(company.representative || "", 55, sigY + 10, { align: "center" });
  doc.text(company.representativeDoc || "", 55, sigY + 14, { align: "center" });

  doc.text(`${employee.first_name} ${employee.last_name}`, pageWidth - 55, sigY + 10, { align: "center" });
  doc.text(`${employee.document_type} ${employee.document_number}`, pageWidth - 55, sigY + 14, { align: "center" });

  // Nota de validación de firma digital
  if (contract.is_digitally_signed && contract.digital_signature_name) {
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 200);
    const sigNote = `Firmado digitalmente por: ${contract.digital_signature_name} | ${contract.digital_signature_date ? new Date(contract.digital_signature_date).toLocaleString('es-PE') : ''}`;
    doc.text(sigNote, pageWidth / 2, sigY + 22, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

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
