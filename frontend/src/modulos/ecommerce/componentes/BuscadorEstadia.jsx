import { useState } from "react";
import { ArrowRight, CalendarDays, Users } from "lucide-react";
import { hoyEnHoraLocal } from "../../../lib/fechas";
import { Boton } from "./Boton";
import { Campo } from "./Campo";
import { CampoFecha } from "./CampoFecha";
import { MAX_ADULTOS_HABITACION, MAX_MENORES_HABITACION, MAX_NOCHES_ESTADIA } from "../ecommerce.constantes";
import { calcularNoches } from "../formato";

// Validación pura del buscador (testeada en BuscadorEstadia.test.jsx).
// `hoy` en YYYY-MM-DD, hora argentina (hoyEnHoraLocal).
export function validarBusqueda({ fechaDesde, fechaHasta, adultos, menores }, hoy = hoyEnHoraLocal()) {
  const errores = {};
  if (!fechaDesde) errores.fechaDesde = "Elegí la fecha de entrada.";
  else if (fechaDesde < hoy) errores.fechaDesde = "La entrada no puede ser anterior a hoy.";

  if (!fechaHasta) errores.fechaHasta = "Elegí la fecha de salida.";
  else if (fechaDesde && fechaHasta <= fechaDesde) errores.fechaHasta = "La salida tiene que ser posterior a la entrada.";
  else if (fechaDesde && calcularNoches(fechaDesde, fechaHasta) > MAX_NOCHES_ESTADIA)
    errores.fechaHasta = `La estadía puede ser de hasta ${MAX_NOCHES_ESTADIA} noches. Para estadías más largas, consultá con recepción.`;

  if (!(Number(adultos) >= 1)) errores.adultos = "Tiene que haber al menos 1 adulto.";
  if (!(Number(menores) >= 0)) errores.menores = "Indicá la cantidad de menores.";
  return errores;
}

// Validación del buscador de la web (etapa 2), con los límites del sitio:
// ventana de venta (la entrada y la salida hasta hoy + ventanaVentaDias) y
// capacidad (adultos + menores no superan la capacidad máxima entre los
// tipos, que sale de /api/web/tipos). Suma estos errores a los de
// validarBusqueda, que no cambia.
export function validarBusquedaWeb(valores, { hoy = hoyEnHoraLocal(), capacidadMaxima, ventanaVentaDias } = {}) {
  const errores = validarBusqueda(valores, hoy);
  if (ventanaVentaDias) {
    const limite = sumarDias(hoy, ventanaVentaDias);
    const fueraDeVentana = "Podés reservar con hasta un año de anticipación.";
    if (!errores.fechaDesde && valores.fechaDesde > limite) errores.fechaDesde = fueraDeVentana;
    if (!errores.fechaHasta && valores.fechaHasta > limite) errores.fechaHasta = fueraDeVentana;
  }
  if (capacidadMaxima) {
    const adultos = Number(valores.adultos);
    const menores = Number(valores.menores);
    if (!errores.adultos && adultos > capacidadMaxima) errores.adultos = `Para más de ${capacidadMaxima} personas, contactá a recepción.`;
    if (!errores.adultos && !errores.menores && adultos + menores > capacidadMaxima) {
      errores.menores = `Para más de ${capacidadMaxima} personas, contactá a recepción.`;
    }
  }
  return errores;
}

