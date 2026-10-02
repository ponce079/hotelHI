import { Badge } from "../../../componentes/Badge";
import { Button } from "../../../componentes/Button";
import { edadEnFecha, formatearFechaDdMmAaaa, formatearFechaHora, hoyEnHoraLocal } from "../../../lib/fechas";
import { activa, documentoDe, nombreDeOcupante } from "../../estadia/estadiaUtils";
import { buscarPaisOcupante } from "../../estadia/ocupantesUbicacion";
import { pendientesParaIngreso } from "../../estadia/validarOcupante";
import { MenuPersona } from "./MenuPersona";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const pais = (valor) => (valor ? (buscarPaisOcupante(valor)?.nombre ?? valor) : null);
const ESTADO_PERSONA = { Alojado: "ok", Previsto: "neutro", Retirado: "neutro" };

// "Argentina · reside en Córdoba": nacionalidad y residencia en una línea.
function nacionalidadYResidencia(p) {
  const residencia = [p.localidad, pais(p.paisResidencia)].filter(Boolean).join(", ");
  return [pais(p.nacionalidad), residencia ? `reside en ${residencia}` : null].filter(Boolean).join(" · ") || "—";
}

function Fechas({ p, reserva }) {
  const ingreso = p.ingresoReal
    ? `Ingreso ${formatearFechaHora(p.ingresoReal)}`
    : `Llega ${formatearFechaDdMmAaaa(p.fechaDesde ?? reserva.fechaDesde).slice(0, 5)}`;
  const salida = p.salidaReal
    ? `Salida ${formatearFechaHora(p.salidaReal)}`
    : `Sale ${formatearFechaDdMmAaaa(p.fechaHasta ?? reserva.fechaHasta).slice(0, 5)} (prevista)`;
  return (
    <>
      {ingreso}
      <span className="block text-[12.5px] text-piedra">{salida}</span>
    </>
  );
}

