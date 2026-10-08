import { describe, expect, it } from "vitest";
import { ROLES } from "../lib/sesion";
import { MENU, buscarActivo, buscarMiga, filtrarMenuPorRol } from "./menuConfig";
import { RUTAS_ANTES } from "./menuConfig.antes";

function rutasVisibles(rol) {
  return filtrarMenuPorRol(rol).flatMap((bloque) => bloque.items.map((item) => item.to));
}

describe("menuConfig — mismos permisos que el menú anterior (HU-71)", () => {
  it("el test cubre todos los roles existentes", () => {
    expect(Object.keys(RUTAS_ANTES).sort()).toEqual(Object.keys(ROLES).sort());
  });

  it.each(Object.keys(RUTAS_ANTES))("rol %s: el conjunto de rutas visibles es el de antes", (rol) => {
    const esperado = new Set(RUTAS_ANTES[rol]);
    // Único ítem nuevo: "Disponibilidad" (la vista que abre "Ver disponibilidad" de Reservas), con los mismos
    // roles que Reservas. Aparece para quien ya veía /reservas y para nadie más.
    if (esperado.has("/reservas")) esperado.add("/reservas/disponibilidad");
    const reales = rutasVisibles(rol);
    expect(new Set(reales)).toEqual(esperado);
    expect(reales).toHaveLength(esperado.size); // sin ítems repetidos
  });

  it("un grupo sin ítems visibles para el rol no se muestra", () => {
    for (const rol of Object.keys(ROLES)) {
      for (const bloque of filtrarMenuPorRol(rol)) expect(bloque.items.length).toBeGreaterThan(0);
    }
    const nombres = filtrarMenuPorRol("housekeeping").map((b) => b.grupo);
    expect(nombres).toEqual([null, "Habitaciones", "Stock"]);
  });

  it("el administrador ve los grupos en el orden definido", () => {
    expect(filtrarMenuPorRol("admin").map((b) => b.grupo)).toEqual([
      null,
      "Recepción",
      "Caja y facturación",
      "Habitaciones",
      "Comercial",
      "Stock",
      "Compras",
      "Administración",
    ]);
  });

  it("no hay rutas repetidas en la definición", () => {
    const rutas = MENU.flatMap((b) => b.items.map((i) => i.to));
    expect(new Set(rutas).size).toBe(rutas.length);
  });
});

describe("menuConfig — ítem activo y miga de pan", () => {
  const bloques = filtrarMenuPorRol("admin");

  it("marca el ítem de la ruta, con coincidencia más larga", () => {
    expect(buscarActivo(bloques, "/")?.item.label).toBe("Panel del día");
    expect(buscarActivo(bloques, "/reservas")?.item.label).toBe("Reservas");
    expect(buscarActivo(bloques, "/reservas/disponibilidad")?.item.label).toBe("Disponibilidad");
    expect(buscarActivo(bloques, "/reservas/15")?.item.label).toBe("Reservas");
    expect(buscarActivo(bloques, "/tarifas/temporadas")?.item.label).toBe("Tarifas");
    expect(buscarActivo(bloques, "/depositos/3")?.grupo).toBe("Stock");
    expect(buscarActivo(bloques, "/ruta-inexistente")).toBeNull();
  });

  it("arma la miga Grupo / Pantalla, también para pantallas fuera del menú", () => {
    expect(buscarMiga("/check-in")).toEqual({ grupo: "Recepción", pantalla: "Check-in" });
    expect(buscarMiga("/mi-perfil")).toEqual({ grupo: "Cuenta", pantalla: "Mi perfil" });
    expect(buscarMiga("/reservas/no-show")).toEqual({ grupo: "Recepción", pantalla: "Llegadas no presentadas" });
    expect(buscarMiga("/")).toEqual({ grupo: null, pantalla: "Panel del día" });
  });
});
