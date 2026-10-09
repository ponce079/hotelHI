import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, Search } from "lucide-react";
import { etiquetaHoyConDia } from "../../lib/fechas";

// Barra superior (HU-117): miga de pan, buscador y fecha del día. El buscador
// por ahora solo lleva a la lista de Reservas con ?q= (la búsqueda en sí es la
// de siempre, del backend). Se oculta para los roles que no pueden ver
// Reservas: a ellos esa pantalla les mostraría "sin permiso".
export function Topbar({ miga, puedeBuscar, onAbrirMenu, menuMovilAbierto }) {
  const [texto, setTexto] = useState("");
  const navigate = useNavigate();

  function buscar(evento) {
    evento.preventDefault();
    const q = texto.trim();
    if (q) navigate(`/reservas?q=${encodeURIComponent(q)}`);
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-hamburguesa"
        onClick={onAbrirMenu}
        aria-label="Abrir menú"
        aria-controls="menu-lateral"
        aria-expanded={menuMovilAbierto}
      >
        <Menu size={20} strokeWidth={1.8} />
      </button>

      {miga && (
        <nav className="topbar-miga" aria-label="Miga de pan">
          {miga.grupo && (
            <>
              <span>{miga.grupo}</span>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span aria-current="page">{miga.pantalla}</span>
        </nav>
      )}

      {puedeBuscar && (
        <form className="topbar-buscador" role="search" onSubmit={buscar}>
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
          <input
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Buscar reserva, localizador, huésped o habitación"
            aria-label="Buscar reserva, localizador, huésped o habitación"
          />
        </form>
      )}

      <div className="topbar-fecha">Hoy · {etiquetaHoyConDia()}</div>
    </header>
  );
}
