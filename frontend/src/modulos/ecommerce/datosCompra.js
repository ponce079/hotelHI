// Validaciones y formatos de los pasos "Tus datos" y "Pago" (Tomás).
// Funciones puras, testeadas en datosCompra.test.js. Anticipan en el
// navegador las MISMAS reglas que valida el backend (CONTRATO.md → POST
// /api/web/reservas y "Huésped (titular)"); el backend vuelve a validar todo.
//
// TARJETA: estas funciones reciben los datos de la tarjeta como argumento y
// devuelven resultados; no guardan nada. La tarjeta vive solo en el estado
// local de PagoPage.
import { edadEnFecha } from "../../lib/fechas";
import { busquedaComoQueryWeb } from "./busquedaWeb";
import {
  EDAD_MINIMA_TITULAR,
  MAX_SOLICITUDES,
  PAISES,
  codigoPais,
  normalizarTipoDocumento,
} from "./ecommerce.constantes";

export const MAX_NOMBRE = 80;
export const MAX_DOCUMENTO = 30;
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATRON_TELEFONO = /^[\d\s+\-()]{7,40}$/;
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Países para los <select>, ordenados por nombre en español.
export const PAISES_POR_NOMBRE = [...PAISES].sort((a, b) => a[1].localeCompare(b[1], "es"));

const texto = (valor) => String(valor ?? "").trim();

export function esEmail(valor) {
  return PATRON_EMAIL.test(texto(valor));
}

