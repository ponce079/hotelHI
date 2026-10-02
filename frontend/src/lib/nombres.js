// Nombres y apellidos con mayúscula inicial en cada palabra, sin agregar ni quitar tildes
// ("maria cruz" → "Maria Cruz"). Las partículas (de, del, la, las, los, y, da, di, van, von) van
// en minúscula, salvo al inicio ("juan de la vega" → "Juan de la Vega"; "de la vega" → "De la Vega").
// También después de un guion o un apóstrofo ("maria-jose" → "Maria-Jose", "o'connor" → "O'Connor").
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "di", "van", "von"]);

const capitalizar = (palabra) =>
  palabra
    .split(/([-'’])/)
    .map((parte) => (/^[-'’]$/.test(parte) ? parte : parte.charAt(0).toLocaleUpperCase("es") + parte.slice(1)))
    .join("");

export function formatearNombrePropio(valor) {
  const palabras = String(valor ?? "")
    .trim()
    .toLocaleLowerCase("es")
    .split(/\s+/)
    .filter(Boolean);
  return palabras.map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : capitalizar(p))).join(" ");
}
