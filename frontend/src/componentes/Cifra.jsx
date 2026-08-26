// Fraunces es solo para "lo que se lee de un vistazo": titulos y numeros
// grandes. Encapsular el numero aca evita que alguien le meta Sora o al
// reves le pegue Fraunces a una celda de texto comun.
const TAMANOS = {
  14: "text-[14px]",
  15: "text-[15px]",
  20: "text-[20px]",
  21: "text-[21px]",
  26: "text-[26px]",
  28: "text-[28px]",
  34: "text-[34px]",
};

export function Cifra({ tamano = 20, className = "", children }) {
  return <span className={`font-heading leading-tight ${TAMANOS[tamano] ?? TAMANOS[20]} ${className}`}>{children}</span>;
}
