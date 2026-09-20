import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion, ROLES } from "../../lib/sesion";
import { Button } from "../../componentes/Button";

const ORDEN_ROLES = ["admin", "recepcionista", "housekeeping", "deposito", "compras", "gerente"];
// Sprint 2 sumó Compras y Gastos como pilares del sistema, no solo
// Depósito y Stock (Sprint 1) — el chip destacado (el último) pasa a ser
// el más nuevo, igual que "Recepciones" lo era en el diseño de Sprint 1.
const CHIPS = ["Habitaciones", "Mantenimiento", "Housekeeping", "Stock", "Compras"];

export function LoginPage() {
  const navigate = useNavigate();
  const { iniciarSesion } = useSesion();
  const [rolElegido, setRolElegido] = useState(null);
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");

  function elegirRol(rol) {
    setRolElegido(rol);
    setError("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!rolElegido) {
      setError("Elegí un perfil para continuar.");
      return;
    }
    if (!usuario.trim() || !contrasena) {
      setError("Usuario y contraseña son obligatorios.");
      return;
    }
    iniciarSesion(rolElegido, usuario.trim());
    navigate("/", { replace: true });
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-pino text-hueso md:grid-cols-[1.02fr_.98fr]">
      <div className="flex flex-col justify-between gap-9 px-8 py-10 md:px-[52px] md:py-[52px]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 flex-none rounded-full bg-laton-400" />
          <div>
            <div className="font-heading text-xl leading-tight">Holiday Inn</div>
            <div className="text-xs text-hueso/60">SGH · Sistema de Gestión Hotelera</div>
          </div>
        </div>

        <div className="max-w-[540px]">
          <h1 className="mb-4 font-heading text-[38px] leading-[1.04] md:text-[54px]">
            La operación del hotel, bajo control.
          </h1>
          <p className="max-w-[440px] text-base leading-relaxed text-hueso/80">
            Habitaciones, mantenimiento y housekeeping integrados al circuito de depósitos,
            compras, comprobantes y pagos del hotel.
          </p>
          <div className="mt-[26px] flex flex-wrap gap-2">
            {CHIPS.map((chip, i) => {
              const esUltimo = i === CHIPS.length - 1;
              return (
                <span
                  key={chip}
                  className={`rounded-sm border px-3 py-1.5 text-xs ${
                    esUltimo
                      ? "border-laton-400/50 bg-laton-400/[.22] text-laton-200"
                      : "border-hueso/20 bg-hueso/[.13] text-hueso"
                  }`}
                >
                  {chip}
                </span>
              );
            })}
          </div>
        </div>

        <div className="text-xs text-hueso/50">Sistema de Gestión Hotelera · Holiday Inn</div>
      </div>

      <div className="flex items-center justify-center px-6 py-10 md:px-[52px]">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-[436px] rounded-[18px] bg-white px-[34px] py-8 text-tinta shadow-[0_20px_48px_rgba(10,36,27,.32)]"
        >
          <h2 className="mb-1.5 font-heading text-[29px] leading-tight">Iniciar sesión</h2>
          <p className="mb-5 text-[13px] leading-relaxed text-piedra">
            Elegí el perfil con el que querés entrar: el menú y los permisos cambian según el rol.
          </p>

          <div className="mb-5 grid gap-[7px]">
            {ORDEN_ROLES.map((rol) => {
              const activo = rolElegido === rol;
              return (
                <button
                  key={rol}
                  type="button"
                  onClick={() => elegirRol(rol)}
                  className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-[11px] border px-3.5 py-2.5 text-left transition-colors ${
                    activo ? "border-pino bg-pino text-hueso" : "border-neutro-300 bg-neutro-100 hover:bg-pino-100"
                  }`}
                >
                  <span className="text-[13.5px] font-semibold leading-tight">{ROLES[rol].label}</span>
                  <span className={`text-[11.5px] leading-tight ${activo ? "text-hueso/75" : "text-piedra"}`}>
                    {ROLES[rol].descripcion}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-4 flex gap-2.5">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-piedra">Usuario</label>
              <input
                value={usuario}
                onChange={(e) => {
                  setUsuario(e.target.value);
                  setError("");
                }}
                placeholder="usuario.sgh"
                className="w-full rounded-md border border-borde px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-piedra">Contraseña</label>
              <input
                type="password"
                value={contrasena}
                onChange={(e) => {
                  setContrasena(e.target.value);
                  setError("");
                }}
                placeholder="••••••••"
                className="w-full rounded-md border border-borde px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
              />
            </div>
          </div>

          {error && (
            <div className="mb-3.5 flex items-center gap-2 rounded-md bg-error-suave px-3.5 py-2 text-xs text-error-texto">
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-error" />
              {error}
            </div>
          )}

          <Button type="submit" variante="ok" className="h-[46px] w-full justify-center">
            Ingresar
          </Button>
          <p className="mt-3.5 text-[11px] leading-relaxed text-piedra">
            El bloqueo por intentos fallidos y la gestión de roles son parte del Sprint 3; acá el
            login sólo deriva al panel del perfil.
          </p>
        </form>
      </div>
    </div>
  );
}
