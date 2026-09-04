-- Revisión final del Sprint 2: "contacto" pasó a ser obligatorio en el
-- alta/edición de Proveedor (ver proveedores.controlador.js), pero no
-- había backfill para las filas ya cargadas con contacto NULL/'' —
-- quedaban sin poder editarse (PUT) hasta completar el campo.
-- Ya se corrió contra la base compartida (1 fila afectada, "Test Trim
-- Bug SA", dato de prueba). Se deja el script para que quede en el
-- historial y sea repetible si aparece otra fila así.
UPDATE proveedores SET contacto = 'Sin datos' WHERE contacto IS NULL OR contacto = '';
