// ============ exportar con el mismo formato de la hoja "Registros" ============
import { mesKey } from './util.js';

const COLS = ['Fecha', 'Mes', 'Tipo', 'Categoría', 'Concepto', 'Presupuestos', 'Monto'];

const ordenadas = movs => [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha));

export async function exportarXlsx(movs) {
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  const filas = ordenadas(movs).map(m => ({
    'Fecha': new Date(`${m.fecha}T12:00:00`),
    'Mes': mesKey(m.fecha),
    'Tipo': m.tipo,
    'Categoría': m.categoria,
    'Concepto': m.concepto,
    'Presupuestos': m.presupuesto ?? '',
    'Monto': m.monto,
  }));
  const hoja = XLSX.utils.json_to_sheet(filas, { header: COLS, cellDates: true });
  hoja['!cols'] = [{ wch: 11 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 26 }, { wch: 13 }, { wch: 11 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Registros');
  XLSX.writeFile(libro, `base-lunar-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportarCsv(movs) {
  const esc = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [COLS.join(';')];
  for (const m of ordenadas(movs)) {
    lineas.push([m.fecha, mesKey(m.fecha), m.tipo, m.categoria, m.concepto,
                 m.presupuesto ?? '', m.monto].map(esc).join(';'));
  }
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `base-lunar-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