export function sumarDias(fechaISO, dias) {
  const [a, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Buscador de estadía: entrada, salida, adultos y menores de UNA habitación.
// Selector de varias habitaciones: etapa 2 (el contexto y la API ya aceptan
// hasta MAX_HABITACIONES_WEB líneas en `ocupacion`).
//
// Props opcionales de la etapa 2 (sin ellas, el buscador es exactamente el
// de antes):
//   capacidadMaxima   adultos de 1 a N, menores de 0 a N-1 y un total de hasta
//                     N (la mayor capacidad entre los tipos de /api/web/tipos);
//   ventanaVentaDias  entrada y salida hasta hoy + N días;
//   menoresConEdad    rótulo "Menores (0 a 12 años)" con su ayuda;
//   fechasLegibles    campos de fecha con el valor visible "Vie 16 oct 2026";
//   compacto          versión de una columna (panel del detalle del tipo);
//   erroresExternos   { campo: mensaje } que marca un campo desde afuera (por
//                     ejemplo, un DATOS_INVALIDOS de la API).
export function BuscadorEstadia({
  valoresIniciales,
  onBuscar,
  etiquetaBoton = "Ver disponibilidad",
  hoy,
  capacidadMaxima,
  ventanaVentaDias,
  menoresConEdad = false,
  fechasLegibles = false,
  compacto = false,
  erroresExternos,
}) {
  const hoyReal = hoy ?? hoyEnHoraLocal();
  const modoWeb = Boolean(capacidadMaxima || ventanaVentaDias);
  const [valores, setValores] = useState(() => ({
    fechaDesde: valoresIniciales?.fechaDesde ?? "",
    fechaHasta: valoresIniciales?.fechaHasta ?? "",
    adultos: valoresIniciales?.adultos ?? 2,
    menores: valoresIniciales?.menores ?? 0,
  }));
  const [errores, setErrores] = useState({});

  function cambiar(campo, valor) {
    setValores((v) => {
      const nuevo = { ...v, [campo]: valor };
      // Si la salida queda antes de la entrada, se propone la noche siguiente.
      if (campo === "fechaDesde" && valor && (!v.fechaHasta || v.fechaHasta <= valor)) nuevo.fechaHasta = sumarDias(valor, 1);
      return nuevo;
    });
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  function enviar(evento) {
    evento.preventDefault();
    const encontrados = modoWeb
      ? validarBusquedaWeb(valores, { hoy: hoyReal, capacidadMaxima, ventanaVentaDias })
      : validarBusqueda(valores, hoyReal);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    onBuscar({
      fechaDesde: valores.fechaDesde,
      fechaHasta: valores.fechaHasta,
      adultos: Number(valores.adultos),
      menores: Number(valores.menores),
    });
  }

  const opciones = (desde, hasta) =>
    Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i).map((n) => (
      <option key={n} value={n}>
        {n}
      </option>
    ));

  const error = (campo) => errores[campo] ?? erroresExternos?.[campo];
  const maxFecha = ventanaVentaDias ? sumarDias(hoyReal, ventanaVentaDias) : undefined;
  const maxAdultos = capacidadMaxima ?? MAX_ADULTOS_HABITACION;
  const maxMenores = capacidadMaxima ? Math.max(0, capacidadMaxima - 1) : MAX_MENORES_HABITACION;
  const CampoDeFecha = fechasLegibles ? CampoFecha : Campo;
  const propsFecha = fechasLegibles ? {} : { type: "date", Icono: CalendarDays };

  return (
    <form
      className={`ec-buscador ${compacto ? "ec-buscador--compacto" : ""} ${fechasLegibles ? "ec-buscador--web" : ""}`.replace(/\s+/g, " ").trim()}
      onSubmit={enviar}
      noValidate
      aria-label="Buscar disponibilidad"
    >
      <CampoDeFecha
        label="Entrada"
        {...propsFecha}
        min={hoyReal}
        max={maxFecha}
        value={valores.fechaDesde}
        onChange={(e) => cambiar("fechaDesde", e.target.value)}
        error={error("fechaDesde")}
      />
      <CampoDeFecha
        label="Salida"
        {...propsFecha}
        min={valores.fechaDesde ? sumarDias(valores.fechaDesde, 1) : hoyReal}
        max={maxFecha}
        value={valores.fechaHasta}
        onChange={(e) => cambiar("fechaHasta", e.target.value)}
        error={error("fechaHasta")}
      />
      <Campo
        label="Adultos"
        como="select"
        Icono={Users}
        value={valores.adultos}
        onChange={(e) => cambiar("adultos", Number(e.target.value))}
        error={error("adultos")}
      >
        {opciones(1, Math.max(maxAdultos, Number(valores.adultos) || 1))}
      </Campo>
      <Campo
        label={menoresConEdad ? "Menores (0 a 12 años)" : "Menores"}
        como="select"
        ayuda={menoresConEdad ? "Desde los 13 años cuentan como adultos" : undefined}
        value={valores.menores}
        onChange={(e) => cambiar("menores", Number(e.target.value))}
        error={error("menores")}
      >
        {opciones(0, Math.max(maxMenores, Number(valores.menores) || 0))}
      </Campo>
      <div className="ec-buscador__accion">
        <Boton type="submit" formulario>
          {etiquetaBoton} <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
        </Boton>
      </div>
    </form>
  );
}
