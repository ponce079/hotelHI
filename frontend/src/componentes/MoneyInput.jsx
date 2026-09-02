import { useEffect, useRef, useState } from "react";

// Cantidad de digitos (0-9) que hay en `texto` antes de la posicion
// `hastaPos` — se usa para saber "cuantos digitos tenia el usuario a la
// izquierda del cursor" y reubicarlo despues de reformatear.
function contarDigitos(texto, hastaPos) {
  let n = 0;
  for (let i = 0; i < hastaPos && i < texto.length; i++) {
    if (/\d/.test(texto[i])) n++;
  }
  return n;
}

// Posicion en `texto` que deja exactamente `cantidad` digitos a su
// izquierda — inverso de contarDigitos, para restaurar el cursor.
function posicionParaDigitos(texto, cantidad) {
  if (cantidad <= 0) return 0;
  let n = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i])) {
      n++;
      if (n === cantidad) return i + 1;
    }
  }
  return texto.length;
}

// "1210,5" -> "1.210,5" — miles con punto, decimales con coma (es-AR).
// Los decimales siempre se acotan a 2 digitos, tanto si vienen de lo
// que tipeo el usuario como de un `value` sincronizado desde afuera.
function formatearParaEditar(crudo) {
  if (!crudo) return "";
  const [enteroCrudo, decimalCrudo] = crudo.split(",");
  const entero = (enteroCrudo || "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decimalCrudo === undefined) return entero;
  return `${entero || "0"},${decimalCrudo.slice(0, 2)}`;
}

// "1.210,5" -> "1210.5" (string con punto decimal, lista para Number()).
function textoANumero(texto) {
  if (!texto) return "";
  const sinPuntoDeMiles = texto.replace(/\./g, "").replace(",", ".");
  return sinPuntoDeMiles.endsWith(".") ? sinPuntoDeMiles.slice(0, -1) : sinPuntoDeMiles;
}

// Separa "lo que se tipeo/pego" en parte entera + decimal, aceptando
// tanto "," como "." como separador decimal (alguien puede pegar un
// importe copiado en formato en-US, ej. "1234.56"). El separador
// decimal real es el ULTIMO "," o "." que tenga 0, 1 o 2 digitos hasta
// el final del texto — los centavos nunca son mas de 2 digitos, asi
// que un punto seguido de 3 digitos se interpreta como separador de
// miles, no decimal (ej. "1.234" pegado se lee como 1234, no 1,234).
function separarEnteroYDecimal(bruto) {
  const coincidencia = bruto.match(/[.,](\d{0,2})$/);
  if (!coincidencia) return { crudo: bruto.replace(/\D/g, ""), separadorRecienTipeado: false };
  const parteEntera = bruto.slice(0, coincidencia.index).replace(/\D/g, "");
  return {
    crudo: `${parteEntera},${coincidencia[1]}`,
    separadorRecienTipeado: coincidencia[1] === "",
  };
}

// Campo de importe con "$" fijo, puntos de miles en vivo y coma para
// centavos (convencion es-AR) — nunca deja tipear un caracter que no sea
// digito, coma o punto, ni mas de 2 decimales. `value`/`onChange` viajan
// como string numerico con punto decimal (ej. "1210.5"), el mismo
// formato que ya esperan los calculos con Number(...) en el wizard.
export function MoneyInput({ label, value, onChange, error, placeholder = "0,00", className = "" }) {
  const inputRef = useRef(null);
  const ultimoEmitido = useRef(null);
  const [texto, setTexto] = useState(() => formatearParaEditar(String(value ?? "").replace(".", ",")));

  // Resincroniza el texto mostrado si `value` cambia desde AFUERA (ej. se
  // recalcula el máximo al tildar otro comprobante) — pero no si el
  // cambio es el eco de nuestro propio onChange, porque ahí pisaría lo
  // que el usuario esta tipeando (ej. una coma recien puesta, sin
  // decimales todavia).
  useEffect(() => {
    const entrante = value === "" || value === undefined || value === null ? "" : String(value);
    if (entrante === ultimoEmitido.current) return;
    setTexto(formatearParaEditar(entrante.replace(".", ",")));
  }, [value]);

  function emitir(nuevoTexto, posicionCursor) {
    const numero = textoANumero(nuevoTexto);
    ultimoEmitido.current = numero;
    setTexto(nuevoTexto);
    onChange(numero);
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.setSelectionRange(posicionCursor, posicionCursor);
    });
  }

  function manejarCambio(e) {
    const cursorAnterior = e.target.selectionStart ?? e.target.value.length;
    const digitosAntes = contarDigitos(texto, cursorAnterior);

    const { crudo, separadorRecienTipeado } = separarEnteroYDecimal(e.target.value);
    const nuevoTexto = formatearParaEditar(crudo);
    const pos = separadorRecienTipeado ? nuevoTexto.length : posicionParaDigitos(nuevoTexto, digitosAntes);
    emitir(nuevoTexto, pos);
  }

  // Si lo que se borra es justo la coma, no dejamos que el navegador
  // fusione los centavos con la parte entera (ej. "1.210,50" -> borrar
  // la coma -> "121.050" por accidente) — se descarta el decimal
  // entero, como si el usuario hubiera vuelto a un importe redondo.
  function manejarTecla(e) {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    const el = e.target;
    if (el.selectionStart !== el.selectionEnd) return;
    const posBorrada = e.key === "Backspace" ? el.selectionStart - 1 : el.selectionStart;
    if (texto[posBorrada] !== ",") return;
    e.preventDefault();
    const nuevoTexto = formatearParaEditar(texto.slice(0, posBorrada).replace(/\D/g, ""));
    emitir(nuevoTexto, nuevoTexto.length);
  }

  // Una coma sin decimales todavia (ej. "1.210,") se limpia sola al
  // salir del campo, para no dejar un caracter colgando en pantalla —
  // el valor ya emitido durante el tipeo es el correcto de cualquier forma.
  function manejarBlur() {
    if (texto.endsWith(",")) setTexto(texto.slice(0, -1));
  }

  return (
    <label className="flex flex-col gap-1.5 font-body text-sm">
      {label && <span className="text-[12px] text-tinta/70">{label}</span>}
      <div
        className={`flex items-center gap-1 rounded-md border bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-pino/40 ${
          error ? "border-error" : "border-borde"
        } ${className}`}
      >
        <span className="text-[13.5px] text-tinta/55">$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          className="w-full bg-transparent text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none"
          value={texto}
          onChange={manejarCambio}
          onKeyDown={manejarTecla}
          onBlur={manejarBlur}
          placeholder={placeholder}
        />
      </div>
      {error && <span className="text-[11.5px] text-error-texto">{error}</span>}
    </label>
  );
}
