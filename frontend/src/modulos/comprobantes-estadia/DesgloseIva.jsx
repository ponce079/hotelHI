import { moneda } from "./moneda";

const FILA = "flex items-baseline justify-between gap-6 text-[12.5px] text-piedra";
const MONTO = "font-mono text-[13px] text-tinta";

// Comprobante a empresa: neto + IVA por separado. A consumidor final: "IVA contenido" según el
// Régimen de Transparencia Fiscal (Ley 27.743); el total ya es precio final con IVA incluido.
export function DesgloseIva({ importeNeto, importeIVA, alicuotaIVA, esEmpresa, className = "min-w-50" }) {
  if (!esEmpresa) {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <div className={FILA}>
          <span>IVA contenido:</span>
          <span className={MONTO}>{moneda(importeIVA)}</span>
        </div>
        <p className="text-[10.5px] text-piedra">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</p>
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className={FILA}>
        <span>Importe neto</span>
        <span className={MONTO}>{moneda(importeNeto)}</span>
      </div>
      <div className={FILA}>
        <span>IVA {String(Number(alicuotaIVA)).replace(".", ",")} %</span>
        <span className={MONTO}>{moneda(importeIVA)}</span>
      </div>
    </div>
  );
}
