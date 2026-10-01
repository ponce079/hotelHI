import { useState } from "react";
import { ArrowRight, CalendarDays, Users } from "lucide-react";
import { hoyEnHoraLocal } from "../../../lib/fechas";
import { Boton } from "./Boton";
import { Campo } from "./Campo";
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

function sumarDias(fechaISO, dias) {
  const [a, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Buscador de estadía: entrada, salida, adultos y menores de UNA habitación.
// Selector de varias habitaciones: etapa 2 (el contexto y la API ya aceptan
// hasta MAX_HABITACIONES_WEB líneas en `ocupacion`).
export function BuscadorEstadia({ valoresIniciales, onBuscar, etiquetaBoton = "Ver disponibilidad", hoy }) {
  const hoyReal = hoy ?? hoyEnHoraLocal();
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
    const encontrados = validarBusqueda(valores, hoyReal);
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

  return (
    <form className="ec-buscador" onSubmit={enviar} noValidate aria-label="Buscar disponibilidad">
      <Campo
        label="Entrada"
        type="date"
        Icono={CalendarDays}
        min={hoyReal}
        value={valores.fechaDesde}
        onChange={(e) => cambiar("fechaDesde", e.target.value)}
        error={errores.fechaDesde}
      />
      <Campo
        label="Salida"
        type="date"
        Icono={CalendarDays}
        min={valores.fechaDesde ? sumarDias(valores.fechaDesde, 1) : hoyReal}
        value={valores.fechaHasta}
        onChange={(e) => cambiar("fechaHasta", e.target.value)}
        error={errores.fechaHasta}
      />
      <Campo
        label="Adultos"
        como="select"
        Icono={Users}
        value={valores.adultos}
        onChange={(e) => cambiar("adultos", Number(e.target.value))}
        error={errores.adultos}
      >
        {opciones(1, MAX_ADULTOS_HABITACION)}
      </Campo>
      <Campo
        label="Menores"
        como="select"
        value={valores.menores}
        onChange={(e) => cambiar("menores", Number(e.target.value))}
        error={errores.menores}
      >
        {opciones(0, MAX_MENORES_HABITACION)}
      </Campo>
      <div className="ec-buscador__accion">
        <Boton type="submit" formulario>
          {etiquetaBoton} <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
        </Boton>
      </div>
    </form>
  );
}
