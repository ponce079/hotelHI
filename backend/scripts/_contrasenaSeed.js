// Contraseñas de los scripts que crean usuarios: NUNCA hay una por defecto en el código. Se exige por variable de
// entorno, con un mínimo de 10 caracteres, y nunca se imprime.
const MINIMO = 10;

// Devuelve la contraseña de `variable` o lanza un Error con un mensaje claro (sin mostrar el valor).
function exigirContrasena(variable, env = process.env) {
  const valor = env[variable];
  if (!valor) {
    throw new Error(
      `Falta la variable ${variable}: este script no tiene contraseña por defecto. Definila (mínimo ${MINIMO} caracteres) ` +
        "en la terminal o en backend/.env antes de ejecutarlo."
    );
  }
  if (valor.length < MINIMO) {
    throw new Error(`${variable} es demasiado corta (${valor.length} caracteres): el mínimo es ${MINIMO}.`);
  }
  return valor;
}

module.exports = { exigirContrasena, MINIMO };
