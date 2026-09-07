import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Zap, History } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { crearRequerimiento, actualizarRequerimiento, obtenerRequerimiento } from "./requerimientos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { consultarStock } from "../stock/stock.api";
import { listarArticulos } from "../articulos/articulos.api";
import { habilitarArticuloEnDeposito } from "../articulo-deposito/articuloDeposito.api";
import { ORIGENES_REQUERIMIENTO, TIPOS_REQUERIMIENTO } from "../../lib/constantes";
import { useSesion } from "../../lib/sesion";

// Rediseño del modal de alta: recuerda el último depósito elegido en este
// navegador (nunca lo bloquea — ver discusión: matchear contra
// Deposito.responsable era frágil porque ese campo describe a la persona a
// cargo, no es una credencial de sesión). Es solo una comodidad de UX, no
// una relación de datos real — no hay nada que desarmar el día que este
// proyecto tenga usuarios de verdad.
const CLAVE_ULTIMO_DEPOSITO = "sgh_ultimo_deposito_requerimiento";

// Mitigación del caso borde "me faltó un artículo del catálogo": el link
// "¿No existe en el catálogo?" navega a /articulos en la misma pestaña, lo
// que desmonta este modal entero y pierde `lineas` — no hay ningún camino
// de vuelta, ni con el botón "atrás" del navegador (React Router no
// restaura estado de componentes desmontados). Este borrador de sessionStorage
// es la única forma de recuperar lo que ya se había cargado.
const CLAVE_BORRADOR = "requerimiento_borrador";
const TTL_BORRADOR_MS = 30 * 60 * 1000; // 30 minutos

// Solo es válido para el MISMO depósito que se está por precargar (no
// mezclar líneas de un depósito con otro) y dentro del TTL. Cualquier otra
// combinación (depósito distinto, vencido, corrupto, inexistente) se trata
// igual: no hay borrador, arranca vacío, sin avisar nada.
function leerBorradorVigente(depositoIdEsperado) {
  try {
    const raw = sessionStorage.getItem(CLAVE_BORRADOR);
    if (!raw) return null;
    const borrador = JSON.parse(raw);
    if (!borrador || String(borrador.depositoId) !== String(depositoIdEsperado)) return null;
    if (typeof borrador.guardadoEn !== "number" || Date.now() - borrador.guardadoEn > TTL_BORRADOR_MS) return null;
    if (!Array.isArray(borrador.lineas)) return null;
    return borrador.lineas;
  } catch {
    return null;
  }
}

function limpiarBorrador() {
  try {
    sessionStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // sessionStorage puede fallar (privado/bloqueado) — no hay nada que
    // limpiar si nunca se pudo guardar.
  }
}

// El listado (RequerimientosPage) no trae el detalle completo de cada
// fila — solo un conteo, por rendimiento (ver comentario en
// requerimientos.servicio.js) — así que en modo edición este wrapper
// busca la ficha completa por id antes de montar el formulario. En modo
// alta no hace falta ningún fetch: arranca vacío o con `prefill`.
export function RequerimientoModal({ requerimientoId, prefill, onClose, onExito }) {
  const { data: requerimiento, isLoading } = useQuery({
    queryKey: ["requerimiento", String(requerimientoId)],
    queryFn: () => obtenerRequerimiento(requerimientoId),
    enabled: Boolean(requerimientoId),
  });

  if (requerimientoId && isLoading) {
    return (
      <Modal titulo="Editar requerimiento" onClose={onClose} ancho="max-w-3xl">
        <p className="px-6 py-8 text-sm text-piedra">Cargando requerimiento…</p>
      </Modal>
    );
  }
  if (requerimientoId && !requerimiento) {
    return (
      <Modal titulo="Editar requerimiento" onClose={onClose} ancho="max-w-3xl">
        <p className="px-6 py-8 text-sm text-error">No se pudo cargar el requerimiento.</p>
      </Modal>
    );
  }

  return <RequerimientoFormulario requerimiento={requerimiento ?? null} prefill={prefill} onClose={onClose} onExito={onExito} />;
}

