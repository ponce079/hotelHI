import { TEXTO_NO_REGISTRADA, textoOtrosDocumentos, textoRegistrada } from "./ficha";

// Mensaje de estado de la identificación por documento, igual en todas las pantallas del mostrador.
export function EstadoIdentificacion({ identificacion, className = "" }) {
  const { estado, ficha, otrosDocumentos } = identificacion;
  if (estado === "inactivo") return null;
  let texto = "";
  if (estado === "buscando") texto = "Buscando al huésped…";
  else if (estado === "registrada") texto = textoRegistrada(ficha);
  else if (estado === "nueva") texto = TEXTO_NO_REGISTRADA;
  else if (estado === "error") texto = "No pudimos buscar el documento: cargá los datos a mano.";
  return (
    <div role="status" aria-live="polite" className={`text-[12.5px] ${className}`}>
      <p className={estado === "registrada" ? "font-semibold text-pino-800" : "text-piedra"}>{texto}</p>
      {estado === "registrada" && ficha?.alojadaAhora && <p className="text-laton-700">Esta persona figura alojada ahora en otra estadía.</p>}
      {estado === "nueva" && otrosDocumentos.length > 0 && <p className="mt-0.5 text-laton-700">{textoOtrosDocumentos(otrosDocumentos)}</p>}
    </div>
  );
}
