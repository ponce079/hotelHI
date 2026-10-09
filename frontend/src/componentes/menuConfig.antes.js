// HU-117 / HU-71: el menú nuevo solo cambia el orden y la agrupación. Estas son las rutas que cada rol veía en el
// menú ANTERIOR (menuConfig.js previo a HU-117, filtrado con item.roles.includes(rol)); no se recalculan a partir
// del código actual para que el test detecte cualquier cambio de permisos.
export const RUTAS_ANTES = {
  admin: ["/","/articulos","/check-in","/check-out","/comprobantes-estadia","/depositos","/habitaciones","/historial-mantenimiento","/movimientos","/movimientos-pago","/personas-alojadas","/proveedores","/recepciones","/reservas","/servicios-adicionales","/stock/minmax","/tarifas","/tipos-habitacion","/tipos-movimiento","/usuarios"],
  deposito: ["/","/articulos","/depositos","/movimientos","/ordenes-compra","/recepciones","/requerimientos"],
  compras: ["/","/alertas","/comprobantes","/depositos","/ordenes-compra","/pagos","/presupuestos","/proveedores","/recepciones","/requerimientos","/stock/minmax"],
  gerente: ["/","/alertas","/depositos","/ordenes-compra","/pagos","/presupuestos","/recepciones","/reporte","/reporte-caja-diaria","/reservas","/tarifas","/tipos-habitacion"],
  recepcionista: ["/","/check-in","/check-out","/comprobantes-estadia","/depositos","/habitaciones","/historial-mantenimiento","/movimientos-pago","/personas-alojadas","/reservas","/servicios-adicionales","/tarifas","/tipos-habitacion"],
  housekeeping: ["/","/depositos","/habitaciones","/historial-mantenimiento"],
};
