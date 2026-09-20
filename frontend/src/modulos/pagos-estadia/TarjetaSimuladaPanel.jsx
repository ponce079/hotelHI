import { useEffect, useRef, useState } from "react";
import { CreditCard, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { formatearMonto } from "../../lib/moneda";
import {
  CUOTAS_TARJETA_CREDITO,
  FINAL_TARJETA_RECHAZADA,
  formatearNumeroTarjeta,
  formatearVencimiento,
  generarCodigoAutorizacion,
  luhnValido,
  marcaTarjeta,
  soloDigitos,
  TARJETA_DE_PRUEBA,
  vencimientoVigente,
} from "./pagoEstadia.constantes";

const DEMORA_SIMULADA_MS = 1500;

// Terminal de tarjeta SIMULADA: pide los datos, "contacta al procesador" un
// segundo y medio y devuelve aprobado (con un código de autorización) o
// rechazado. No hay procesador real.
//
// Los datos de la tarjeta viven solo en el estado de este panel: al aprobar
// se los descarta y hacia afuera sale únicamente `referencia`, un texto para
// auditar ("Visa ****4242 · aut. 483920 · 3 cuotas"). Nunca se guarda ni se
// manda el número completo ni el código de seguridad.
export function TarjetaSimuladaPanel({ tipo, importe, onAutorizada, onCancelar }) {
  const esCredito = tipo === "Tarjeta crédito";
  const [numero, setNumero] = useState("");
  const [titular, setTitular] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [codigo, setCodigo] = useState("");
  const [cuotas, setCuotas] = useState("1");
  const [fase, setFase] = useState("formulario"); // formulario | procesando | rechazada
  const [errores, setErrores] = useState({});
  const timer = useRef(null);

  // Si el panel se cierra a mitad de la "llamada al procesador", no se
  // dispara la respuesta sobre un componente que ya no está.
  useEffect(() => () => clearTimeout(timer.current), []);

  function autorizar() {
    const digitos = soloDigitos(numero);
    const nuevos = {};
    if (!luhnValido(digitos)) nuevos.numero = "Número de tarjeta inválido.";
    if (!titular.trim()) nuevos.titular = "Ingresá el titular.";
    if (!vencimientoVigente(vencimiento)) nuevos.vencimiento = "Vencimiento inválido o vencido (MM/AA).";
    if (!/^\d{3,4}$/.test(codigo)) nuevos.codigo = "3 o 4 dígitos.";
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setFase("procesando");
    timer.current = setTimeout(() => {
      if (digitos.endsWith(FINAL_TARJETA_RECHAZADA)) {
        setFase("rechazada");
        return;
      }
      const cantidadCuotas = esCredito ? Number(cuotas) : 1;
      const referencia =
        `${marcaTarjeta(digitos)} ****${digitos.slice(-4)} · aut. ${generarCodigoAutorizacion()}` +
        (cantidadCuotas > 1 ? ` · ${cantidadCuotas} cuotas` : "");
      onAutorizada(referencia);
    }, DEMORA_SIMULADA_MS);
  }

  const procesando = fase === "procesando";

  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-laton-300 bg-laton-100 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-heading text-[16px] font-semibold text-laton-700">
            <CreditCard size={16} /> Terminal de pago simulada — {tipo}
          </p>
          <p className="mt-0.5 text-[12px] text-laton-700">
            Simulación: no se cobra nada de verdad. Probá con la tarjeta {TARJETA_DE_PRUEBA}; una que termine en{" "}
            {FINAL_TARJETA_RECHAZADA} simula un rechazo.
          </p>
        </div>
        <p className="flex-none font-mono text-[15px] font-semibold text-tinta">$ {formatearMonto(importe)}</p>
      </div>

      {fase === "rechazada" && (
        <div className="rounded-md bg-error-suave px-4 py-3">
          <p className="text-[12.5px] text-error-texto">
            Pago rechazado por el emisor (fondos insuficientes — rechazo simulado). Probá con otra tarjeta o elegí otro
            medio.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Número de tarjeta"
          value={numero}
          error={errores.numero}
          disabled={procesando}
          inputMode="numeric"
          autoComplete="off"
          placeholder={TARJETA_DE_PRUEBA}
          onChange={(e) => setNumero(formatearNumeroTarjeta(e.target.value))}
        />
        <Input
          label="Titular"
          value={titular}
          error={errores.titular}
          disabled={procesando}
          autoComplete="off"
          placeholder="Como figura en la tarjeta"
          onChange={(e) => setTitular(e.target.value)}
        />
        <Input
          label="Vencimiento (MM/AA)"
          value={vencimiento}
          error={errores.vencimiento}
          disabled={procesando}
          inputMode="numeric"
          autoComplete="off"
          placeholder="12/28"
          onChange={(e) => setVencimiento(formatearVencimiento(e.target.value))}
        />
        <Input
          label="Código de seguridad"
          type="password"
          value={codigo}
          error={errores.codigo}
          disabled={procesando}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          placeholder="•••"
          onChange={(e) => setCodigo(soloDigitos(e.target.value))}
        />
        {esCredito && (
          <Select label="Cuotas" value={cuotas} disabled={procesando} onChange={(e) => setCuotas(e.target.value)}>
            {CUOTAS_TARJETA_CREDITO.map((c) => (
              <option key={c} value={c}>
                {c === 1 ? "1 pago (sin cuotas)" : `${c} cuotas`}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11.5px] text-laton-700">
          <ShieldCheck size={13} /> Los datos de la tarjeta no se guardan: solo queda el código de autorización.
        </p>
        <div className="flex gap-2.5">
          <Button variante="secundario" icono={X} disabled={procesando} onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variante="ok" icono={procesando ? LoaderCircle : CreditCard} disabled={procesando} onClick={autorizar}>
            {procesando ? "Contactando al procesador…" : fase === "rechazada" ? "Reintentar" : `Autorizar $ ${formatearMonto(importe)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
