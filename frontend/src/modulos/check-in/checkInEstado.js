// Estado de la pantalla única de check-in (con reserva y walk-in). Lógica pura: sin React ni
// llamadas a la API, para poder probarla sola.
//
// Invariante: las filas de cada habitación son exactamente su ocupación (adultos primero,
// después menores). Agregar o quitar a alguien cambia la ocupación y las filas a la vez.
import { codigoPais } from "../../lib/paises";
import { normalizarTipoDocumento } from "../../lib/tiposDocumento";
import { edadEnFecha, formatearFechaDdMmAaaa, ddMmAaaaAISO } from "../../lib/fechas";
import { EDAD_ADULTO_OCUPACION } from "./checkInPantalla.constantes";
import { MEDIOS_GARANTIA } from "./checkIn.constantes";

let ultimoId = 0;
// Id temporal de cada fila: es el `id` de la persona en el envío (y el que devuelve el backend
// en PERSONA_ALOJADA).
export const nuevoIdFila = () => ++ultimoId;

// Campos que se heredan cuando no se cargan en la fila (ver resolverCampos).
export const HEREDABLES_ACOMPANANTE = ["paisResidencia"]; // adulto no titular <- titular de su habitación
export const HEREDABLES_MENOR = ["nacionalidad", "paisResidencia"]; // menor <- su adulto responsable

const CAMPOS_VACIOS = {
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  numeroDocumento: "",
  nombre: "",
  apellido: "",
  fechaNacimiento: "", // dd/mm/aaaa, como se tipea
  nacionalidad: "",
  paisResidencia: "",
  localidad: "",
  domicilio: "",
  telefono: "",
  email: "",
};

export function nuevaFila(tipo, habitacionClave, campos = {}, extra = {}) {
  return {
    id: nuevoIdFila(),
    habitacionClave,
    tipo, // "adulto" | "menor"
    esTitular: false,
    precargada: false,
    // Los menores pueden ingresar sin documento ("Agregar documento (recomendado)").
    conDocumento: tipo === "adulto",
    responsableId: null, // null = el titular de la habitación
    corregidos: [], // campos heredables que se cargaron a mano: dejan de heredar
    masDatos: false,
    ficha: null, // { nombre, ultimaEstadia } cuando se encontró a la persona que vuelve
    alojadaEnOtra: false,
    errorServidor: null,
    campos: { ...CAMPOS_VACIOS, nacionalidad: tipo === "adulto" ? "AR" : "", ...campos },
    ...extra,
  };
}

// Filas de una habitación completadas hasta su ocupación: conserva las que ya había (adultos
// primero) y garantiza un titular adulto.
export function completarFilas(filasHabitacion, adultos, menores, habitacionClave) {
  const adultosActuales = filasHabitacion.filter((f) => f.tipo === "adulto");
  const menoresActuales = filasHabitacion.filter((f) => f.tipo === "menor");
  // Al achicar se van primero los que no son titulares, empezando por el último.
  const recortar = (lista, cantidad) => {
    const copia = [...lista];
    while (copia.length > cantidad) {
      const indice = copia.map((f) => f.esTitular).lastIndexOf(false);
      copia.splice(indice === -1 ? copia.length - 1 : indice, 1);
    }
    return copia;
  };
  const resultado = [
    ...recortar(adultosActuales, adultos),
    ...Array.from({ length: Math.max(0, adultos - adultosActuales.length) }, () => nuevaFila("adulto", habitacionClave)),
    ...recortar(menoresActuales, menores),
    ...Array.from({ length: Math.max(0, menores - menoresActuales.length) }, () => nuevaFila("menor", habitacionClave)),
  ];
  const conTitular = resultado.some((f) => f.esTitular && f.tipo === "adulto");
  return resultado.map((f, i) => ({
    ...f,
    esTitular: f.tipo === "menor" ? false : conTitular ? f.esTitular : i === 0,
    campos: !conTitular && i === 0 && !f.campos.paisResidencia ? { ...f.campos, paisResidencia: "AR" } : f.campos,
  }));
}

// Clave de documento comparable (tipo + país + número), la misma idea que la identidad del
// backend: el país se reduce a su código ISO y el número va sin espacios y en mayúsculas.
export function claveDocumento({ tipoDocumento, paisDocumento, numeroDocumento } = {}) {
  const numero = String(numeroDocumento ?? "").trim().toUpperCase().replace(/\s/g, "");
  const tipo = (normalizarTipoDocumento(tipoDocumento) ?? String(tipoDocumento ?? "")).toUpperCase();
  if (!numero || !tipo) return null;
  const pais = String(paisDocumento ?? "").trim() ? codigoPais(paisDocumento) || String(paisDocumento).trim().toUpperCase() : "";
  return { tipo, pais, numero };
}

