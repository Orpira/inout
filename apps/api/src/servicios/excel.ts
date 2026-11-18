import ExcelJS from "exceljs";

export interface FilaExtrasDiarias {
  marcacionId: number;
  empleadoId: number;
  /** YYYY-MM-DD (día de la entrada, hora de Colombia). */
  fecha: string;
  empleado: string;
  identificacion: string;
  /** HH:MM */
  entrada: string;
  salida: string | null;
  salidaAutomatica: boolean;
  codigoCentro: string | null;
  centro: string | null;
  minDiurnas: number;
  minNocturnas: number;
  minFestivas: number;
  minPendientes: number;
}

const AZUL = "FF4472C4";
const AZUL_CLARO = "FFD9E1F2";
const AMARILLO = "FFFFFF00";

/** Fecha YYYY-MM-DD como fecha de Excel (sin desfase de zona: Excel no guarda zona). */
const fechaExcel = (f: string) => new Date(`${f}T00:00:00Z`);
/** HH:MM como fracción de día, que Excel muestra con formato de hora. */
const horaExcel = (h: string) => {
  const [hh, mm] = h.split(":").map(Number);
  return ((hh ?? 0) * 60 + (mm ?? 0)) / 1440;
};
const horas = (min: number) => Math.round((min / 60) * 100) / 100;

/**
 * Reporte mensual de horas extra con el formato que usa nómina:
 * encabezado con el rango y la empresa, una fila por día trabajado con extras y totales con fórmulas.
 */
export function libroExtrasDiarias({ desde, hasta, empresa, filas }: { desde: string; hasta: string; empresa: string; filas: FilaExtrasDiarias[] }) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "INOUT";
  libro.created = new Date();
  const hoja = libro.addWorksheet("Horas extra", {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" },
  });
  hoja.columns = [
    { key: "fecha", width: 24 },
    { key: "empleado", width: 34 },
    { key: "cedula", width: 14 },
    { key: "ingreso", width: 11 },
    { key: "salida", width: 11 },
    { key: "diurnas", width: 12 },
    { key: "nocturnas", width: 12 },
    { key: "festivas", width: 12 },
    { key: "pendientes", width: 14 },
    { key: "centro", width: 26 },
  ];

  const etiqueta = (celda: string, texto: string, valor: Date) => {
    hoja.getCell(celda).value = texto;
    hoja.getCell(celda).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARILLO } };
    const v = hoja.getCell(celda.replace("A", "B"));
    v.value = valor;
    v.numFmt = "yyyy-mm-dd";
    v.alignment = { horizontal: "left" };
  };
  etiqueta("A1", "Fecha inicial", fechaExcel(desde));
  etiqueta("A2", "Fecha final", fechaExcel(hasta));
  hoja.getCell("C1").value = empresa;
  hoja.getCell("C1").font = { bold: true };
  hoja.getCell("C2").value = "Reporte horas extra, mensual";

  const titulos = ["Fecha", "Empleado", "Cédula", "Hora ing.", "Hora sal.", "Ext. diurnas", "Ext. nocturnas", "Ext. festivos", "Por aprobar", "Centro de costo"];
  const cab = hoja.getRow(4);
  cab.values = titulos;
  cab.height = 32;
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  const primera = 5;
  filas.forEach((f, i) => {
    const fila = hoja.getRow(primera + i);
    fila.values = [
      fechaExcel(f.fecha),
      f.empleado,
      f.identificacion,
      horaExcel(f.entrada),
      f.salida ? horaExcel(f.salida) : null,
      horas(f.minDiurnas),
      horas(f.minNocturnas),
      horas(f.minFestivas),
      f.minPendientes ? horas(f.minPendientes) : null,
      f.centro ? (f.codigoCentro ? `${f.codigoCentro} · ${f.centro}` : f.centro) : null,
    ];
    // [$-240A] = español de Colombia: el día sale en español aunque Excel esté en otro idioma.
    fila.getCell(1).numFmt = '[$-240A]dddd", "dd/mm/yyyy';
    fila.getCell(1).alignment = { horizontal: "right" };
    fila.getCell(3).numFmt = "@";
    fila.getCell(4).numFmt = "h:mm";
    fila.getCell(5).numFmt = "h:mm";
    for (let c = 6; c <= 9; c++) fila.getCell(c).numFmt = "0.00";
    if (f.salidaAutomatica) fila.getCell(5).note = "Salida puesta por el sistema con la hora del horario (el empleado no marcó).";
    if (i % 2 === 0) fila.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_CLARO } }));
  });

  const ultima = primera + filas.length - 1;
  const total = hoja.getRow(ultima + 1);
  total.getCell(1).value = "Total";
  for (const [col, letra] of [[6, "F"], [7, "G"], [8, "H"], [9, "I"]] as const) {
    total.getCell(col).value = filas.length ? { formula: `SUM(${letra}${primera}:${letra}${ultima})` } : 0;
    total.getCell(col).numFmt = "0.00";
  }
  total.font = { bold: true };
  total.eachCell({ includeEmpty: true }, (c) => (c.border = { top: { style: "thin" } }));

  if (filas.length) hoja.autoFilter = { from: { row: 4, column: 1 }, to: { row: ultima, column: titulos.length } };
  hoja.getCell(`A${ultima + 3}`).value =
    "Horas en decimales. Ext. festivos incluye las extras diurnas y nocturnas en domingo o festivo. Por aprobar: extras calculadas que aún no se han aprobado (no incluidas en las otras columnas).";
  hoja.getCell(`A${ultima + 3}`).font = { italic: true, color: { argb: "FF666666" } };
  return libro;
}
