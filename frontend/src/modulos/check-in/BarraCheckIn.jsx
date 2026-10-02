import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { Button } from "../../componentes/Button";
import { formatearPrecio } from "../../lib/moneda";

// Lleva al campo de un faltante: lo muestra y lo enfoca.
function irA(campoId) {
  const el = document.getElementById(campoId);
  if (!el) return;
  el.scrollIntoView?.({ block: "center" });
  el.focus?.({ preventScroll: true });
}

function PanelServidor({ panel, onConfirmarNuevoTotal, enviando }) {
  if (!panel) return null;
  if (panel.tipo === "precio") {
    const { totalAnterior, totalNuevo, mensajeNoReembolsable } = panel.detalle ?? {};
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-laton-300 bg-laton-100 px-4 py-2.5 text-[13.5px] text-laton-700">
        <span className="flex-1">
          <b>
            El precio cambió: antes {formatearPrecio(totalAnterior)}, ahora {formatearPrecio(totalNuevo)}.
          </b>
          {mensajeNoReembolsable ? ` ${mensajeNoReembolsable}` : ""}
        </span>
        <Button variante="ok" cargando={enviando} onClick={onConfirmarNuevoTotal}>
          Confirmar con el nuevo total
        </Button>
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-md border border-error bg-error-suave px-4 py-2.5 text-[13.5px] text-error-texto">
      {panel.tipo === "lista" ? (
        <>
          <b>{panel.titulo}</b>
          <ul className="mt-1 list-disc pl-5">
            {panel.mensajes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      ) : (
        panel.texto
      )}
    </div>
  );
}

// Barra fija abajo: resumen, lo que falta para confirmar (hasta 3 + "y N más", cada uno lleva a
// su campo) y el botón. El botón queda deshabilitado mientras falte algo y durante el envío.
export function BarraCheckIn({ resumen, faltantes, enviando, onConfirmar, panel, onConfirmarNuevoTotal }) {
  const [verTodo, setVerTodo] = useState(false);
  const visibles = verTodo ? faltantes : faltantes.slice(0, 3);
  const mas = faltantes.length - visibles.length;
  return (
    <div className="sticky bottom-0 z-10 -mx-8 mt-6 border-t border-borde bg-white px-8 py-3 shadow-[0_-6px_18px_rgba(40,30,10,0.07)]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[14px] text-piedra">
            {resumen.map((parte) => (
              <span key={parte.clave} className={parte.total ? "font-heading text-[21px] font-semibold text-tinta" : parte.fuerte ? "font-semibold text-tinta" : ""}>
                {parte.texto}
              </span>
            ))}
          </div>
          <Button
            variante="ok"
            icono={DoorOpen}
            cargando={enviando}
            disabled={faltantes.length > 0}
            aria-describedby={faltantes.length ? "ci-pendientes" : undefined}
            onClick={onConfirmar}
          >
            {enviando ? "Confirmando…" : "Confirmar check-in"}
          </Button>
        </div>
        <div aria-live="polite" id="ci-pendientes" className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13.5px]">
          {faltantes.length ? (
            <>
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-piedra">Para confirmar falta</span>
              <ul className="contents">
                {visibles.map((f) => (
                  <li key={f.texto}>
                    <button type="button" onClick={() => irA(f.campoId)} className="cursor-pointer text-left text-laton-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-pino">
                      {f.texto}
                    </button>
                  </li>
                ))}
                {mas > 0 && (
                  <li>
                    <button type="button" onClick={() => setVerTodo(true)} className="cursor-pointer font-semibold text-piedra hover:underline focus-visible:outline-2 focus-visible:outline-pino">
                      y {mas} más
                    </button>
                  </li>
                )}
                {verTodo && faltantes.length > 3 && (
                  <li>
                    <button type="button" onClick={() => setVerTodo(false)} className="cursor-pointer text-piedra hover:underline focus-visible:outline-2 focus-visible:outline-pino">
                      ver menos
                    </button>
                  </li>
                )}
              </ul>
            </>
          ) : (
            <span className="font-semibold text-pino-700">✓ Todo listo para confirmar</span>
          )}
        </div>
        <PanelServidor panel={panel} onConfirmarNuevoTotal={onConfirmarNuevoTotal} enviando={enviando} />
      </div>
    </div>
  );
}

export const resumenTotal = (total) => ({ clave: "total", texto: formatearPrecio(total), total: true });