// ¿La fila es quien reservó? Si quien reservó no tiene país emisor (registros anteriores), se
// compara por tipo y número.
export function esQuienReservo(huesped, campos) {
  const a = claveDocumento(huesped ?? {});
  const b = claveDocumento(campos ?? {});
  if (!a || !b || a.tipo !== b.tipo || a.numero !== b.numero) return false;
  return !a.pais || !b.pais || a.pais === b.pais;
}

const isoAFecha = (valor) => (valor ? formatearFechaDdMmAaaa(valor) : "");

function camposDeOcupante(o) {
  return {
    tipoDocumento: normalizarTipoDocumento(o.tipoDocumento) ?? o.tipoDocumento ?? "DNI",
    paisDocumento: codigoPais(o.paisDocumento) || o.paisDocumento || "AR",
    numeroDocumento: o.numeroDocumento ?? "",
    nombre: o.nombre ?? "",
    apellido: o.apellido ?? "",
    fechaNacimiento: isoAFecha(o.fechaNacimiento),
    nacionalidad: codigoPais(o.nacionalidad) || o.nacionalidad || "",
    paisResidencia: codigoPais(o.paisResidencia) || o.paisResidencia || "",
    localidad: o.localidad ?? "",
    domicilio: o.domicilio ?? "",
    telefono: o.telefono ?? "",
    email: o.email ?? "",
  };
}

// Habitación de la pantalla a partir de la reserva formateada (buscar-reserva).
function habitacionDeReserva(h) {
  return {
    clave: h.id,
    habitacionIdAnterior: h.id,
    habitacionId: h.id,
    numero: h.numero,
    numeroAnterior: h.numero,
    pisoAnterior: h.piso,
    capacidadAnterior: h.capacidad,
    tipo: h.tipo,
    tipoHabitacionId: h.tipoHabitacionId,
    capacidad: h.capacidad,
    piso: h.piso,
    adultos: h.adultos,
    menores: h.menores,
    adultosReservados: h.adultos,
    menoresReservados: h.menores,
    errorServidor: null,
  };
}

