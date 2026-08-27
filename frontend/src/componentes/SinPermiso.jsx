import { Lock } from "lucide-react";

// Se muestra en vez del contenido de una pantalla cuando el rol logueado no
// tiene el permiso correspondiente. El menu (Layout.jsx) ya oculta el link
// para esos roles, pero eso es solo cosmetico — cualquiera que entre por URL
// directa llega igual a la ruta, asi que cada pantalla sensible necesita este
// mismo chequeo adentro, no solo el link escondido.
export function SinPermiso() {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-[18.4px] bg-white px-6 py-16 text-center">
      <Lock size={28} className="text-piedra" />
      <h2 className="font-heading text-lg font-semibold text-tinta">No tenés permiso para ver esta pantalla</h2>
      <p className="max-w-sm text-sm text-piedra">Tu perfil actual no tiene acceso a esta función. Si creés que es un error, consultá con un administrador.</p>
    </div>
  );
}