function FilaPersona({ p, reserva, estadia }) {
  // Con la reserva cerrada o cancelada ya no hay nada que completar.
  const faltantes = ["Cerrada", "Cancelada"].includes(reserva.estado) ? [] : pendientesParaIngreso(p);
  const esTitularReserva = estadia.titularDeLaReservaActivo?.id === p.id;
  const edad = p.fechaNacimiento ? edadEnFecha(String(p.fechaNacimiento).slice(0, 10), hoyEnHoraLocal()) : null;
  const menor = Boolean(p.responsableId);
  return (
    <tr className="border-t border-borde align-top">
      <td className="px-3 py-2.5">
        <strong className="font-semibold">
          {p.nombre} {p.apellido}
        </strong>
        {esTitularReserva && (
          <span className="ml-2">
            <Badge variante="ok">Titular de la reserva</Badge>
          </span>
        )}
        {p.esTitular && !esTitularReserva && (
          <span className="ml-2">
            <Badge variante="ok">Titular de habitación</Badge>
          </span>
        )}
        {!p.verificadoEn && ["Previsto", "Alojado"].includes(p.estado) && !["Cerrada", "Cancelada"].includes(reserva.estado) && (
          <span className="ml-2">
            <Badge variante="alerta">Por verificar</Badge>
          </span>
        )}
        {faltantes.length > 0 && <p className="text-[12.5px] text-error-texto">Falta completar: {faltantes.join(", ")}.</p>}
        <p className="text-[12.5px] text-piedra">
          {documentoDe(p, reserva)}
          {edad !== null ? ` · ${plural(edad, "año", "años")}` : ""}
          {menor ? " (menor, sin cargo)" : ""}
        </p>
        {menor && (
          <p className="text-[12.5px] text-piedra">
            Responsable: {nombreDeOcupante(estadia.todas, p.responsableId) ?? "—"}
            {p.vinculoResponsable ? ` · ${p.vinculoResponsable}` : ""}
            {p.autorizacionPresentada ? " · Autorización presentada" : ""}
          </p>
        )}
      </td>
      <td className="px-3 py-2.5 text-[13px]">{nacionalidadYResidencia(p)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[13px]">
        <Fechas p={p} reserva={reserva} />
      </td>
      <td className="px-3 py-2.5">
        <Badge variante={ESTADO_PERSONA[p.estado] ?? "neutro"}>{p.estado}</Badge>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex justify-end">
          <MenuPersona persona={p} reserva={reserva} estadia={estadia} esTitularDeLaReserva={esTitularReserva} />
        </div>
      </td>
    </tr>
  );
}

// Una tabla por habitación (en una reserva de varias se repite el bloque). Las acciones de cada
// persona van en el menú ⋯ y aparecen solo cuando corresponden. Las fichas dadas de baja no se
// listan: están en el Historial.
export function PestanaHuespedes({ reserva, estadia }) {
  const { listado, personas, preparandoTitular, titular, errorCargaPersonas, cargandoPersonas, error } = estadia;
  return (
    <div className="flex flex-col gap-4">
      {error && !estadia.editor && (
        <p role="alert" className="text-error-texto">
          {error}
        </p>
      )}
      {preparandoTitular && titular.isPending && (
        <p role="status">
          {titular.failureCount > 0
            ? "Se interrumpió la conexión. Reintentando la carga del titular…"
            : "Incorporando los datos del titular…"}
        </p>
      )}
      {errorCargaPersonas && (
        <div role="alert" className="rounded border border-error p-3 text-error-texto">
          <p>
            {errorCargaPersonas.response?.data?.error ||
              "Se interrumpió la carga de personas. " +
                "Cuando el servidor esté disponible, volvé a cargar para continuar."}
          </p>
          <p className="mt-1 text-sm">
            Agregar persona se habilita al recuperar al titular y el listado de ocupantes. No vuelvas a crear la
            reserva.
          </p>
          <Button variante="secundario" className="mt-2" cargando={cargandoPersonas} onClick={estadia.recuperarPersonas}>
            Volver a cargar personas
          </Button>
        </div>
      )}
      {titular.data?.aviso && (
        <p role="alert" className="text-error-texto">
          {titular.data.aviso}
        </p>
      )}
      {personas.isLoading && <p>Cargando personas…</p>}
      {!listado.length && personas.isSuccess && !cargandoPersonas && !preparandoTitular && (
        <p className="text-piedra">Todavía no se registraron ocupantes. El titular aparecerá al terminar su incorporación.</p>
      )}
      {reserva.habitaciones.map((h) => {
        const enHabitacion = listado.filter((p) => (activa(p) || p.asignaciones?.at(-1))?.habitacionId === h.id);
        const titularDeLaHabitacion = enHabitacion.find((p) => p.esTitular);
        const faltan = reserva.estado === "Confirmada" && h.adultos != null ? h.adultos + h.menores - enHabitacion.length : 0;
        return (
          <section key={h.id} className="rounded-lg border border-borde" aria-label={`Habitación ${h.numero}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-lg border-b border-borde bg-hueso px-4 py-2.5">
              <span className="font-heading text-[22px] font-semibold text-pino">{h.numero}</span>
              <b className="font-semibold">{h.tipo}</b>
              <span className="text-[13px] text-piedra">
                {h.adultos != null && `${plural(h.adultos, "adulto", "adultos")}${h.menores ? ` y ${plural(h.menores, "menor", "menores")}` : ""} · `}
                capacidad {h.capacidad}
              </span>
              <span className="flex-1" />
              {titularDeLaHabitacion && (
                <span className="text-[13px] text-piedra">
                  Titular: {titularDeLaHabitacion.nombre} {titularDeLaHabitacion.apellido}
                </span>
              )}
            </div>
            {enHabitacion.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {["Persona", "Nacionalidad y residencia", "Fechas", "Estado"].map((t) => (
                        <th key={t} className="px-3 py-2 text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                          {t}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right text-xs font-normal text-piedra">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enHabitacion.map((p) => (
                      <FilaPersona key={p.id} p={p} reserva={reserva} estadia={estadia} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {faltan > 0 && enHabitacion.length > 0 && (
              <p className="border-t border-borde px-4 py-2.5 text-[13px] text-piedra">
                {plural(faltan, "persona más se registra", "personas más se registran")} en el check-in, con su
                documento.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
