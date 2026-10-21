// Exportación a PDF de la planilla y de las boletas de pago (jsPDF).

import jsPDF from "jspdf";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { safePayrollNumber } from "@/lib/payrollUtils";

// Resumen general de la planilla: una línea por trabajador con su neto a pagar.
export const generatePayrollSummaryPDF = ({ payrollType, month, year, payslips = [], allEmployees = [] }) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.text("Planilla de Pagos", pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(12);
  doc.text(`Tipo: ${payrollType}`, 14, 35);
  doc.text(`Periodo: ${format(new Date(year, month - 1), 'MMMM yyyy', { locale: es })}`, 14, 42);

  let yPos = 55;
  payslips.forEach((payslip) => {
    if (yPos > 270) {
      doc.addPage();
      yPos = 20;
    }

    const emp = allEmployees.find(e => e.id === payslip.employee_id);
    const sede = emp?.site ? ` | ${emp.site}` : "";
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`${payslip.employee_code} - ${payslip.employee_name}${sede}`, 14, yPos);
    doc.setFont(undefined, 'normal');

    doc.text(`Salario Base: S/ ${safePayrollNumber(payslip.base_salary).toFixed(2)}`, 14, yPos + 6);
    doc.text(`Total Descuentos: S/ ${safePayrollNumber(payslip.total_deductions).toFixed(2)}`, 100, yPos + 6);
    doc.text(`Neto a Pagar: S/ ${safePayrollNumber(payslip.net_pay).toFixed(2)}`, 14, yPos + 12);

    doc.line(14, yPos + 16, pageWidth - 14, yPos + 16);
    yPos += 22;
  });

  const totalNeto = payslips.reduce((sum, p) => sum + safePayrollNumber(p.net_pay), 0);
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(`Total General: S/ ${totalNeto.toFixed(2)}`, 14, yPos + 5);

  doc.save(`Planilla_${payrollType}_${month}_${year}.pdf`);
  toast.success("PDF generado exitosamente");
};

// Boleta de pago individual, con el desglose AFP/ONP del resumen de cálculo.
export const generatePayslipPDF = async (payslip, employee) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.text("BOLETA DE PAGO", pageWidth / 2, 20, { align: "center" });

  // Employee Info
  doc.setFontSize(10);
  doc.text(`Empleado: ${employee.first_name} ${employee.last_name}`, 14, 35);
  doc.text(`DNI: ${employee.document_type} ${employee.document_number}`, 14, 42);
  doc.text(`Periodo: ${payslip.period}`, 14, 49);
  doc.text(`Tipo: ${payslip.payroll_type}`, 120, 49);

  // Income
  let yPos = 65;
  doc.setFont(undefined, 'bold');
  doc.text("INGRESOS", 14, yPos);
  doc.setFont(undefined, 'normal');
  yPos += 7;
  doc.text(`Salario Base:`, 14, yPos);
  doc.text(`S/ ${safePayrollNumber(payslip.base_salary).toFixed(2)}`, 160, yPos, { align: "right" });
  yPos += 7;
  doc.text(`Total Ingresos:`, 14, yPos);
  doc.setFont(undefined, 'bold');
  doc.text(`S/ ${safePayrollNumber(payslip.total_income).toFixed(2)}`, 160, yPos, { align: "right" });

  // Deductions
  yPos += 15;
  doc.setFont(undefined, 'bold');
  doc.text("DESCUENTOS", 14, yPos);
  doc.setFont(undefined, 'normal');
  yPos += 7;
  // AFP/ONP detallado desde el breakdown cuando está disponible; fallback a la línea
  // agregada pension_deduction para boletas históricas sin breakdown.
  const breakdownDeductions = payslip?.calculation_summary?.breakdown?.deductions?.items;
  const pensionItems = Array.isArray(breakdownDeductions)
    ? breakdownDeductions.filter(d => d.concept_category === "AFP/ONP" || /AFP|ONP/i.test(d.name || ""))
    : [];
  if (pensionItems.length > 0) {
    pensionItems.forEach(item => {
      if (item.amount > 0) {
        doc.text(`${item.name}:`, 14, yPos);
        doc.text(`S/ ${Number(item.amount).toFixed(2)}`, 160, yPos, { align: "right" });
        yPos += 7;
      }
    });
  } else if (safePayrollNumber(payslip.pension_deduction) > 0) {
    doc.text(`Pensiones:`, 14, yPos);
    doc.text(`S/ ${safePayrollNumber(payslip.pension_deduction).toFixed(2)}`, 160, yPos, { align: "right" });
    yPos += 7;
  }
  if (safePayrollNumber(payslip.income_tax) > 0) {
    doc.text(`Renta 5ta:`, 14, yPos);
    doc.text(`S/ ${safePayrollNumber(payslip.income_tax).toFixed(2)}`, 160, yPos, { align: "right" });
    yPos += 7;
  }
  doc.text(`Total Descuentos:`, 14, yPos);
  doc.setFont(undefined, 'bold');
  doc.text(`S/ ${safePayrollNumber(payslip.total_deductions).toFixed(2)}`, 160, yPos, { align: "right" });

  // Net Pay
  yPos += 15;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text("NETO A PAGAR:", 14, yPos);
  doc.text(`S/ ${safePayrollNumber(payslip.net_pay).toFixed(2)}`, 160, yPos, { align: "right" });

  doc.save(`Boleta_${employee.employee_code}_${payslip.period}.pdf`);
  toast.success("Boleta generada");
};

// Genera la boleta de cada trabajador de un grupo de planilla.
export const generateMassivePayslipsPDF = async (payslips, allEmployees = []) => {
  for (const payslip of payslips) {
    const emp = allEmployees.find(e => e.id === payslip.employee_id);
    if (emp) {
      await generatePayslipPDF(payslip, emp);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  toast.success(`${payslips.length} boletas generadas`);
};