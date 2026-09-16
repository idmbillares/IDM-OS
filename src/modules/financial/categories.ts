/**
 * Starter suggestions only. They intentionally remain outside the database so
 * a future Configuración catalogue can replace this source without changing
 * ledger rows or their historical category text.
 */
export const financialCategorySuggestions = {
  expense: [
    "Materia prima",
    "Nómina",
    "Transporte/viáticos",
    "Servicios",
    "Herramientas/equipos",
    "Gastos administrativos",
    "Mantenimiento",
    "Otros egresos",
  ],
  income: [
    "Venta de mesa",
    "Servicio técnico",
    "Venta de accesorios",
    "Abono de cliente",
    "Arriendo de mesa",
    "Otros ingresos",
  ],
} as const;
