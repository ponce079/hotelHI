import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Info, Search } from "lucide-react";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { Badge } from "../../componentes/Badge";
import { useSesion } from "../../lib/sesion";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { listarTiposHabitacion } from "../tipos-habitacion/tiposHabitacion.api";
import { TarifasTabs } from "./TarifasTabs";
import { cotizarEstadia } from "./tarifas.api";
import { DIA_SEMANA_LABEL, NIVEL_TEMPORADA_LABEL, PENALIDAD_NO_SHOW_LABEL, EDAD_MAXIMA_MENOR_SIN_CARGO } from "./tarifas.constantes";

const VACIO = { tipoHabitacionId: "", fechaIngreso: "", fechaEgreso: "", adultos: "2", menores: "0" };

export function CotizadorPage() {
  const { puede } = useSesion();
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [planAbierto, setPlanAbierto] = useState(null);
  const hoy = hoyEnHoraLocal();


  const { data: tipos } = useQuery({
    enabled: puede("verTarifas"),
    queryKey: ["tipos-habitacion", "activos"],
    queryFn: () => listarTiposHabitacion({ activo: "true" }),
  });

  const mutacion = useMutation({
    mutationFn: () =>
      cotizarEstadia({
        tipoHabitacionId: Number(form.tipoHabitacionId),
        fechaIngreso: form.fechaIngreso,
        fechaEgreso: form.fechaEgreso,
        adultos: Number(form.adultos),
        menores: Number(form.menores || 0),
        canal: "RECEPCION",
      }),
    onSuccess: () => setPlanAbierto(null),
    onError: (error) => {
      setErrores({ general: error?.response?.data?.error ?? "No se pudo cotizar la estadía." });
    },
  });

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined, general: undefined }));
  }

  function validar() {
    const nuevos = {};
    if (!form.tipoHabitacionId) nuevos.tipoHabitacionId = "Elegí un tipo de habitación.";
    if (!form.fechaIngreso) nuevos.fechaIngreso = "Obligatoria.";
    if (!form.fechaEgreso) nuevos.fechaEgreso = "Obligatoria.";
    else if (form.fechaEgreso <= form.fechaIngreso) nuevos.fechaEgreso = "Tiene que ser posterior al ingreso.";
    const adultos = Number(form.adultos);
    if (!Number.isInteger(adultos) || adultos < 1) nuevos.adultos = "Al menos 1 adulto.";
    return nuevos;
  }

  function handleSubmit(evento) {
    evento.preventDefault();
    const nuevos = validar();
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    setErrores({});
    mutacion.mutate();
  }

  const resultado = mutacion.data;

  if (!puede("verTarifas")) return <SinPermiso />;
  return (
    <div className="flex flex-col gap-6">
      <TarifasTabs activa="/tarifas/cotizador" />

      <div>
        <h1 className="font-heading text-2xl font-semibold">Cotizador</h1>
        <p className="text-sm text-piedra">Precio por noche y total de cada plan tarifario disponible.</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-borde bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Tipo de habitación *"
            value={form.tipoHabitacionId}
            onChange={(e) => cambiar("tipoHabitacionId", e.target.value)}
            error={errores.tipoHabitacionId}
          >
            <option value="">Elegí…</option>
            {(tipos ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Select>
          <Input
            label="Ingreso *"
            type="date"
            min={hoy}
            value={form.fechaIngreso}
            onChange={(e) => cambiar("fechaIngreso", e.target.value)}
            error={errores.fechaIngreso}
          />
          <Input
            label="Egreso *"
            type="date"
            min={form.fechaIngreso || hoy}
            value={form.fechaEgreso}
            onChange={(e) => cambiar("fechaEgreso", e.target.value)}
            error={errores.fechaEgreso}
          />
          <Input
            label="Adultos *"
            type="number"
            min="1"
            step="1"
            value={form.adultos}
            onChange={(e) => cambiar("adultos", e.target.value)}
            error={errores.adultos}
          />
          <div className="flex flex-col gap-1.5">
            <Input
              label="Menores"
              type="number"
              min="0"
              step="1"
              value={form.menores}
              onChange={(e) => cambiar("menores", e.target.value)}
            />
            <span className="text-[10.5px] text-piedra">Menores de 0 a {EDAD_MAXIMA_MENOR_SIN_CARGO} años sin cargo</span>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" icono={Search} cargando={mutacion.isPending}>
            Cotizar
          </Button>
        </div>
      </form>

      {errores.general && (
        <div className="rounded-md border border-error bg-error-suave px-4 py-3 text-[13px] text-error-texto">{errores.general}</div>
      )}

      {resultado && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-borde bg-hueso px-4 py-2.5 text-[12.5px] text-tinta/70">
            <Info size={14} className="flex-none text-piedra" />
            Precios finales por noche, IVA incluido, en pesos argentinos. Cotizado a la fecha de venta del {resultado.fechaVenta}
            {resultado.estadiaMinimaExigida > 0 && ` · Estadía mínima exigida: ${resultado.estadiaMinimaExigida} noches`}.
          </div>

          {resultado.planes.length === 0 ? (
            <p className="py-8 text-center text-sm text-piedra">No hay ningún plan tarifario disponible para este canal.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {resultado.planes.map((plan) => {
                const abierto = planAbierto === plan.codigo;
                return (
                  <div key={plan.codigo} className="flex flex-col gap-3 rounded-lg border border-borde bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-heading text-base font-semibold">{plan.nombre}</h3>
                        <span className="font-mono text-[11px] text-piedra">{plan.codigo}</span>
                      </div>
                      <Badge variante={plan.tipo === "BASE" ? "info" : "neutro"}>{plan.tipo === "BASE" ? "Base" : "Derivado"}</Badge>
                    </div>

                    <div className="text-[12.5px] text-tinta/70">
                      {plan.reembolsable ? `Reembolsable — ${plan.horasCancelacionSinCargo}h sin cargo` : "No reembolsable"}
                      <br />
                      Penalidad por no-show: {PENALIDAD_NO_SHOW_LABEL[plan.penalidadNoShow] ?? plan.penalidadNoShow}
                    </div>

                    <div className="flex items-baseline justify-between border-t border-borde pt-3">
                      <span className="text-[12px] text-piedra">Total ({plan.detalle.length} noches)</span>
                      <span className="font-mono text-lg font-semibold">$ {formatearMonto(plan.total)}</span>
                    </div>
                    <div className="flex items-baseline justify-between text-[12px] text-piedra">
                      <span>Promedio por noche</span>
                      <span className="font-mono">$ {formatearMonto(plan.promedioPorNoche)}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPlanAbierto(abierto ? null : plan.codigo)}
                      className="flex cursor-pointer items-center justify-center gap-1 rounded-md border border-borde py-1.5 text-[12px] text-tinta/70 hover:bg-hueso"
                    >
                      {abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {abierto ? "Ocultar detalle por noche" : "Ver detalle por noche"}
                    </button>

                    {abierto && (
                      <table className="w-full border-collapse text-left text-[11.5px]">
                        <thead>
                          <tr className="border-b border-borde text-[10.5px] text-piedra">
                            <th className="py-1 pr-1">Fecha</th>
                            <th className="py-1 pr-1">Temporada</th>
                            <th className="py-1 pr-1">Modif.</th>
                            <th className="py-1 pr-1">Desc.</th>
                            <th className="py-1 text-right">Precio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.detalle.map((noche) => (
                            <tr key={noche.fecha} className="border-b border-borde last:border-0">
                              <td className="py-1 pr-1 font-mono">
                                {noche.fecha}
                                <div className="text-[10px] text-piedra">{DIA_SEMANA_LABEL[noche.diaSemana]}</div>
                              </td>
                              <td className="py-1 pr-1">
                                {noche.temporadaNombre}
                                <div className="text-[10px] text-piedra">{NIVEL_TEMPORADA_LABEL[noche.temporadaNivel] ?? noche.temporadaNivel}</div>
                              </td>
                              <td className="py-1 pr-1">{noche.porcentajeModificador > 0 ? "+" : ""}{noche.porcentajeModificador}%</td>
                              <td className="py-1 pr-1">{noche.porcentajeDescuentoPlan > 0 ? `-${noche.porcentajeDescuentoPlan}%` : "—"}</td>
                              <td className="py-1 text-right font-mono font-semibold">$ {formatearMonto(noche.precioNoche)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
