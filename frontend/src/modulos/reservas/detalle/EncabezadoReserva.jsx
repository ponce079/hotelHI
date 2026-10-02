import { Ban, LogIn, LogOut, Pencil, Plus, ReceiptText } from "lucide-react";
import { Badge } from "../../../componentes/Badge";
import { Button } from "../../../componentes/Button";
import { CodigoClave } from "../../../componentes/CodigoClave";
import { MenuAcciones } from "../../../componentes/MenuAcciones";
import { ESTADO_RESERVA_BADGE } from "../reservas.constantes";

const ICONOS = { modificar: Pencil, "check-in": LogIn, consumo: Plus, "check-out": LogOut, comprobante: ReceiptText, cancelar: Ban };
const VARIANTES = { primaria: "ok", secundaria: "secundario", destructiva: "destructivo" };

const PUNTO = { hecho: "border-pino bg-pino", actual: "border-pino bg-white ring-4 ring-pino-100", pendiente: "border-neutro-500 bg-white" };

// Línea de tiempo chica: reemplaza al indicador de pasos grande.
function LineaDeTiempo({ pasos }) {
  return (
    <ol className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-piedra" aria-label="Avance de la reserva">
      {pasos.map((p, i) => (
        <li key={p.texto} className="flex items-center gap-2.5" aria-current={p.estado === "actual" ? "step" : undefined}>
          {i > 0 && <span aria-hidden className="h-px w-7 bg-borde" />}
          <span className={`inline-flex items-center gap-1.5 ${p.estado === "actual" ? "font-semibold text-tinta" : ""}`}>
            <i aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full border-2 ${PUNTO[p.estado]}`} />
            {p.texto}
            {p.sub && <span className="font-normal text-piedra">{p.sub}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function DatoClave({ etiqueta, dato }) {
  return (
    <div className="min-w-0 border-borde px-4 py-3 [&:not(:last-child)]:border-r max-md:border-b">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/55">{etiqueta}</p>
      <p className="break-words font-body text-[15px] font-semibold tabular-nums">{dato.principal}</p>
      <p className="text-[12.5px] text-piedra">{dato.sub || " "}</p>
    </div>
  );
}

// Encabezado de la reserva: código, estado, plan, línea de tiempo, acciones según estado y rol, y los
// seis datos clave. Cada dato aparece una sola vez en la pantalla.
export function EncabezadoReserva({ reserva, pasos, acciones, onAccion, checkIn, datos }) {
  const accion = (a) => {
    const esCheckIn = a.id === "check-in";
    return (
      <div key={a.id} className="flex flex-col items-end gap-1">
        <Button
          variante={VARIANTES[a.tipo]}
          icono={ICONOS[a.id]}
          cargando={esCheckIn && checkIn.cargando}
          disabled={esCheckIn && !checkIn.habilitado}
          onClick={() => onAccion(a.id)}
        >
          {a.texto}
        </Button>
        {esCheckIn && checkIn.motivo && <p className="max-w-[240px] text-right text-[11px] text-piedra">{checkIn.motivo}</p>}
      </div>
    );
  };
  return (
    <section className="flex flex-col gap-4" aria-label="Datos de la reserva">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-[30px] font-semibold leading-tight">Reserva</h1>
            <CodigoClave className="text-[20px]">{reserva.codigoConfirmacion}</CodigoClave>
            <Badge variante={ESTADO_RESERVA_BADGE[reserva.estado]}>{reserva.estado}</Badge>
            {reserva.planTarifario && <Badge variante="neutro">{reserva.planTarifario.nombre}</Badge>}
            {reserva.cantidadHabitaciones > 1 && <Badge variante="info">Reserva grupal</Badge>}
          </div>
          <LineaDeTiempo pasos={pasos} />
        </div>
        {(acciones.principales.length > 0 || acciones.menu.length > 0) && (
          <div className="flex flex-wrap items-start gap-2">
            {acciones.principales.map(accion)}
            {acciones.menu.length > 0 && (
              <MenuAcciones
                etiqueta="Más acciones de la reserva"
                acciones={acciones.menu.map((a) => ({
                  label: a.texto,
                  variante: a.tipo === "destructiva" ? "destructivo" : undefined,
                  onClick: () => onAccion(a.id),
                }))}
              />
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-borde bg-white md:grid-cols-3 xl:grid-cols-6">
        <DatoClave etiqueta="Titular" dato={datos.titular} />
        <DatoClave etiqueta="Entrada" dato={datos.entrada} />
        <DatoClave etiqueta="Salida" dato={datos.salida} />
        <DatoClave etiqueta="Noches" dato={datos.noches} />
        <DatoClave etiqueta="Habitación" dato={datos.habitacion} />
        <DatoClave etiqueta="Ocupación" dato={datos.ocupacion} />
      </div>
    </section>
  );
}
