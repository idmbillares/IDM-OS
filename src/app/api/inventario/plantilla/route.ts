import ExcelJS from "exceljs";

export const runtime = "nodejs";

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario inicial");
  sheet.columns = [
    { header: "codigo", key: "codigo", width: 22 },
    { header: "producto", key: "producto", width: 34 },
    { header: "categoria", key: "categoria", width: 22 },
    { header: "unidad", key: "unidad", width: 16 },
    { header: "cantidad_inicial", key: "cantidad", width: 18 },
    { header: "costo_unitario", key: "costo", width: 18 },
    { header: "precio_venta", key: "precio", width: 18 },
    { header: "stock_minimo", key: "minimo", width: 16 },
  ];
  sheet.addRow([
    "EJEMPLO-NO-IMPORTAR",
    "Elimina esta fila antes de importar",
    "Ejemplo",
    "unidad",
    0,
    0,
    0,
    0,
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { italic: true, color: { argb: "FFC2410C" } };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Disposition": "attachment; filename=plantilla-inventario-inicial.xlsx",
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Cache-Control": "no-store",
    },
  });
}
