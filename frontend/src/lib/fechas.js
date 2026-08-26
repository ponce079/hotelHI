export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function primerDiaDelMesISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
