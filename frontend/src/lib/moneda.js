export function formatearMonto(n) {
  return Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Precio para mostrar en pantalla: "$ 40.000" (punto de miles, sin decimales si es entero) o
// "$ 40.000,50" si tiene centavos. Se usa en el check-in; las demás pantallas conservan su formato.
export function formatearPrecio(n) {
  const valor = Number(n || 0);
  const signo = valor < 0 ? "−" : "";
  const absoluto = Math.abs(valor);
  const entero = Math.round(absoluto * 100) % 100 === 0;
  const texto = absoluto.toLocaleString("es-AR", {
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: entero ? 0 : 2,
  });
  return `${signo}$ ${texto}`;
}
