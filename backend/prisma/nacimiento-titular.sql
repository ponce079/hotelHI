-- Cambio aditivo para la rama; aplicado solo en bases locales de prueba.
-- Nullable para conservar huéspedes anteriores sin inventar un nacimiento.
ALTER TABLE huespedes ADD COLUMN fechaNacimiento DATE NULL;
