import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Printer, FileSpreadsheet, X, Users, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";
import { formatMoney, safePayrollNumber } from "@/lib/payrollUtils";

export default function CartasBancosModal({ grupo, allEmployees, companyInfo, banks, onClose }) {
  const [printing, setPrinting] = useState(null); // bank name being printed

  // Agrupar boletas firmadas por banco del empleado
  const bankGroups = useMemo(() => {
    const map = {};
    grupo.payslips.forEach(p => {
      const emp = allEmployees.find(e => e.id === p.employee_id);
      if (!emp) return;
      const bankName = (emp.bank_name || "SIN BANCO").trim().toUpperCase();
      if (!map[bankName]) {
        map[bankName] = { bankName, items: [], total: 0 };
      }
      const neto = safePayrollNumber(p.net_pay);
      map[bankName].items.push({ payslip: p, employee: emp, neto });
      map[bankName].total += neto;
    });
    return Object.values(map).sort((a, b) => a.bankName.localeCompare(b.bankName));
  }, [grupo, allEmployees]);

  const getBankRecord = (bankName) => {
    return (banks || []).find(b =>
      (b.name || "").trim().toUpperCase() === bankName
    );
  };

  const formatDateLima = () => {
    return format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es }).toUpperCase();
  };

  // Genera la carta + anexo en HTML para imprimir
  const handlePrintCarta = (bankGroup) => {
    setPrinting(bankGroup.bankName);
    const bank = getBankRecord(bankGroup.bankName);
    const ci = companyInfo || {};
    const companyAccount = bank?.company_account_number || "____________________";

    const rows = bankGroup.items.map((item, idx) => `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${item.employee.first_name} ${item.employee.last_name}</td>
        <td style="text-align:center">${item.employee.document_type || "DNI"}</td>
        <td style="text-align:center">${item.employee.document_number || ""}</td>
        <td style="text-align:right">S/ ${item.neto.toFixed(2)}</td>
        <td style="text-align:center">${item.employee.bank_account || item.employee.cci_account || ""}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Carta ${bankGroup.bankName} - ${grupo.period}</title>
<style>
  @page { size: A4 portrait; margin: 25mm 20mm; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #000; line-height: 1.6; }
  .letter { margin-bottom: 30px; }
  .date { text-align: right; margin-bottom: 30px; }
  .bank-name { margin-bottom: 5px; font-weight: bold; }
  .greeting { margin: 20px 0; }
  .body { text-align: justify; margin: 15px 0; }
  .closing { margin-top: 40px; }
  .annex-title { margin-top: 0; text-align: center; font-weight: bold; font-size: 13pt; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; }
  th, td { border: 1px solid #000; padding: 5px 8px; }
  th { background: #f0f0f0; font-weight: bold; text-align: center; }
  .total-row { font-weight: bold; background: #f9f9f9; }
  .page-break { page-break-after: always; }
</style>
</head>
<body>
  <div class="letter">
    <div class="date">LIMA, ${formatDateLima()}</div>
    <div class="bank-name">Señores:</div>
    <div class="bank-name">${bankGroup.bankName}</div>
    <div style="margin-top:15px">Presente.-</div>
    <div class="greeting">De mi especial consideración:</div>
    <div class="body">
      Por medio de la presente, a nombre de <strong>${ci.company_name || ""}</strong> con RUC N° <strong>${ci.ruc || ""}</strong>, con domicilio en ${ci.address || ""}, me dirijo a ustedes a fin de solicitarles se sirvan a cargar a nuestra cuenta en moneda nacional de nuestra titularidad N° <strong>${companyAccount}</strong> el pago de ${grupo.payroll_type === "Quincenal" ? "adelanto" : "liquidación"} de nuestro personal correspondiente al período <strong>${grupo.period}</strong>, de acuerdo al detalle en anexo adjunto.
    </div>
    <div class="closing">Atentamente,</div>
    <div style="margin-top:50px;">
      <div style="border-top: 1px solid #000; width: 250px; padding-top: 5px;">
        <strong>${ci.legal_representative || ""}</strong><br/>
        ${ci.legal_representative_position || "Representante Legal"}<br/>
        ${ci.company_name || ""}
      </div>
    </div>
  </div>

  <div class="page-break"></div>

  <div class="annex-title">ANEXO - ${bankGroup.bankName}</div>
  <div style="text-align:center; margin-top:5px;">${grupo.period} · ${grupo.payroll_type}</div>
  <table>
    <thead>
      <tr>
        <th style="width:40px">N°</th>
        <th>Beneficiario - Nombre</th>
        <th style="width:60px">Doc. Tipo</th>
        <th style="width:90px">Documento</th>
        <th style="width:90px">Monto (S/)</th>
        <th style="width:140px">Cuenta - Número</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right">TOTAL</td>
        <td style="text-align:right">S/ ${bankGroup.total.toFixed(2)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:20px; font-size:10pt;">
    <strong>Total a cargar:</strong> S/ ${bankGroup.total.toFixed(2)} (${bankGroup.items.length} trabajador(es))
  </div>

  <script>window.onload=function(){window.print();}</script>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) {
      alert("Permita las ventanas emergentes para imprimir.");
      setPrinting(null);
      return;
    }
    win.document.write(html);
    win.document.close();
    setPrinting(null);
  };

  // Exporta el anexo a Excel (formato estándar de banca peruana)
  const handleExportExcel = (bankGroup) => {
    const data = bankGroup.items.map((item, idx) => ({
      " ": idx + 1,
      "Beneficiario - Nombre": `${item.employee.first_name} ${item.employee.last_name}`,
      "Documento - Tipo": item.employee.document_type || "DNI",
      "Documento": item.employee.document_number || "",
      "Monto - Moneda": "S/",
      "Monto": item.neto.toFixed(2),
      "T/C": "-",
      "Monto abonado - Moneda": "-",
      "Monto abonado": "-",
      "Cuenta - T": "A",
      "Cuenta - M": "S/",
      "Cuenta - Número": item.employee.bank_account || item.employee.cci_account || "",
      "Estado": "PROCESADA",
      "Observación": "Ninguna",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 5 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 15 }, { wch: 10 },
      { wch: 10 }, { wch: 25 }, { wch: 12 }, { wch: 15 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payment_report");
    const fileName = `Lista_Pago_${bankGroup.bankName.replace(/\s+/g, "_")}_${grupo.period.replace(/\s+/g, "_")}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-blue-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Building2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Cartas a Bancos</h2>
              <p className="text-sm text-slate-500">{grupo.period} · {grupo.payroll_type} · {grupo.payslips.length} boleta(s) firmada(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <strong>Importante:</strong> Verifique que la cuenta de la empresa esté configurada en cada banco (Datos Maestros → Bancos → campo "N° Cuenta Empresa") para que la carta incluya el número de cuenta correcto. Los trabajadores sin banco asignado se agrupan en "SIN BANCO".
          </div>

          {bankGroups.length === 0 ? (
            <div className="text-center py-12 text-slate-400">No hay boletas firmadas en este grupo.</div>
          ) : (
            <div className="space-y-3">
              {bankGroups.map(bg => {
                const bank = getBankRecord(bg.bankName);
                const hasCompanyAccount = !!bank?.company_account_number;
                return (
                  <Card key={bg.bankName} className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                            <h3 className="font-bold text-slate-900 truncate">{bg.bankName}</h3>
                            {hasCompanyAccount ? (
                              <Badge className="bg-green-100 text-green-700 text-[10px]">Cuenta empresa: {bank.company_account_number}</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700 text-[10px]">Sin cuenta empresa configurada</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{bg.items.length} trabajador(es)</span>
                            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{formatMoney(bg.total)}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            disabled={printing === bg.bankName}
                            onClick={() => handlePrintCarta(bg)}
                          >
                            <Printer className="w-3.5 h-3.5 mr-1" />
                            {printing === bg.bankName ? "Generando..." : "Carta + Anexo"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-200 text-green-700 hover:bg-green-50"
                            onClick={() => handleExportExcel(bg)}
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />Excel
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}