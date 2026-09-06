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

// Mismas 3 variantes que ya usa <Badge> en toda la app (ok/alerta/error) —
// no una escala nueva. "Crítico" (HU-8) sigue siendo <= mínimo, pero acá
// se matiza en dos escalones para pantallas que muestran el stock línea
// por línea (ej. RequerimientoDetallePage): por debajo de la mitad del
// mínimo es "error" (rojo), entre la mitad y el mínimo es "alerta" (ámbar),
// por encima del mínimo es "ok" (color normal, sin resaltar).
export function variantePorStock(stockActual, stockMinimo) {
  const actual = Number(stockActual);
  const minimo = Number(stockMinimo);
  if (!Number.isFinite(minimo) || minimo <= 0) return "ok";
  if (actual <= minimo * 0.5) return "error";
  if (actual <= minimo) return "alerta";
  return "ok";
}