// `prefill` llega desde Alertas (HU-8 -> HU-81): trae depósito, artículo y
// cantidad sugerida, y el alta usa el mismo endpoint de siempre con
// origen "ALERTA". `requerimiento` (ya cargado por el wrapper de arriba)
// es el modo edición — solo se puede llegar acá con uno en estado
// "Pendiente" (el backend es el que manda esa regla; ver RequerimientosPage).
function RequerimientoFormulario({ requerimiento, prefill, onClose, onExito }) {
  const { usuario, rol } = useSesion();
  // Compras pide para cualquier depósito (periférico o central), no "el
  // suyo" — no tiene sentido precargarle/recordarle uno fijo como sí hace
  // depósito. Ver punto 1 del ajuste de rol.
  const esCompras = rol === "compras";
  const navigate = useNavigate();
  const editando = Boolean(requerimiento);
  const origen = editando
    ? requerimiento.origen
    : prefill?.origen === ORIGENES_REQUERIMIENTO.ALERTA
      ? ORIGENES_REQUERIMIENTO.ALERTA
      : ORIGENES_REQUERIMIENTO.MANUAL;

  function calcularDepositoInicial() {
    if (editando) return String(requerimiento.depositoId);
    if (prefill?.depositoId) return String(prefill.depositoId);
    // Punto 1: compras no tiene "su" depósito — nunca se le precarga uno.
    if (esCompras) return "";
    try {
      return localStorage.getItem(CLAVE_ULTIMO_DEPOSITO) ?? "";
    } catch {
      return "";
    }
  }
  // Recomputado en cada render (es una lectura barata), pero el borrador
  // solo se CONSUME una vez, dentro del useState de `lineas` de abajo —
  // ese sí corre una única vez por más que el componente se re-renderice.
  // Un `prefill` (alta desde Alertas) trae su propio artículo: no se mezcla
  // con un borrador de otra carga, así que ahí ni se lo busca. Tampoco
  // aplica a compras: ese rol ni siquiera tiene el link que genera el
  // borrador (punto 2), así que nunca debería tener uno propio — la
  // condición es solo por las dudas de que quede uno viejo de un cambio de
  // rol en la misma pestaña.
  const depositoIdInicial = calcularDepositoInicial();
  const borradorLineas = !editando && !prefill && !esCompras ? leerBorradorVigente(depositoIdInicial) : null;

  const [depositoId, setDepositoId] = useState(depositoIdInicial);
  const [urgente, setUrgente] = useState(() => Boolean(editando && requerimiento.urgente));
  const [mostrarHabilitar, setMostrarHabilitar] = useState(false);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState("");
  const [bannerBorrador, setBannerBorrador] = useState(Boolean(borradorLineas));
  const [lineas, setLineas] = useState(() => {
    if (editando) {
      return requerimiento.detalle.map((d) => ({
        articuloId: d.articuloId,
        cantidadSolicitada: String(d.cantidadSolicitada),
      }));
    }
    if (borradorLineas) {
      // Se consume acá: no se vuelve a ofrecer aunque se reabra el modal.
      limpiarBorrador();
      return borradorLineas;
    }
    // "Duplicar" (ficha de detalle de un Rechazada/Anulado) manda el
    // detalle completo de la solicitud original, no un solo artículo.
    if (Array.isArray(prefill?.detalle)) {
      return prefill.detalle.map((d) => ({
        articuloId: d.articuloId,
        cantidadSolicitada: String(d.cantidadSolicitada ?? ""),
      }));
    }
    const articuloId = Number(prefill?.articuloId);
    const cantidad = Number(prefill?.cantidad);
    if (!Number.isInteger(articuloId) || articuloId <= 0) return [];
    return [{ articuloId, cantidadSolicitada: cantidad > 0 ? String(cantidad) : "" }];
  });
  const [articuloAAgregar, setArticuloAAgregar] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  // Punto 2 — el tipo ya no se elige, se infiere del depósito: antes había
  // que elegir Tipo ANTES de poder filtrar la lista de depósitos por él
  // (dependencia circular). Ahora cualquier depósito es una opción válida
  // — compras puede pedir tanto para un periférico como directo a un
  // central — y el tipo sale de `esCentral` una vez elegido.
  const depositosDisponibles = depositos ?? [];
  const depositoSeleccionado = depositosDisponibles.find((d) => String(d.id) === depositoId) ?? null;

  // En edición el tipo quedó fijado al crear el requerimiento — no se
  // vuelve a inferir aunque se cambie el depósito desde acá. Un periférico
  // SIEMPRE es Transferencia — no existe excepción de compra directa (el
  // backend la rechaza igual si algo intentara forzarla).
  const tipo = editando
    ? requerimiento.tipo
    : depositoSeleccionado
      ? depositoSeleccionado.esCentral
        ? TIPOS_REQUERIMIENTO.COMPRA
        : TIPOS_REQUERIMIENTO.TRANSFERENCIA
      : TIPOS_REQUERIMIENTO.COMPRA;

  // Solo se pueden pedir artículos habilitados en ese depósito (HU-4), que
  // es exactamente lo que devuelve /api/stock filtrado por depósito. De
  // paso trae el stock actual, útil como referencia al pedir cantidad.
  const { data: filasStock } = useQuery({
    queryKey: ["stock", { depositoId }],
    queryFn: () => consultarStock({ depositoId }),
    enabled: Boolean(depositoId),
  });

  // Todo lo habilitado en el depósito, sin importar el tipo — antes esto
  // ya filtraba por central en Transferencia, lo que hacía que un artículo
  // sin `depositoCentralId` asignado desapareciera de la lista sin ninguna
  // explicación (bug reportado: TONER/RESMA BLANCO en Administración). Se
  // sigue mostrando, pero deshabilitado — ver `esElegible` más abajo.
  const disponibles = useMemo(() => filasStock ?? [], [filasStock]);

  // Sin depósito central asignado, el artículo no se puede pedir por
  // transferencia — el sistema no tendría a quién dirigirla. Solo importa
  // en modo Transferencia: en Compra (central o excepción) no hay ninguna
  // restricción de este tipo.
  function esElegible(f) {
    return tipo !== TIPOS_REQUERIMIENTO.TRANSFERENCIA || f.depositoCentralId != null;
  }

  const hayNoElegiblesPorCentral = useMemo(
    () => tipo === TIPOS_REQUERIMIENTO.TRANSFERENCIA && disponibles.some((f) => f.depositoCentralId == null),
    [disponibles, tipo]
  );

  const yaAgregados = lineas.map((l) => l.articuloId);

  function datosDe(articuloId) {
    return disponibles.find((f) => f.articuloId === articuloId);
  }

  function agregarArticulo() {
    const id = Number(articuloAAgregar);
    if (!Number.isInteger(id) || id <= 0) return;
    if (yaAgregados.includes(id)) return;
    // Defensa además del `disabled` del <option>: un artículo sin central
    // asignado no se puede agregar mientras el tipo sea Transferencia.
    const info = datosDe(id);
    if (!info || !esElegible(info)) return;
    setLineas((prev) => [...prev, { articuloId: id, cantidadSolicitada: "" }]);
    setArticuloAAgregar("");
  }

  function cambiarCantidad(articuloId, valor) {
    setLineas((prev) =>
      prev.map((l) => (l.articuloId === articuloId ? { ...l, cantidadSolicitada: valor } : l))
    );
  }

  function quitarLinea(articuloId) {
    setLineas((prev) => prev.filter((l) => l.articuloId !== articuloId));
  }

  function descartarBorrador() {
    setBannerBorrador(false);
    setLineas([]);
    limpiarBorrador();
  }

  // Punto 4/"¿No existe en el catálogo?": antes de navegar (misma pestaña,
  // desmonta este modal) se guarda lo ya cargado para poder recuperarlo si
  // vuelven a abrir "Nuevo requerimiento" con el mismo depósito dentro del
  // TTL — ver leerBorradorVigente más arriba.
  function irADarDeAltaArticulo() {
    try {
      sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ depositoId, lineas, guardadoEn: Date.now() }));
    } catch {
      // Si no se pudo guardar (privado/bloqueado), simplemente no habrá
      // nada que recuperar después — no bloquea la navegación.
    }
    navigate("/articulos?nuevo=1");
  }

  function elegirDeposito(valor) {
    setDepositoId(valor);
    setLineas([]);
    setMostrarHabilitar(false);
    // Punto 1: a compras no se le recuerda depósito entre altas — cada
    // solicitud es para "el que corresponda", no "el de siempre".
    if (!editando && !esCompras) {
      try {
        if (valor) localStorage.setItem(CLAVE_ULTIMO_DEPOSITO, valor);
        else localStorage.removeItem(CLAVE_ULTIMO_DEPOSITO);
      } catch {
        // localStorage puede fallar (privado/bloqueado) — es solo una
        // comodidad, no rompe el alta si no está disponible.
      }
    }
  }

  // Punto 6 — agrupación por central: mientras se arma una TRANSFERENCIA,
  // si los artículos ya agregados resuelven a más de un depósito central
  // distinto, se avisa ANTES de enviar. El envío sigue siendo un solo POST
  // (criterio ya definido): si igual se manda mezclado, el backend lo
  // rechaza con el mismo mensaje de siempre — esto solo evita llegar a esa
  // vuelta redonda sin necesidad.
  const centralesEnLineas = useMemo(() => {
    if (tipo !== TIPOS_REQUERIMIENTO.TRANSFERENCIA) return [];
    const ids = new Set();
    lineas.forEach((l) => {
      const info = disponibles.find((f) => f.articuloId === l.articuloId);
      if (info?.depositoCentralId != null) ids.add(info.depositoCentralId);
    });
    return [...ids].map((id) => depositosDisponibles.find((d) => d.id === id)?.nombre ?? `Central #${id}`);
  }, [lineas, disponibles, tipo, depositosDisponibles]);

  // Punto 4/5 — habilitar un artículo del catálogo global que todavía no
  // está habilitado en este depósito. Reusa el mismo endpoint que ya usa
  // el ABM de Depósitos (`articulo-deposito.servicio.js`) — no hace falta
  // nada nuevo del lado del backend.
  const { data: catalogo } = useQuery({
    queryKey: ["articulos-catalogo-completo"],
    queryFn: () => listarArticulos({ pageSize: 100 }),
    enabled: mostrarHabilitar,
  });
  // Ojo: contra `filasStock` (TODO lo habilitado en este depósito), no
  // contra `disponibles` — ese último ya viene angostado por tipo (en
  // Transferencia solo deja los que tienen central asignado), y un
  // artículo sin central igual está habilitado acá y no hay que
  // volver a ofrecerlo.
  const catalogoParaHabilitar = (catalogo?.items ?? []).filter(
    (a) =>
      !(filasStock ?? []).some((f) => f.articuloId === a.id) &&
      a.nombre.toLowerCase().includes(busquedaCatalogo.trim().toLowerCase())
  );

  const mutacionHabilitar = useMutation({
    // El endpoint soporta selector múltiple de depósitos (HU-4) — acá
    // siempre es una lista de uno solo, el depósito de esta solicitud.
    mutationFn: (articuloId) => habilitarArticuloEnDeposito({ articuloId, depositoIds: [Number(depositoId)] }),
    onSuccess: (_data, articuloId) => {
      // El stock recién habilitado (sin fila de ArticuloDepositoStock
      // todavía) igual aparece en /api/stock — datosDe() ya sabe mostrar
      // "—" cuando no hay stockActual/stockMinimo cargado.
      queryClient.invalidateQueries({ queryKey: ["stock", { depositoId }] });
      setLineas((prev) => (prev.some((l) => l.articuloId === articuloId) ? prev : [...prev, { articuloId, cantidadSolicitada: "" }]));
      setMostrarHabilitar(false);
      setBusquedaCatalogo("");
    },
  });

  const mutacion = useMutation({
    mutationFn: () => {
      const detalle = lineas.map((l) => ({
        articuloId: l.articuloId,
        cantidadSolicitada: Number(l.cantidadSolicitada),
      }));
      return editando
        ? actualizarRequerimiento(requerimiento.id, { depositoId: Number(depositoId), detalle })
        : crearRequerimiento({ depositoId: Number(depositoId), origen, tipo, urgente, solicitante: usuario, detalle });
    },
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
      queryClient.invalidateQueries({ queryKey: ["requerimiento", String(guardado.id)] });
      // Se envió con éxito: cualquier borrador pendiente ya cumplió su
      // propósito (o directamente no aplica más a esta solicitud).
      limpiarBorrador();
      // Segundo argumento (el registro guardado) es opcional — RequerimientosPage
      // no lo usa, pero "Duplicar" en la ficha de detalle lo necesita para
      // navegar directo a la copia recién creada.
      onExito(
        editando
          ? `Requerimiento REQ-${String(guardado.id).padStart(4, "0")} actualizado.`
          : `Requerimiento REQ-${String(guardado.id).padStart(4, "0")} creado.`,
        guardado
      );
    },
    onError: (err) =>
      setError(err?.response?.data?.error ?? `No se pudo ${editando ? "actualizar" : "crear"} el requerimiento.`),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!depositoId) return setError("Elegí el depósito que necesita la reposición.");
    if (lineas.length === 0) return setError("Agregá al menos un artículo al requerimiento.");
    const sinCantidad = lineas.find((l) => !(Number(l.cantidadSolicitada) > 0));
    if (sinCantidad) {
      return setError("Todas las líneas necesitan una cantidad mayor a 0.");
    }
    mutacion.mutate();
  }

  return (
    <Modal titulo={editando ? "Editar requerimiento" : "Nuevo requerimiento"} onClose={onClose} ancho="max-w-3xl">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 px-6 py-5">
          <p className="-mt-1 font-mono text-[11px] text-tinta/55">
            {editando ? `REQ-${String(requerimiento.id).padStart(4, "0")}` : "HU-81 — pedido de reposición por depósito"}
          </p>

          {origen === ORIGENES_REQUERIMIENTO.ALERTA && (
            <div className="flex items-center gap-2 rounded-lg border border-laton-400 bg-laton-100 px-4 py-3 text-[13px] text-laton-700">
              <Zap size={16} /> Este requerimiento se está generando desde una alerta de stock mínimo. Podés ajustar la
              cantidad y sumar más artículos antes de guardarlo.
            </div>
          )}

          {bannerBorrador && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-info bg-info-suave px-4 py-3 text-[13px] text-info-texto">
              <span className="flex items-center gap-2">
                <History size={16} /> Recuperamos tu solicitud en curso — los artículos que ya habías agregado siguen acá.
              </span>
              <button type="button" onClick={descartarBorrador} className="shrink-0 cursor-pointer text-[12px] underline hover:opacity-80">
                Empezar de cero
              </button>
            </div>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Select
                label="Depósito que pide *"
                value={depositoId}
                onChange={(e) => elegirDeposito(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {depositosDisponibles.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </Select>
              {esCompras && (
                <p className="text-[11.5px] text-piedra">
                  Como compras, podés elegir cualquier depósito como destino — periférico o central.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-tinta/70">Tipo de solicitud</span>
              <p className="rounded-md border border-borde bg-hueso px-3 py-2 text-[13.5px] text-tinta">
                {!depositoSeleccionado
                  ? "Elegí primero un depósito"
                  : tipo === TIPOS_REQUERIMIENTO.TRANSFERENCIA
                    ? "Transferencia (automático)"
                    : "Compra a proveedor"}
              </p>
            </div>
            <Input
              label="Solicitante"
              value={(editando ? requerimiento.solicitante : usuario) ?? ""}
              disabled
              className="bg-hueso text-tinta/55"
            />
            <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-tinta">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-borde"
                checked={urgente}
                onChange={(e) => setUrgente(e.target.checked)}
              />
              Urgente
            </label>
          </div>
          {tipo === TIPOS_REQUERIMIENTO.TRANSFERENCIA && (
            <p className="text-[11.5px] text-piedra">
              Se resuelve contra el depósito central asignado a cada artículo — no hace falta elegir proveedor. Si no
              hay stock suficiente en el central, la solicitud queda pendiente de stock.
            </p>
          )}
          {depositoId && (
            <p className="text-[11.5px] text-piedra">Solo se pueden pedir artículos habilitados en este depósito.</p>
          )}

          <div>
            <h2 className="font-heading text-[16px] font-semibold text-tinta">Artículos a reponer</h2>

            <div className="mt-3 flex flex-wrap items-end gap-2.5">
              <div className="min-w-[280px] flex-1">
                <Select
                  label="Agregar artículo"
                  value={articuloAAgregar}
                  onChange={(e) => setArticuloAAgregar(e.target.value)}
                  disabled={!depositoId}
                >
                  <option value="">{depositoId ? "Buscar artículo…" : "Elegí primero un depósito"}</option>
                  {disponibles
                    .filter((f) => !yaAgregados.includes(f.articuloId))
                    .map((f) => (
                      <option key={f.articuloDepositoId} value={f.articuloId} disabled={!esElegible(f)}>
                        {f.nombre} — stock {f.stockActual} {f.unidadMedida}
                        {!esElegible(f) ? " (sin central asignado)" : ""}
                      </option>
                    ))}
                </Select>
              </div>
              <Button type="button" variante="secundario" onClick={agregarArticulo} disabled={!articuloAAgregar}>
                Agregar
              </Button>
            </div>

            {hayNoElegiblesPorCentral && (
              <p className="mt-2 text-[11.5px] text-piedra">
                Los artículos marcados "sin central asignado" no se pueden pedir por transferencia — pedile a compras
                que los clasifique.
              </p>
            )}

            <div className="mt-2">
              {esCompras ? (
                // Punto 2: compras no tiene abmArticulo (admin || deposito lo
                // excluye) — nada de botón ni link, solo un mensaje fijo que
                // explica a quién pedirle, con el nombre real del depósito.
                depositoSeleccionado && (
                  <p className="text-[12px] text-piedra">
                    ¿No encontrás un artículo? Pedile al encargado de {depositoSeleccionado.nombre} que lo habilite —
                    Compras no puede habilitar artículos directamente.
                  </p>
                )
              ) : !mostrarHabilitar ? (
                <button
                  type="button"
                  onClick={() => setMostrarHabilitar(true)}
                  disabled={!depositoId}
                  className="text-[12px] text-piedra underline hover:text-tinta disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ¿No lo encontrás? Habilitar un artículo en este depósito
                </button>
              ) : (
                <div className="rounded-lg border border-borde bg-hueso p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-body text-[12px] font-semibold text-tinta">Habilitar artículo del catálogo</span>
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarHabilitar(false);
                        setBusquedaCatalogo("");
                      }}
                      className="text-[11.5px] text-piedra hover:text-tinta"
                    >
                      Cerrar
                    </button>
                  </div>
                  <input
                    autoFocus
                    value={busquedaCatalogo}
                    onChange={(e) => setBusquedaCatalogo(e.target.value)}
                    placeholder="Buscar en el catálogo…"
                    className="mt-2 w-full rounded-md border border-borde bg-white px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-pino/40"
                  />
                  <div className="mt-2 max-h-40 overflow-y-auto">
                    {catalogoParaHabilitar.length === 0 ? (
                      <p className="px-1 py-2 text-[12.5px] text-piedra">Ningún artículo del catálogo coincide.</p>
                    ) : (
                      catalogoParaHabilitar.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          disabled={mutacionHabilitar.isPending}
                          onClick={() => mutacionHabilitar.mutate(a.id)}
                          className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span>{a.nombre}</span>
                          <span className="text-[11px] text-piedra">Habilitar acá</span>
                        </button>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={irADarDeAltaArticulo}
                    className="mt-2 inline-block cursor-pointer text-[11.5px] text-piedra underline hover:text-tinta"
                  >
                    ¿No existe en el catálogo? Darlo de alta
                  </button>
                </div>
              )}
            </div>

            {centralesEnLineas.length > 1 && (
              <div className="mt-3 rounded-lg border border-laton-400 bg-laton-100 px-4 py-3 text-[13px] text-laton-700">
                Estos artículos se reponen desde centrales distintos ({centralesEnLineas.join(", ")}) — vas a tener
                que dividir esto en una solicitud por central antes de poder guardarlo.
              </div>
            )}

            <div className="mt-4">
              <Table
                columnas={["Artículo", "Stock actual", "Mínimo", "Cantidad a pedir", ""]}
                columnasDerecha={["Stock actual", "Mínimo", "Cantidad a pedir"]}
                filas={lineas}
                vacio="Todavía no agregaste artículos."
                renderFila={(l) => {
                  const info = datosDe(l.articuloId);
                  return (
                    <tr key={l.articuloId} className="border-b border-borde last:border-0">
                      <td className="px-3 py-2 font-body text-[13px] font-semibold">
                        {info?.nombre ?? `Artículo #${l.articuloId}`}
                        {info && <span className="ml-1 text-[11px] font-normal text-piedra">({info.unidadMedida})</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-body text-[12.5px]">{info?.stockActual ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-body text-[12.5px] text-piedra">
                        {info?.stockMinimo ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={l.cantidadSolicitada}
                          onChange={(e) => cambiarCantidad(l.articuloId, e.target.value)}
                          className="w-28 rounded-md border border-borde bg-white px-2 py-1 text-right text-[13px] focus:outline-none focus:ring-2 focus:ring-pino/40"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => quitarLinea(l.articuloId)}
                          className="cursor-pointer rounded-md p-1 text-piedra hover:text-error"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? "Guardando…" : editando ? "Guardar cambios" : "Crear requerimiento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
