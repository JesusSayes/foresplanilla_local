import React from "react";
import { Button } from "@/components/ui/button";
import { FileDown, FileText } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";

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

  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Header
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(reportName, 14, 15);
  
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(`Tipo: ${reportType}`, 14, 22);
  doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 27);
  doc.text(`Total registros: ${data.length}`, 14, 32);

  // Simple table rendering
  let y = 40;
  const lineHeight = 6;
  const colWidth = 180 / Math.min(columns.length, 5);
  
  // Headers
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  columns.slice(0, 5).forEach((col, i) => {
    doc.text(col.label || col.id, 14 + (i * colWidth), y);
  });
  
  y += lineHeight;
  doc.setFont(undefined, 'normal');
  
  // Rows (limited to first 50 for PDF)
  data.slice(0, 50).forEach(row => {
    if (y > 280) return; // Page limit
    
    columns.slice(0, 5).forEach((col, i) => {
      const value = row[col.id];
      let displayValue = '';
      if (value === null || value === undefined) displayValue = '';
      else if (typeof value === 'boolean') displayValue = value ? 'Sí' : 'No';
      else if (typeof value === 'object') displayValue = JSON.stringify(value).substring(0, 20);
      else displayValue = String(value).substring(0, 30);
      
      doc.text(displayValue, 14 + (i * colWidth), y);
    });
    y += lineHeight;
  });
  
  if (data.length > 50) {
    y += 5;
    doc.setFontSize(7);
    doc.text(`Nota: Mostrando primeros 50 registros de ${data.length}. Use CSV para exportar todos.`, 14, y);
  }

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