// Estado inicial con reserva: habitaciones de la reserva y filas precargadas desde las fichas
// Previstas, completadas hasta la ocupación. Quien reservó va como titular de su habitación.
export function estadoInicialReserva(reserva, ocupantes = []) {
  const fechaIngreso = String(reserva.fechaDesde).slice(0, 10);
  const habitaciones = reserva.habitaciones.map(habitacionDeReserva);
  const previstas = ocupantes.filter((o) => o.estado === "Previsto");
  const idPorOcupante = new Map();
  let filas = [];
  for (const h of habitaciones) {
    const deLaHabitacion = previstas
      .filter((o) => (o.asignaciones ?? []).some((a) => !a.hasta && a.habitacionId === h.habitacionIdAnterior))
      .map((o) => {
        const edad = edadEnFecha(o.fechaNacimiento ? String(o.fechaNacimiento).slice(0, 10) : null, fechaIngreso);
        const tipo = edad !== null && edad < EDAD_ADULTO_OCUPACION ? "menor" : "adulto";
        const fila = nuevaFila(tipo, h.clave, camposDeOcupante(o), {
          precargada: true,
          conDocumento: Boolean(o.numeroDocumento) || tipo === "adulto",
          esTitular: tipo === "adulto" && (Boolean(o.esTitular) || o.huespedId === reserva.huespedId),
          ocupanteId: o.id,
          responsableOcupanteId: o.responsableId ?? null,
        });
        idPorOcupante.set(o.id, fila.id);
        return fila;
      });
    // Si hay más fichas que ocupación, se conservan las primeras (adultos primero).
    const ordenadas = [...deLaHabitacion.filter((f) => f.tipo === "adulto"), ...deLaHabitacion.filter((f) => f.tipo === "menor")];
    const titulares = ordenadas.filter((f) => f.esTitular);
    const unicoTitular = titulares.length > 1 ? ordenadas.map((f) => ({ ...f, esTitular: f === titulares[0] })) : ordenadas;
    filas = filas.concat(completarFilas(unicoTitular, h.adultos, h.menores, h.clave));
  }
  // Responsables precargados: del id de ficha al id de fila.
  filas = filas.map((f) => ({
    ...f,
    responsableId: f.responsableOcupanteId != null ? (idPorOcupante.get(f.responsableOcupanteId) ?? null) : f.responsableId,
  }));

  // Quien reservó, si todavía no tiene ficha: va en la primera fila adulta vacía de la primera
  // habitación, como titular (el nombre viene completo en un solo campo).
  const huesped = reserva.huesped;
  if (huesped && !filas.some((f) => esQuienReservo(huesped, f.campos))) {
    const primera = habitaciones[0]?.clave;
    const vacia = filas.find((f) => f.habitacionClave === primera && f.tipo === "adulto" && !f.precargada);
    if (vacia) {
      const contacto = String(huesped.contacto ?? "");
      filas = filas.map((f) => {
        if (f.habitacionClave !== primera) return f;
        if (f.id !== vacia.id) return f.tipo === "adulto" ? { ...f, esTitular: false } : f;
        return {
          ...f,
          precargada: true,
          esTitular: true,
          campos: {
            ...f.campos,
            nombre: huesped.nombre ?? "",
            apellido: "",
            tipoDocumento: normalizarTipoDocumento(huesped.tipoDocumento) ?? huesped.tipoDocumento ?? "DNI",
            paisDocumento: codigoPais(huesped.paisDocumento) || huesped.paisDocumento || "AR",
            numeroDocumento: huesped.numeroDocumento ?? "",
            fechaNacimiento: isoAFecha(huesped.fechaNacimiento),
            paisResidencia: f.campos.paisResidencia || "AR",
            email: contacto.includes("@") ? contacto : "",
            telefono: contacto && !contacto.includes("@") ? contacto : "",
          },
        };
      });
    }
  }
  // Quien reservó es el titular de su habitación.
  const suya = filas.find((f) => f.tipo === "adulto" && esQuienReservo(huesped, f.campos));
  if (suya) filas = filas.map((f) => (f.habitacionClave === suya.habitacionClave && f.tipo === "adulto" ? { ...f, esTitular: f.id === suya.id } : f));

  return {
    modo: "reserva",
    reservaId: reserva.id,
    habitaciones,
    filas,
    motivoTitularDistinto: "",
    garantia: garantiaInicial(),
    totalVigente: Number(reserva.totalEstimadoAlojamiento ?? 0),
    accion: null,
    errorGeneral: null,
  };
}

export function garantiaInicial() {
  return { garantiaConfirmada: false, medioGarantia: MEDIOS_GARANTIA[0], referenciaGarantia: undefined };
}

let ultimaClaveWalkin = 0;
const nuevaClaveWalkin = () => `w${++ultimaClaveWalkin}`;

function habitacionWalkin(adultos = 2, menores = 0) {
  return {
    clave: nuevaClaveWalkin(),
    habitacionId: null,
    numero: null,
    tipo: null,
    tipoHabitacionId: null,
    capacidad: null,
    piso: null,
    adultos,
    menores,
    errorServidor: null,
  };
}

export function estadoInicialWalkin() {
  const h = habitacionWalkin(2, 0);
  return {
    modo: "walkin",
    noches: 1,
    planCodigo: null,
    habitaciones: [h],
    filas: completarFilas([], h.adultos, h.menores, h.clave),
    garantia: garantiaInicial(),
    accion: null,
    aviso: "",
    errorGeneral: null,
  };
}

const filasDe = (estado, clave) => estado.filas.filter((f) => f.habitacionClave === clave);

// Reemplaza las filas de una habitación manteniendo el orden de las habitaciones.
function conFilasDeHabitacion(estado, clave, nuevas) {
  const filas = [];
  for (const h of estado.habitaciones) filas.push(...(h.clave === clave ? nuevas : filasDe(estado, h.clave)));
  return filas;
}

// Si alguien deja de existir, quienes lo tenían de responsable vuelven al titular de la habitación.
function liberarResponsables(filas) {
  const ids = new Set(filas.map((f) => f.id));
  return filas.map((f) => (f.responsableId != null && !ids.has(f.responsableId) ? { ...f, responsableId: null } : f));
}

function actualizarFila(estado, filaId, cambio) {
  return { ...estado, filas: estado.filas.map((f) => (f.id === filaId ? { ...f, ...cambio(f) } : f)) };
}

