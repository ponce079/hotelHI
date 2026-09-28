import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Search, UserCheck, UserPlus, UserX, LockOpen } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Badge } from "../../componentes/Badge";
import { Table } from "../../componentes/Table";
import { Select } from "../../componentes/Select";
import { FilterBar } from "../../componentes/FilterBar";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { useToast } from "../../lib/useToast";
import { ROLES, useSesion } from "../../lib/sesion";
import { Avatar } from "./Avatar";
import { UsuarioModal } from "./UsuarioModal";
import { RestablecerContrasenaModal } from "./RestablecerContrasenaModal";
import { cambiarActivoUsuario, desbloquearUsuario, listarUsuarios } from "./usuarios.api";
import {
  FILTROS_ESTADO,
  estadoUsuario,
  formatearDni,
  formatearFechaHora,
  mensajeDeError,
  nombreCompleto,
} from "./usuarios.constantes";

const FILTROS_VACIOS = { buscar: "", rol: "", estado: "" };

function coincideBusqueda(usuario, texto) {
  if (!texto) return true;
  const buscado = texto.trim().toLowerCase();
  return [usuario.usuario, usuario.nombre, usuario.apellido, nombreCompleto(usuario), usuario.dni, usuario.email ?? ""].some(
    (valor) => String(valor).toLowerCase().includes(buscado)
  );
}

function coincideEstado(usuario, estado) {
  if (estado === "activos") return usuario.activo;
  if (estado === "inactivos") return !usuario.activo;
  if (estado === "bloqueados") return usuario.bloqueado;
  return true;
}

// Usuarios y Seguridad — gestión de usuarios (solo admin): alta con rol,
// edición, desactivar/reactivar, desbloquear y restablecer contraseña.
export function UsuariosPage() {
  const { puede } = useSesion();
  if (!puede("gestionarUsuarios")) return <SinPermiso />;
  return <GestionUsuarios />;
}

