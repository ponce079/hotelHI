import { Button } from "../../componentes/Button";
import { formatearFechaDdMmAaaa, formatearFechaHora } from "../../lib/fechas";
import { buscarPaisOcupante } from "./ocupantesUbicacion";
import { activa, documentoDe, nombreDeOcupante } from "./estadiaUtils";

const pais = (valor) => (valor ? (buscarPaisOcupante(valor)?.nombre ?? valor) : null);

function Dato({ etiqueta, children }) {
  return (
    <div>
      <dt className="text-[12px] text-tinta/70">{etiqueta}</dt>
      <dd className="text-sm">{children || "—"}</dd>
    </div>
  );
}

// Ficha de una persona de una estadía ya cerrada: solo muestra los datos registrados, sin editar ni
// ninguna acción (no hay lógica nueva: lee lo que ya tiene la ficha).
export function FichaSoloLectura({ persona: p, reserva, personas = [], onClose }) {
  const habitacion = reserva.habitaciones.find((h) => h.id === (activa(p) || p.asignaciones?.at(-1))?.habitacionId);
  const responsable = p.responsableId ? nombreDeOcupante(personas, p.responsableId) : null;
  return (
    <div className="space-y-4 p-5">
      <p className="font-heading text-lg">{`${p.nombre} ${p.apellido}`.trim()}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Dato etiqueta="Documento">{documentoDe(p, reserva)}</Dato>
        <Dato etiqueta="País emisor">{pais(p.paisDocumento)}</Dato>
        <Dato etiqueta="Nacimiento">{p.fechaNacimiento ? formatearFechaDdMmAaaa(p.fechaNacimiento) : null}</Dato>
        <Dato etiqueta="Nacionalidad">{pais(p.nacionalidad)}</Dato>
        <Dato etiqueta="Residencia">
          {[p.localidad, pais(p.paisResidencia)].filter(Boolean).join(", ") || null}
        </Dato>
        <Dato etiqueta="Domicilio">{p.domicilio}</Dato>
        <Dato etiqueta="Teléfono">{p.telefono}</Dato>
        <Dato etiqueta="Correo electrónico">{p.email}</Dato>
        <Dato etiqueta="Habitación">{habitacion ? `Habitación ${habitacion.numero}` : null}</Dato>
        <Dato etiqueta="Estado">{p.estado}</Dato>
        <Dato etiqueta="Ingreso">{p.ingresoReal ? formatearFechaHora(p.ingresoReal) : null}</Dato>
        <Dato etiqueta="Salida">{p.salidaReal ? formatearFechaHora(p.salidaReal) : null}</Dato>
        <Dato etiqueta="Verificación">
          {p.verificadoEn
            ? `Verificado${p.verificadoPor ? ` por ${p.verificadoPor}` : ""} el ${formatearFechaHora(p.verificadoEn)}`
            : "Datos por verificar"}
        </Dato>
        {responsable && (
          <Dato etiqueta="Responsable">
            {[responsable, p.vinculoResponsable, p.autorizacionPresentada ? "Autorización presentada" : null]
              .filter(Boolean)
              .join(" · ")}
          </Dato>
        )}
      </dl>
      <div className="flex justify-end">
        <Button type="button" variante="secundario" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
