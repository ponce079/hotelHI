// Secreto con el que la pasarela SIMULADA firma sus tokens (variable PASARELA_TOKEN_SECRETO).
//
//  - En producción (NODE_ENV=production) es obligatorio y tiene que medir al menos 32 caracteres: si falta o
//    es más corto, el backend NO arranca (ver index.js) con un mensaje claro.
//  - En desarrollo y test, si falta, se usa un valor de desarrollo y se avisa UNA sola vez por consola
//    (sin imprimir el valor).
// El secreto nunca se escribe en el código ni en los logs. Cambiarlo invalida los tokens ya emitidos
// (las garantías guardadas en bases de prueba dejan de poder cobrarse con la tarjeta guardada).
const LARGO_MINIMO = 32;
// Valor SOLO para desarrollo y pruebas automáticas: no protege nada y no sirve en producción.
const SECRETO_DE_DESARROLLO = "desarrollo-y-pruebas-no-usar-en-produccion-0000";
let advertido = false;

function leerSecreto(env = process.env, { advertir = (m) => console.warn(m) } = {}) {
  const valor = String(env.PASARELA_TOKEN_SECRETO ?? "");
  const produccion = env.NODE_ENV === "production";
  if (produccion) {
    if (!valor) {
      throw new Error(
        "Falta PASARELA_TOKEN_SECRETO: en producción es obligatoria (con al menos 32 caracteres aleatorios). " +
          "El backend no arranca sin ella."
      );
    }
    if (valor.length < LARGO_MINIMO) {
      throw new Error(`PASARELA_TOKEN_SECRETO es demasiado corta (${valor.length} caracteres): en producción tiene que tener al menos ${LARGO_MINIMO}.`);
    }
    return valor;
  }
  if (valor) return valor;
  if (!advertido) {
    advertido = true;
    advertir(
      "[pasarela] PASARELA_TOKEN_SECRETO no está definida: se usa un secreto de desarrollo (solo para entornos locales y pruebas). " +
        "Definila en backend/.env; en producción es obligatoria."
    );
  }
  return SECRETO_DE_DESARROLLO;
}

// Para los tests: vuelve a permitir la advertencia única.
function _reiniciarAdvertencia() {
  advertido = false;
}

module.exports = { leerSecreto, LARGO_MINIMO, SECRETO_DE_DESARROLLO, _reiniciarAdvertencia };