function GestionUsuarios() {
  const { perfil, actualizarPerfil } = useSesion();
  const queryClient = useQueryClient();
  const { toast, mostrarToast } = useToast();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  // { tipo: "form", usuario? } | { tipo: "contrasena", usuario } | { tipo: "activo" | "desbloquear", usuario }
  const [modal, setModal] = useState(null);
  const [errorAccion, setErrorAccion] = useState("");

  const usuariosQuery = useQuery({ queryKey: ["usuarios"], queryFn: listarUsuarios });
  const usuarios = useMemo(() => usuariosQuery.data ?? [], [usuariosQuery.data]);

  const filtrados = usuarios.filter(
    (u) => coincideBusqueda(u, filtros.buscar) && (!filtros.rol || u.rol === filtros.rol) && coincideEstado(u, filtros.estado)
  );

  const conteos = {
    "": usuarios.length,
    activos: usuarios.filter((u) => u.activo).length,
    inactivos: usuarios.filter((u) => !u.activo).length,
    bloqueados: usuarios.filter((u) => u.bloqueado).length,
  };

  function cerrar() {
    setModal(null);
    setErrorAccion("");
  }

  function alGuardar(mensaje, guardado) {
    // Si el admin se editó a sí mismo, se refresca su nombre en el menú.
    if (guardado && perfil && guardado.id === perfil.id) actualizarPerfil(guardado);
    cerrar();
    mostrarToast(mensaje);
  }

  const mutacionAccion = useMutation({
    mutationFn: ({ tipo, usuario }) =>
      tipo === "desbloquear" ? desbloquearUsuario(usuario.id) : cambiarActivoUsuario(usuario.id, !usuario.activo),
    onSuccess: (actualizado, { tipo }) => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      const mensaje =
        tipo === "desbloquear"
          ? `${actualizado.usuario} desbloqueado.`
          : `${actualizado.usuario} ${actualizado.activo ? "reactivado" : "desactivado"}.`;
      cerrar();
      mostrarToast(mensaje);
    },
    onError: (error) => setErrorAccion(mensajeDeError(error, "No se pudo completar la acción.")),
  });

  function actualizarFiltro(campo, valor) {
    setFiltros((actual) => ({ ...actual, [campo]: valor }));
  }

  const hayFiltros = Boolean(filtros.buscar || filtros.rol || filtros.estado);
  const confirmando = modal?.tipo === "activo" || modal?.tipo === "desbloquear" ? modal : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">Usuarios</h1>
          <p className="mt-1 text-sm text-piedra">Quién puede entrar al sistema y con qué rol. Solo el administrador gestiona esta pantalla.</p>
        </div>
        <Button icono={UserPlus} onClick={() => setModal({ tipo: "form" })}>
          Nuevo usuario
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {FILTROS_ESTADO.map(({ valor, etiqueta }) => {
          const activo = filtros.estado === valor;
          return (
            <button
              key={valor || "todos"}
              type="button"
              onClick={() => actualizarFiltro("estado", valor)}
              className={`cursor-pointer rounded-lg border p-4 text-left transition-colors ${
                activo ? "border-pino bg-pino text-hueso" : "border-borde bg-white text-tinta hover:bg-pino-100"
              }`}
            >
              <div className={`text-[11px] font-semibold uppercase tracking-[0.03em] ${activo ? "text-hueso/80" : "text-piedra"}`}>
                {etiqueta}
              </div>
              <div className="mt-1 font-heading text-[28px] font-semibold leading-none">{conteos[valor]}</div>
            </button>
          );
        })}
      </div>

      <FilterBar onClear={hayFiltros ? () => setFiltros(FILTROS_VACIOS) : undefined}>
        <label className="relative flex min-w-[260px] flex-1 items-center">
          <Search size={15} className="pointer-events-none absolute left-3 text-piedra" />
          <input
            value={filtros.buscar}
            onChange={(e) => actualizarFiltro("buscar", e.target.value)}
            placeholder="Buscar por nombre, usuario, DNI o email"
            aria-label="Buscar usuarios"
            className="w-full rounded-md border border-borde bg-white py-2 pl-9 pr-3 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </label>
        <div className="w-52">
          <Select value={filtros.rol} onChange={(e) => actualizarFiltro("rol", e.target.value)} aria-label="Filtrar por rol">
            <option value="">Todos los roles</option>
            {Object.entries(ROLES).map(([valor, info]) => (
              <option key={valor} value={valor}>
                {info.label}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <div className="rounded-lg border border-borde bg-white p-5">
        {usuariosQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-piedra">Cargando usuarios…</p>
        ) : usuariosQuery.isError ? (
          <p className="py-8 text-center text-sm text-error-texto">
            {mensajeDeError(usuariosQuery.error, "No se pudieron cargar los usuarios.")}
          </p>
        ) : (
          <Table
            columnas={["Usuario", "DNI", "Rol", "Estado", "Último ingreso", "Acciones"]}
            columnasDerecha={["Acciones"]}
            filas={filtrados}
            vacio={hayFiltros ? "Ningún usuario coincide con los filtros." : "Todavía no hay usuarios cargados."}
            renderFila={(u) => {
              const esUnoMismo = perfil?.id === u.id;
              const estado = estadoUsuario(u);
              const acciones = [{ label: "Restablecer contraseña", onClick: () => setModal({ tipo: "contrasena", usuario: u }) }];
              if (u.bloqueado) acciones.push({ label: "Desbloquear", onClick: () => setModal({ tipo: "desbloquear", usuario: u }) });
              if (!esUnoMismo) {
                acciones.push(
                  u.activo
                    ? { label: "Desactivar", variante: "destructivo", onClick: () => setModal({ tipo: "activo", usuario: u }) }
                    : { label: "Reactivar", onClick: () => setModal({ tipo: "activo", usuario: u }) }
                );
              }
              return (
                <tr key={u.id} className={`border-b border-borde last:border-0 ${u.activo ? "" : "opacity-70"}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar usuario={u} tamano={34} />
                      <div className="min-w-0">
                        <div className="truncate font-body text-[13.5px] font-semibold text-tinta">
                          {nombreCompleto(u)}
                          {esUnoMismo && <span className="ml-1.5 text-[11px] font-normal text-piedra">(vos)</span>}
                        </div>
                        <div className="truncate font-mono text-[11.5px] text-piedra">{u.usuario}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12.5px] text-tinta/80">{formatearDni(u.dni)}</td>
                  <td className="px-3 py-2.5">
                    <Badge variante={u.rol === "admin" ? "alerta" : "info"}>{ROLES[u.rol]?.label ?? u.rol}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variante={estado.variante}>{estado.etiqueta}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-tinta/70">{formatearFechaHora(u.ultimoIngreso)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variante="secundario"
                        tamano="fila"
                        icono={Pencil}
                        onClick={() => setModal({ tipo: "form", usuario: u })}
                      >
                        Editar
                      </Button>
                      <MenuAcciones acciones={acciones} />
                    </div>
                  </td>
                </tr>
              );
            }}
          />
        )}
      </div>

      {modal?.tipo === "form" && (
        <UsuarioModal
          usuario={modal.usuario}
          esUnoMismo={Boolean(modal.usuario && perfil?.id === modal.usuario.id)}
          onClose={cerrar}
          onExito={alGuardar}
        />
      )}

      {modal?.tipo === "contrasena" && (
        <RestablecerContrasenaModal usuario={modal.usuario} onClose={cerrar} onExito={(mensaje) => alGuardar(mensaje)} />
      )}

      <ConfirmDialog
        abierto={Boolean(confirmando)}
        titulo={
          confirmando?.tipo === "desbloquear"
            ? "¿Desbloquear usuario?"
            : confirmando?.usuario.activo
              ? "¿Desactivar usuario?"
              : "¿Reactivar usuario?"
        }
        mensaje={
          confirmando?.tipo === "desbloquear"
            ? `${nombreCompleto(confirmando.usuario)} va a poder volver a intentar iniciar sesión ahora mismo.`
            : confirmando?.usuario.activo
              ? `${nombreCompleto(confirmando.usuario)} no va a poder entrar al sistema hasta que lo reactives. No se borra: su historial queda.`
              : `${nombreCompleto(confirmando?.usuario)} va a poder volver a entrar con su usuario y contraseña.`
        }
        textoConfirmar={
          confirmando?.tipo === "desbloquear" ? "Sí, desbloquear" : confirmando?.usuario.activo ? "Sí, desactivar" : "Sí, reactivar"
        }
        variante={confirmando?.tipo === "activo" && confirmando?.usuario.activo ? "destructivo" : "ok"}
        icono={confirmando?.tipo === "desbloquear" ? LockOpen : confirmando?.usuario.activo ? UserX : UserCheck}
        cargando={mutacionAccion.isPending}
        onCancelar={cerrar}
        onConfirmar={() => mutacionAccion.mutate(confirmando)}
      >
        {errorAccion && <p className="text-[12.5px] text-error-texto">{errorAccion}</p>}
      </ConfirmDialog>

      <Toast mensaje={toast} />
    </div>
  );
}
