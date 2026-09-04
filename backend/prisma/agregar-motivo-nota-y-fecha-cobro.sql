-- Fase 4 del plan de corrección (t10, t11): dos columnas nuevas, ambas
-- nullable y aditivas — no tocan datos existentes.
--
-- t10 (HU-73): motivo de la nota de débito/crédito, que hoy se valida en
-- el formulario y en el backend pero nunca se guarda.
ALTER TABLE comprobantes_proveedor ADD COLUMN motivo VARCHAR(191) NULL;

-- t11 (HU-86): fecha en que se cobró un cheque, para no perder el dato
-- que pide el criterio de aceptación al marcarlo "Cobrado".
ALTER TABLE ordenes_pago_medio ADD COLUMN fechaCobro DATETIME(3) NULL;
