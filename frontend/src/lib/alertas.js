// HU-8: un articulo esta en alerta cuando su stock actual llego al minimo
// (o esta por debajo). Se calcula en el cliente sobre las filas que ya
// trae /api/stock (mismo enfoque que MinMax/DepositoDetalle: sin endpoint
// dedicado, porque el dataset es chico y evita duplicar el filtro server-side).
export function calcularAlertas(filasStock) {
  return (filasStock ?? [])
    .filter((f) => f.activo && Number(f.stockActual) <= Number(f.stockMinimo))
    .map((f) => ({
      ...f,
      sugerido: f.stockMaximo != null ? Math.max(0, Number(f.stockMaximo) - Number(f.stockActual)) : null,
    }));
}
