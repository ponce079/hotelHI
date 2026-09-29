import { inicialesDe } from "./usuarios.constantes";

// Foto de perfil redonda; si el usuario no cargó foto, sus iniciales.
export function Avatar({ usuario, tamano = 28, className = "" }) {
  const estilo = { width: tamano, height: tamano };
  if (usuario?.foto) {
    return <img src={usuario.foto} alt="" style={estilo} className={`flex-none rounded-full object-cover ${className}`} />;
  }
  return (
    <div
      style={{ ...estilo, fontSize: Math.max(10, Math.round(tamano * 0.38)) }}
      className={`flex flex-none items-center justify-center rounded-full bg-laton-700 font-body font-medium text-hueso ${className}`}
    >
      {inicialesDe(usuario)}
    </div>
  );
}