const CAMPOS_DOCUMENTO = ["tipoDocumento", "paisDocumento", "numeroDocumento"];

export function reducer(estado, accion) {
  switch (accion.tipo) {
    case "campo": {
      const { filaId, campo, valor } = accion;
      return actualizarFila(estado, filaId, (f) => {
        const heredables = f.tipo === "menor" ? HEREDABLES_MENOR : f.esTitular ? [] : HEREDABLES_ACOMPANANTE;
        return {
          campos: { ...f.campos, [campo]: valor },
          corregidos: heredables.includes(campo) && !f.corregidos.includes(campo) ? [...f.corregidos, campo] : f.corregidos,
          // Otro documento: la ficha encontrada y el aviso de alojada ya no aplican.
          ...(CAMPOS_DOCUMENTO.includes(campo) ? { ficha: null, alojadaEnOtra: false } : {}),
          errorServidor: null,
        };
      });
    }
    case "masDatos":
      return actualizarFila(estado, accion.filaId, (f) => ({ masDatos: !f.masDatos }));
    case "conDocumento":
      return actualizarFila(estado, accion.filaId, () => ({ conDocumento: true }));
    case "responsable":
      return actualizarFila(estado, accion.filaId, () => ({ responsableId: accion.responsableId ?? null }));
    case "marcarTitular": {
      const fila = estado.filas.find((f) => f.id === accion.filaId);
      if (!fila || fila.tipo !== "adulto") return estado;
      return {
        ...estado,
        filas: estado.filas.map((f) => {
          if (f.habitacionClave !== fila.habitacionClave || f.tipo !== "adulto") return f;
          const esTitular = f.id === fila.id;
          // El nuevo titular tiene residencia propia: deja de heredarla.
          return esTitular && !f.campos.paisResidencia ? { ...f, esTitular, campos: { ...f.campos, paisResidencia: "AR" } } : { ...f, esTitular };
        }),
      };
    }
    case "completarDesdeFicha": {
      // Persona que vuelve: completa los campos vacíos con su ficha.
      const { filaId, ficha } = accion;
      return actualizarFila(estado, filaId, (f) => {
        const datos = {
          nombre: ficha.nombre,
          apellido: ficha.apellido,
          fechaNacimiento: isoAFecha(ficha.fechaNacimiento),
          nacionalidad: ficha.nacionalidad,
          paisResidencia: ficha.paisResidencia,
          localidad: ficha.localidad,
          domicilio: ficha.domicilio,
          telefono: ficha.telefono,
          email: ficha.email,
        };
        const campos = { ...f.campos };
        const completados = [];
        for (const [k, v] of Object.entries(datos)) {
          if (!v) continue;
          const vacio = !String(f.campos[k] ?? "").trim() || (k === "nacionalidad" && !f.precargada && f.campos[k] === "AR");
          if (vacio) {
            campos[k] = v;
            completados.push(k);
          }
        }
        return {
          campos,
          // Lo que vino de su ficha cuenta como dato propio (no se pisa con lo heredado).
          corregidos: [...new Set([...f.corregidos, ...completados.filter((k) => ["nacionalidad", "paisResidencia"].includes(k))])],
          ficha: { nombre: `${ficha.nombre ?? ""} ${ficha.apellido ?? ""}`.trim(), ultimaEstadia: ficha.fechaUltimaEstadia },
          alojadaEnOtra: Boolean(ficha.alojadaAhora),
        };
      });
    }
    case "abrirAccion":
      return { ...estado, accion: accion.accion };
    case "cancelarAccion":
      return { ...estado, accion: null };
    case "agregarHuesped": {
      const { habitacionClave, rol, totalNuevo } = accion;
      const habitaciones = estado.habitaciones.map((h) =>
        h.clave === habitacionClave ? { ...h, adultos: h.adultos + (rol === "adulto" ? 1 : 0), menores: h.menores + (rol === "menor" ? 1 : 0) } : h,
      );
      const h = habitaciones.find((x) => x.clave === habitacionClave);
      const nuevas = completarFilas(filasDe(estado, habitacionClave), h.adultos, h.menores, habitacionClave);
      return {
        ...estado,
        habitaciones,
        filas: conFilasDeHabitacion({ ...estado, habitaciones }, habitacionClave, nuevas),
        accion: null,
        ...(totalNuevo != null ? { totalVigente: totalNuevo } : {}),
      };
    }
    case "quitarHuesped": {
      const fila = estado.filas.find((f) => f.id === accion.filaId);
      if (!fila) return estado;
      const habitaciones = estado.habitaciones.map((h) =>
        h.clave === fila.habitacionClave
          ? { ...h, adultos: h.adultos - (fila.tipo === "adulto" ? 1 : 0), menores: h.menores - (fila.tipo === "menor" ? 1 : 0) }
          : h,
      );
      return {
        ...estado,
        habitaciones,
        filas: liberarResponsables(estado.filas.filter((f) => f.id !== fila.id)),
        accion: null,
        ...(accion.totalNuevo != null ? { totalVigente: accion.totalNuevo } : {}),
      };
    }
    case "cambiarHabitacion": {
      // Con reserva: otra habitación del mismo tipo (se aplica al confirmar).
      const { clave, habitacion } = accion;
      return {
        ...estado,
        habitaciones: estado.habitaciones.map((h) =>
          h.clave === clave
            ? { ...h, habitacionId: habitacion.id, numero: habitacion.numero, piso: habitacion.piso, capacidad: habitacion.capacidad, errorServidor: null }
            : h,
        ),
      };
    }
    case "motivo":
      return { ...estado, motivoTitularDistinto: accion.valor };
    case "garantia":
      return { ...estado, garantia: { ...estado.garantia, ...accion.cambios } };
    case "total":
      return { ...estado, totalVigente: accion.valor };
    // ---------------------------------------------------------------- walk-in
    case "noches":
      return { ...estado, noches: accion.valor };
    case "plan":
      return { ...estado, planCodigo: accion.codigo };
    case "ocupacion": {
      const { clave, adultos, menores } = accion;
      let aviso = "";
      const habitaciones = estado.habitaciones.map((h, i) => {
        if (h.clave !== clave) return h;
        const nueva = { ...h, adultos, menores };
        if (h.habitacionId && h.capacidad != null && adultos + menores > h.capacidad) {
          aviso = `La ${h.numero} no admite ${adultos + menores} personas: elegí otra para la habitación ${i + 1}.`;
          return { ...nueva, habitacionId: null, numero: null, tipo: null, tipoHabitacionId: null, capacidad: null, piso: null };
        }
        return nueva;
      });
      const nuevas = completarFilas(filasDe(estado, clave), adultos, menores, clave);
      return {
        ...estado,
        habitaciones,
        filas: liberarResponsables(conFilasDeHabitacion({ ...estado, habitaciones }, clave, nuevas)),
        aviso,
      };
    }
    case "agregarHabitacion": {
      const h = habitacionWalkin(1, 0);
      return { ...estado, habitaciones: [...estado.habitaciones, h], filas: [...estado.filas, ...completarFilas([], 1, 0, h.clave)] };
    }
    case "quitarHabitacion":
      return {
        ...estado,
        habitaciones: estado.habitaciones.filter((h) => h.clave !== accion.clave),
        filas: liberarResponsables(estado.filas.filter((f) => f.habitacionClave !== accion.clave)),
      };
    case "elegirHabitacion": {
      const { clave, habitacion } = accion;
      return {
        ...estado,
        aviso: "",
        habitaciones: estado.habitaciones.map((h) =>
          h.clave === clave
            ? habitacion
              ? {
                  ...h,
                  habitacionId: habitacion.id,
                  numero: habitacion.numero,
                  tipo: habitacion.tipo,
                  tipoHabitacionId: habitacion.tipoHabitacionId,
                  capacidad: habitacion.capacidad,
                  piso: habitacion.piso,
                  planes: habitacion.planes ?? [],
                  errorServidor: null,
                }
              : { ...h, habitacionId: null, numero: null, tipo: null, tipoHabitacionId: null, capacidad: null, piso: null, planes: [] }
            : h,
        ),
      };
    }
    // ---------------------------------------------------------------- respuestas del servidor
    case "erroresServidor": {
      const { porHabitacion = {}, personas = [] } = accion;
      return {
        ...estado,
        habitaciones: estado.habitaciones.map((h) => ({ ...h, errorServidor: porHabitacion[h.clave] ?? null })),
        filas: estado.filas.map((f) => ({ ...f, errorServidor: personas.includes(f.id) ? accion.mensajePersonas : null })),
      };
    }
    case "reiniciar":
      return accion.estado;
    default:
      return estado;
  }
}

// Fecha tipeada (dd/mm/aaaa) a ISO, o null.
export const nacimientoISO = (fila) => ddMmAaaaAISO(fila.campos.fechaNacimiento);
