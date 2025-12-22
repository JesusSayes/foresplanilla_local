import React from "react";
import { Button } from "@/components/ui/button";
import { FileDown, FileText } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import "jspdf-autotable";

export function exportToCSV(data, columns, reportName) {
  if (!data || data.length === 0) {
    return;
  }

  const headers = columns.map(col => col.label || col.id);
  const rows = data.map(row => 
    columns.map(col => {
      const value = row[col.id];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    })
  );

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${reportName}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
}

export function exportToPDF(data, columns, reportName, reportType) {
  if (!data || data.length === 0) {
    return;
  }

  const doc = new jsPDF('l', 'mm', 'a4');
  
  // Header
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text(reportName, 14, 15);
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Tipo: ${reportType}`, 14, 22);
  doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 27);
  doc.text(`Total registros: ${data.length}`, 14, 32);

  // Table
  const headers = columns.map(col => col.label || col.id);
  const rows = data.map(row => 
    columns.map(col => {
      const value = row[col.id];
      if (value === null || value === undefined) return '';
      if (typeof value === 'boolean') return value ? 'Sí' : 'No';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    })
  );

  doc.autoTable({
    head: [headers],
    body: rows,
    startY: 37,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${reportName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export default function ReportExporter({ data, columns, reportName, reportType }) {
  return (
    <div className="flex gap-2">
      <Button
        onClick={() => exportToCSV(data, columns, reportName)}
        variant="outline"
        className="flex-1"
        disabled={!data || data.length === 0}
      >
        <FileText className="w-4 h-4 mr-2" />
        Exportar CSV
      </Button>
      <Button
        onClick={() => exportToPDF(data, columns, reportName, reportType)}
        variant="outline"
        className="flex-1"
        disabled={!data || data.length === 0}
      >
        <FileDown className="w-4 h-4 mr-2" />
        Exportar PDF
      </Button>
    </div>
  );
}