// Foto de perfil: se elige una imagen JPG o PNG de hasta 2 MB y, antes de
// mandarla, el navegador la recorta cuadrada y la achica a 256x256 en JPEG.
// Queda en ~20-60 mil caracteres, así se guarda directo en la base (campo
// `foto` del usuario) sin necesitar un servicio de archivos aparte.

export const TIPOS_FOTO = ["image/jpeg", "image/png"];
export const TAMANO_MAXIMO_FOTO = 2 * 1024 * 1024;

const LADO = 256;
// Mismo tope que valida el backend (LIMITES_USUARIO.fotoCaracteres).
const MAX_CARACTERES = 90000;

export function validarArchivoFoto(archivo) {
  if (!archivo) return "Elegí una imagen.";
  if (!TIPOS_FOTO.includes(archivo.type)) return "La foto tiene que ser JPG o PNG.";
  if (archivo.size > TAMANO_MAXIMO_FOTO) return "La foto no puede pesar más de 2 MB.";
  return null;
}

function cargarImagen(url) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => resolver(imagen);
    imagen.onerror = () => rechazar(new Error("No se pudo leer la imagen. Probá con otro archivo."));
    imagen.src = url;
  });
}

export async function prepararFoto(archivo) {
  const error = validarArchivoFoto(archivo);
  if (error) throw new Error(error);

  const url = URL.createObjectURL(archivo);
  try {
    const imagen = await cargarImagen(url);
    const canvas = document.createElement("canvas");
    canvas.width = LADO;
    canvas.height = LADO;
    const contexto = canvas.getContext("2d");

    // Recorte cuadrado centrado (como una foto de perfil de cualquier app).
    const lado = Math.min(imagen.naturalWidth, imagen.naturalHeight);
    const x = (imagen.naturalWidth - lado) / 2;
    const y = (imagen.naturalHeight - lado) / 2;
    // Fondo blanco: un PNG con transparencia pasado a JPEG quedaría negro.
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, LADO, LADO);
    contexto.drawImage(imagen, x, y, lado, lado, 0, 0, LADO, LADO);

    for (const calidad of [0.85, 0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL("image/jpeg", calidad);
      if (dataUrl.length <= MAX_CARACTERES) return dataUrl;
    }
    throw new Error("No se pudo achicar la foto lo suficiente. Probá con otra imagen.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
