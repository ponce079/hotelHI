import { useNavigate } from "react-router-dom";

// Header de pestañas del módulo de Tarifas (HU-90 a HU-93) — mismo patrón
// que el header de Pagos/Cuenta Corriente (PagosPage.jsx): cada pestaña es
// su propia ruta, este componente solo navega entre ellas. Se extrajo a un
// componente propio (a diferencia de Pagos) porque acá son 5 pestañas, no
// 2 — inlinearlo en cada página hubiera significado repetir la lista 5 veces.
const PESTANAS = [
  { to: "/tarifas", label: "Tarifas" },
  { to: "/tarifas/temporadas", label: "Temporadas" },
  { to: "/tarifas/calendario", label: "Calendario" },
  { to: "/tarifas/planes", label: "Planes" },
  { to: "/tarifas/actualizaciones", label: "Actualizaciones" },
  // Motor de cotización (HU-94, Etapa 3) — de solo lectura para
  // recepcionista/admin, gatea igual que el resto con verTarifas.
  { to: "/tarifas/cotizador", label: "Cotizador" },
];

export function TarifasTabs({ activa }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap gap-1 border-b border-borde">
      {PESTANAS.map((p) => (
        <button
          key={p.to}
          type="button"
          onClick={() => (p.to === activa ? null : navigate(p.to))}
          className={`-mb-px cursor-pointer border-b-2 px-4 py-2.5 font-body text-sm font-semibold ${
            p.to === activa ? "border-pino text-pino" : "border-transparent text-tinta/55 hover:text-tinta"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
