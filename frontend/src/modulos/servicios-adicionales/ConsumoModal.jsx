import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { MoneyInput } from "../../componentes/MoneyInput";
import { Button } from "../../componentes/Button";
import { listarDepositos } from "../depositos/depositos.api";
import { consultarStock } from "../stock/stock.api";
import { registrarConsumo } from "./serviciosAdicionales.api";
import { TIPOS_SERVICIO, LIMITES_SERVICIOS_ADICIONALES, DEPOSITO_MINIBAR_NOMBRE } from "./serviciosAdicionales.constantes";

const VACIO = {
  habitacionId: "",
  tipoServicio: TIPOS_SERVICIO[0],
  monto: "",
  registradoPor: "",
  articuloId: "",
  cantidad: "1",
};

// HU-61 a 64 — alta de consumo. Cuando tipoServicio = Minibar, HU-64 pide
// reusar el mismo módulo de Stock de Sprint 1 (no un catálogo propio): el
// selector de artículo sale de GET /api/stock filtrado por el depósito fijo
// "Minibar" — mismos datos que ya usa StockLista, no un endpoint nuevo.
//
// Sprint 3 — decisión de negocio: NO se le pide a quien carga el consumo
// que elija de qué depósito sale (evita repetir el bug ya encontrado una
// vez de descontar del depósito equivocado cuando el mismo artículo está
// habilitado en más de uno). El depósito "Minibar" se resuelve solo, acá
// nada más para saber qué stock mostrarle — el backend lo vuelve a resolver
// por su cuenta y es la fuente de verdad real (ver resolverDepositoMinibar
// en serviciosAdicionales.servicio.js); no se manda en el payload.
export function ConsumoModal({ reserva, onClose, onExito }) {
  const habitacionInicial = reserva.habitaciones.length === 1 ? String(reserva.habitaciones[0].id) : "";
  const [form, setForm] = useState({ ...VACIO, habitacionId: habitacionInicial });
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();
  const esMinibar = form.tipoServicio === "Minibar";

  const depositosQuery = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos, enabled: esMinibar });
  const depositoMinibar = (depositosQuery.data ?? []).find((d) => d.nombre === DEPOSITO_MINIBAR_NOMBRE && d.activo);
  const stockQuery = useQuery({
    queryKey: ["stock", "minibar", depositoMinibar?.id],
    queryFn: () => consultarStock({ depositoId: depositoMinibar.id }),
    enabled: esMinibar && Boolean(depositoMinibar),
  });

  const articuloElegido = (stockQuery.data ?? []).find((a) => String(a.articuloId) === form.articuloId);

  const mutacion = useMutation({
    mutationFn: () => {
      const payload = {
        reservaId: reserva.id,
        habitacionId: Number(form.habitacionId),
        tipoServicio: form.tipoServicio,
        monto: Number(form.monto),
        registradoPor: form.registradoPor.trim(),
      };
      if (esMinibar) {
        payload.articuloId = Number(form.articuloId);
        payload.cantidad = Number(form.cantidad);
      }
      return registrarConsumo(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumos-servicios"] });
      if (esMinibar) queryClient.invalidateQueries({ queryKey: ["stock"] });
      onExito(`Consumo de ${form.tipoServicio} registrado.`);
    },
    onError: (error) => setErrores({ general: error?.response?.data?.error ?? "No se pudo registrar el consumo." }),
  });

  function cambiar(campo, valor) {
    setErrores({});
    setForm((f) => {
      const siguiente = { ...f, [campo]: valor };
      if (campo === "tipoServicio" && valor !== "Minibar") {
        siguiente.articuloId = "";
        siguiente.cantidad = "1";
      }
      return siguiente;
    });
  }

  function handleSubmit(evento) {
    evento.preventDefault();
    const nuevos = {};
    if (!form.habitacionId) nuevos.habitacionId = "Elegí la habitación.";
    if (!(Number(form.monto) > 0)) nuevos.monto = "Ingresá un monto mayor a 0.";
    if (!form.registradoPor.trim()) nuevos.registradoPor = "Indicá quién registra el consumo.";
    if (esMinibar) {
      if (depositosQuery.isSuccess && !depositoMinibar) {
        nuevos.general = `No existe el depósito "${DEPOSITO_MINIBAR_NOMBRE}" — pedile a un administrador que lo cree antes de registrar consumos de Minibar.`;
      }
      if (!form.articuloId) nuevos.articuloId = "Elegí el artículo consumido.";
      if (!(Number(form.cantidad) > 0)) nuevos.cantidad = "Ingresá una cantidad mayor a 0.";
      if (articuloElegido && Number(form.cantidad) > Number(articuloElegido.stockActual)) {
        nuevos.cantidad = `Stock disponible: ${articuloElegido.stockActual}.`;
      }
    }
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    mutacion.mutate();
  }

  return (
    <Modal titulo="Registrar consumo" subtitulo={`Reserva ${reserva.codigoConfirmacion}`} onClose={onClose} ancho="max-w-xl">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {errores.general && <p className="sm:col-span-2 text-sm text-error-texto">{errores.general}</p>}

          <Select
            label="Habitación *"
            value={form.habitacionId}
            onChange={(e) => cambiar("habitacionId", e.target.value)}
            error={errores.habitacionId}
          >
            <option value="">Elegí una habitación</option>
            {reserva.habitaciones.map((h) => (
              <option key={h.id} value={h.id}>
                {h.numero} ({h.tipo})
              </option>
            ))}
          </Select>

          <Select label="Tipo de servicio *" value={form.tipoServicio} onChange={(e) => cambiar("tipoServicio", e.target.value)}>
            {TIPOS_SERVICIO.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </Select>

          {esMinibar && (
            <>
              <Select
                label="Artículo *"
                value={form.articuloId}
                onChange={(e) => cambiar("articuloId", e.target.value)}
                error={errores.articuloId}
                disabled={!depositoMinibar}
              >
                <option value="">
                  {depositosQuery.isSuccess && !depositoMinibar
                    ? `No existe el depósito "${DEPOSITO_MINIBAR_NOMBRE}"`
                    : "Elegí el artículo"}
                </option>
                {(stockQuery.data ?? [])
                  .filter((a) => a.activo && a.stockActual > 0)
                  .map((a) => (
                    <option key={a.articuloId} value={a.articuloId}>
                      {a.nombre} (stock: {a.stockActual})
                    </option>
                  ))}
              </Select>

              <Input
                label="Cantidad *"
                type="number"
                min="1"
                step="1"
                value={form.cantidad}
                onChange={(e) => cambiar("cantidad", e.target.value)}
                error={errores.cantidad}
              />
            </>
          )}

          <MoneyInput label="Monto *" value={form.monto} onChange={(v) => cambiar("monto", v)} error={errores.monto} />

          <div className={esMinibar ? "" : "sm:col-span-2"}>
            <Input
              label="Registrado por *"
              value={form.registradoPor}
              onChange={(e) => cambiar("registradoPor", e.target.value)}
              maxLength={LIMITES_SERVICIOS_ADICIONALES.registradoPor}
              placeholder="Tu nombre"
              error={errores.registradoPor}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icono={Save} cargando={mutacion.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