function esFechaReal(iso) {
  if (!PATRON_FECHA.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// Errores del titular, como { campo: mensaje } (vacío = todo bien).
// `fechaDesde` = fecha de ingreso (la edad mínima se mide ahí); `hoy` en
// AAAA-MM-DD (hora argentina).
export function validarHuesped(huesped = {}, { fechaDesde, hoy } = {}) {
  const errores = {};
  const h = huesped ?? {};

  if (!texto(h.nombres)) errores.nombres = "Ingresá tu nombre.";
  else if (texto(h.nombres).length > MAX_NOMBRE) errores.nombres = `Hasta ${MAX_NOMBRE} caracteres.`;

  if (!texto(h.apellido)) errores.apellido = "Ingresá tu apellido.";
  else if (texto(h.apellido).length > MAX_NOMBRE) errores.apellido = `Hasta ${MAX_NOMBRE} caracteres.`;

  if (!normalizarTipoDocumento(h.tipoDocumento)) errores.tipoDocumento = "Elegí un tipo de documento.";
  if (codigoPais(h.paisDocumento) !== texto(h.paisDocumento).toUpperCase() || !texto(h.paisDocumento)) {
    errores.paisDocumento = "Elegí el país que emitió el documento.";
  }

  if (!texto(h.numeroDocumento)) errores.numeroDocumento = "Ingresá el número de documento.";
  else if (texto(h.numeroDocumento).length > MAX_DOCUMENTO) errores.numeroDocumento = `Hasta ${MAX_DOCUMENTO} caracteres.`;

  const nacimiento = texto(h.fechaNacimiento);
  if (!nacimiento) errores.fechaNacimiento = "Ingresá tu fecha de nacimiento.";
  else if (!esFechaReal(nacimiento) || (hoy && nacimiento > hoy)) errores.fechaNacimiento = "La fecha de nacimiento no es válida.";
  else if (fechaDesde && edadEnFecha(nacimiento, fechaDesde) < EDAD_MINIMA_TITULAR) {
    errores.fechaNacimiento = `El titular tiene que tener al menos ${EDAD_MINIMA_TITULAR} años en la fecha de ingreso.`;
  }

  if (!texto(h.email)) errores.email = "Ingresá tu email.";
  else if (!esEmail(h.email)) errores.email = "Ingresá un email válido (por ejemplo, nombre@correo.com).";

  const telefono = texto(h.telefono);
  if (!telefono) errores.telefono = "Ingresá un teléfono de contacto.";
  else if (!PATRON_TELEFONO.test(telefono) || !/\d/.test(telefono)) {
    errores.telefono = "Usá de 7 a 40 caracteres: números, espacios, +, - o paréntesis.";
  }

  // Opcionales: si vienen, tienen que ser un país del catálogo.
  for (const campo of ["nacionalidad", "paisResidencia"]) {
    const valor = texto(h[campo]);
    if (valor && codigoPais(valor) !== valor.toUpperCase()) errores[campo] = "Elegí un país de la lista.";
  }
  return errores;
}

export function validarSolicitudes(textoSolicitudes) {
  return String(textoSolicitudes ?? "").length > MAX_SOLICITUDES ? `Hasta ${MAX_SOLICITUDES} caracteres.` : null;
}

// Datos completos para pasar al pago: titular válido + términos aceptados.
export function datosListosParaPago({ huesped, consentimiento, solicitudesEspeciales, fechaDesde, hoy }) {
  return (
    Object.keys(validarHuesped(huesped, { fechaDesde, hoy })).length === 0 &&
    !validarSolicitudes(solicitudesEspeciales) &&
    consentimiento?.aceptaPoliticas === true
  );
}

// --- Tarjeta ---------------------------------------------------------------

export const soloDigitos = (valor) => String(valor ?? "").replace(/\D/g, "");

export function pasaLuhn(numero) {
  const digitos = soloDigitos(numero);
  if (digitos.length < 12) return false;
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let d = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
}

// Misma regla que la pasarela simulada (CONTRATO.md → marca por prefijo).
export function marcaTarjeta(numero) {
  const n = soloDigitos(numero);
  if (!n) return null;
  if (n.startsWith("4")) return "VISA";
  const dos = Number(n.slice(0, 2));
  const cuatro = Number(n.slice(0, 4));
  if ((dos >= 51 && dos <= 55) || (n.length >= 4 && cuatro >= 2221 && cuatro <= 2720)) return "MASTERCARD";
  if (/^3[47]/.test(n)) return "AMEX";
  return null;
}

export const NOMBRE_MARCA = { VISA: "Visa", MASTERCARD: "Mastercard", AMEX: "American Express" };

// "tarjeta Visa terminada en 4242" (marca OTRA o desconocida: "tarjeta terminada en 4242").
export function textoTarjeta(garantia) {
  if (!garantia) return "";
  const marca = NOMBRE_MARCA[garantia.marca];
  return `tarjeta ${marca ? `${marca} ` : ""}terminada en ${garantia.ultimos4}`;
}

// "4242 4242 4242 4242" (AMEX: "3782 822463 10005"), hasta 19 dígitos.
export function formatearNumeroTarjeta(valor) {
  const n = soloDigitos(valor).slice(0, 19);
  if (/^3[47]/.test(n)) return [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15), n.slice(15)].filter(Boolean).join(" ");
  return n.replace(/(\d{4})(?=\d)/g, "$1 ");
}

// Máscara MM/AA mientras se tipea. Al borrar (`anterior` más largo) se
// respeta lo que quedó, así la barra se puede borrar.
export function formatearVencimiento(valor, anterior = "") {
  const crudo = String(valor ?? "");
  if (String(anterior).length > crudo.length) return crudo.replace(/[^\d/]/g, "").slice(0, 5);
  let d = soloDigitos(crudo).slice(0, 4);
  // "4" → "04/": un mes de un dígito mayor a 1 no puede seguir.
  if (d.length === 1 && Number(d) > 1) d = `0${d}`;
  if (d.length >= 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

// "MM/AA" → { mes, anio } (anio con 4 dígitos) o null.
export function leerVencimiento(valor) {
  const m = /^(\d{2})\/(\d{2})$/.exec(String(valor ?? "").trim());
  if (!m) return null;
  const mes = Number(m[1]);
  if (mes < 1 || mes > 12) return null;
  return { mes, anio: 2000 + Number(m[2]) };
}

// Último día del mes de vencimiento (la tarjeta vale hasta ese día).
function finDeMes({ mes, anio }) {
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

// Errores de la tarjeta, como { campo: mensaje }. Campos del formulario:
// titular, numero, vencimiento (MM/AA) y cvv. `hoy` y `fechaHasta` en
// AAAA-MM-DD: anticipa "vencida" (402 del backend) y "vence antes de la
// salida" (422 TARJETA_VENCE_ANTES); el mismo mes de la salida vale.
export function validarTarjeta(tarjeta = {}, { hoy, fechaHasta } = {}) {
  const errores = {};
  if (!texto(tarjeta.titular)) errores.titular = "Ingresá el nombre como figura en la tarjeta.";

  const numero = soloDigitos(tarjeta.numero);
  if (!numero) errores.numero = "Ingresá el número de la tarjeta.";
  else if (numero.length < 13 || numero.length > 19 || !pasaLuhn(numero)) errores.numero = "Revisá el número de la tarjeta.";

  const vencimiento = leerVencimiento(tarjeta.vencimiento);
  if (!texto(tarjeta.vencimiento)) errores.vencimiento = "Ingresá el vencimiento.";
  else if (!vencimiento) errores.vencimiento = "Usá el formato MM/AA (por ejemplo, 08/29).";
  else if (hoy && finDeMes(vencimiento) < hoy) errores.vencimiento = "La tarjeta está vencida.";
  else if (fechaHasta && finDeMes(vencimiento) < fechaHasta) {
    errores.vencimiento = "La tarjeta vence antes de tu fecha de salida. Usá otra tarjeta.";
  }

  // AMEX: 4 dígitos al frente; Visa y Mastercard: 3 al dorso; otra marca: 3 o 4.
  const cvv = String(tarjeta.cvv ?? "").trim();
  const marca = marcaTarjeta(numero);
  const largos = marca === "AMEX" ? [4] : marca ? [3] : [3, 4];
  if (!cvv) errores.cvv = "Ingresá el código de seguridad.";
  else if (!/^\d+$/.test(cvv) || !largos.includes(cvv.length)) {
    errores.cvv =
      marca === "AMEX"
        ? "Son los 4 dígitos del frente de la tarjeta."
        : marca
          ? "Son los 3 dígitos del dorso de la tarjeta."
          : "Son los 3 o 4 dígitos de seguridad de la tarjeta.";
  }
  return errores;
}

// Forma del contrato para `tarjeta` en POST /api/web/reservas.
export function tarjetaParaEnviar(tarjeta) {
  const vencimiento = leerVencimiento(tarjeta.vencimiento);
  return {
    titular: texto(tarjeta.titular),
    numero: soloDigitos(tarjeta.numero),
    vencimientoMes: vencimiento?.mes,
    vencimientoAnio: vencimiento?.anio,
    cvv: soloDigitos(tarjeta.cvv),
  };
}

// --- Errores del servidor ---------------------------------------------------

// `campo` de un DATOS_INVALIDOS → dónde se corrige.
//   { paso: "pago", campo: "numero" | "vencimiento" | "titular" | "cvv" }
//   { paso: "datos", campo: "<campo del titular>" | "solicitudesEspeciales" | "consentimiento" | "llegada" }
//   null si no es de ninguno de los dos pasos (fechas, plan, habitaciones…).
export function ubicarCampoServidor(campo) {
  const c = String(campo ?? "");
  if (c.startsWith("tarjeta.")) {
    const sub = c.slice("tarjeta.".length);
    return { paso: "pago", campo: sub === "vencimientoMes" || sub === "vencimientoAnio" ? "vencimiento" : sub };
  }
  if (c.startsWith("huesped.")) return { paso: "datos", campo: c.slice("huesped.".length) };
  if (c === "solicitudesEspeciales") return { paso: "datos", campo: "solicitudesEspeciales" };
  if (c.startsWith("consentimiento")) return { paso: "datos", campo: "consentimiento" };
  if (c.startsWith("llegada")) return { paso: "datos", campo: "llegada" };
  return null;
}

// --- Navegación ----------------------------------------------------------------

// /web/resultados con la búsqueda del proceso (la UI maneja una habitación;
// si hubiera más, se suman los huéspedes). Sin fechas, /web/resultados solo:
// resultados completa la búsqueda con la del contexto.
export function rutaResultados({ fechaDesde, fechaHasta, ocupacion } = {}) {
  if (!fechaDesde || !fechaHasta) return "/web/resultados";
  const adultos = (ocupacion ?? []).reduce((s, h) => s + Number(h.adultos || 0), 0) || 1;
  const menores = (ocupacion ?? []).reduce((s, h) => s + Number(h.menores || 0), 0);
  return `/web/resultados?${busquedaComoQueryWeb({ fechaDesde, fechaHasta, adultos, menores })}`;
}
