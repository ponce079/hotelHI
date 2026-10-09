import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronUp, LogOut, UserRound } from "lucide-react";
import { inicialesDe, nombreCompleto } from "../../modulos/usuarios/usuarios.constantes";

// Tarjeta de usuario del menú lateral + menú de cuenta (HU-117). Solo enlaza lo
// que ya existe: "Mi perfil" (/mi-perfil, que también tiene el cambio de
// contraseña) y "Cerrar sesión". Se cierra con Escape, con click afuera y al
// elegir una opción.
export function MenuCuenta({ datos, usuario, rolLabel, onCerrarSesion }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef(null);
  const boton = useRef(null);
  const nombre = nombreCompleto(datos) || usuario;

  useEffect(() => {
    if (!abierto) return undefined;
    function alClickAfuera(evento) {
      if (contenedor.current && !contenedor.current.contains(evento.target)) setAbierto(false);
    }
    function alTeclear(evento) {
      if (evento.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    }
    document.addEventListener("mousedown", alClickAfuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alClickAfuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  return (
    <div className="sb-user" ref={contenedor}>
      {abierto && (
        <div className="cuenta-menu" role="menu" aria-label="Cuenta">
          <div className="cuenta-datos">
            <strong>{nombre}</strong>
            {datos?.email && <span>{datos.email}</span>}
            <span>{rolLabel}</span>
          </div>
          <Link to="/mi-perfil" role="menuitem" className="cuenta-opcion" onClick={() => setAbierto(false)}>
            <UserRound size={16} strokeWidth={1.8} /> Mi perfil
          </Link>
          <div className="cuenta-separador" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="cuenta-opcion cuenta-opcion-peligro"
            onClick={() => {
              setAbierto(false);
              onCerrarSesion();
            }}
          >
            <LogOut size={16} strokeWidth={1.8} /> Cerrar sesión
          </button>
        </div>
      )}
      <button
        ref={boton}
        type="button"
        className="sb-user-btn"
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={`${nombre} · ${rolLabel}`}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="sb-user-iniciales" aria-hidden="true">
          {inicialesDe(datos)}
        </span>
        <span className="sb-user-datos">
          <span className="sb-user-nombre">{nombre}</span>
          <span className="sb-user-rol">{rolLabel}</span>
        </span>
        <ChevronUp className="sb-user-chevron" size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
