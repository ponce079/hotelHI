import { formatearMonto } from "../../lib/moneda";

export const moneda = (n) => `$ ${formatearMonto(n)}`;
