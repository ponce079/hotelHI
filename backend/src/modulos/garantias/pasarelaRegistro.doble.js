// Doble EN MEMORIA de pasarelaRegistro.js, para los tests que no tocan la base. Misma interfaz y mismas
// garantías de unicidad (clave y referencia) y de transición atómica de estado.
//
//   jest.mock("<ruta>/pasarelaRegistro", () => require("<ruta>/pasarelaRegistro.doble"));
//
// `reiniciar()` vacía todo (equivale a una base nueva); `filas()` expone lo registrado.
let filas = [];
let siguienteId = 1;

const copia = (f) => (f ? { ...f } : null);

function guardar(datos) {
  const ahora = new Date();
  const fila = {
    id: siguienteId++,
    claveIdempotencia: null,
    referencia: null,
    referenciaPrevia: null,
    motivo: null,
    marca: null,
    ultimos4: null,
    token: null,
    estadoPreautorizacion: null,
    montoCapturado: null,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...datos,
  };
  filas.push(fila);
  return copia(fila);
}

function chocaCon(datos) {
  if (datos.claveIdempotencia && filas.some((f) => f.claveIdempotencia === datos.claveIdempotencia)) return "clave";
  if (datos.referencia && filas.some((f) => f.referencia === datos.referencia)) return "referencia";
  return null;
}

async function buscarPorClave(claveIdempotencia) {
  return copia(filas.find((f) => f.claveIdempotencia === claveIdempotencia));
}

async function buscarPreautorizacion(referencia) {
  return copia(filas.find((f) => f.referencia === referencia && f.operacion === "PREAUTORIZACION" && f.aprobada));
}

async function crear(datos) {
  const duplicado = chocaCon(datos);
  if (duplicado) return { creada: false, duplicado };
  return { creada: true, fila: guardar(datos) };
}

async function transicionarYCrear({ referencia, desde, hasta, montoCapturado }, datos) {
  const pre = filas.find((f) => f.referencia === referencia && f.operacion === "PREAUTORIZACION" && f.aprobada && f.estadoPreautorizacion === desde);
  if (!pre) return { creada: false, duplicado: "estado" };
  const duplicado = chocaCon(datos);
  if (duplicado) return { creada: false, duplicado };
  pre.estadoPreautorizacion = hasta;
  if (montoCapturado !== undefined) pre.montoCapturado = montoCapturado;
  pre.actualizadoEn = new Date();
  return { creada: true, fila: guardar(datos) };
}

// Para los tests que usan una referencia de preautorización inventada (ej. "PRE-123456") como si el proveedor ya
// la tuviera: la deja registrada, aprobada y Vigente.
function sembrarPreautorizacion({ referencia, monto, estado = "Vigente", montoCapturado = null }) {
  return guardar({
    operacion: "PREAUTORIZACION",
    referencia,
    monto,
    aprobada: true,
    estadoPreautorizacion: estado,
    montoCapturado,
  });
}

function reiniciar() {
  filas = [];
  siguienteId = 1;
}

module.exports = {
  buscarPorClave,
  buscarPreautorizacion,
  crear,
  transicionarYCrear,
  // Solo para tests:
  reiniciar,
  sembrarPreautorizacion,
  filas: () => filas.map(copia),
  _filaPorReferencia: (referencia) => copia(filas.find((f) => f.referencia === referencia)),
};
