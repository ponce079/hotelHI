-- Sprint 3 (Check-out / Facturación, HU-56): motivo de la nota de crédito de
-- estadía. Hoy se valida en el formulario y en el backend pero nunca se
-- guardaba (mismo problema que ya se corrigió en comprobantes_proveedor con
-- agregar-motivo-nota-y-fecha-cobro.sql).
--
-- Aditiva y nullable: no toca datos existentes.
ALTER TABLE comprobantes_estadia ADD COLUMN motivo VARCHAR(191) NULL;
