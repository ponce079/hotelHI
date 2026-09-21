-- Sprint 3 (Check-out / Facturación, HU-53 / HU-54 / HU-56): fecha de emisión
-- de ComprobanteEstadia. El reporte de caja diaria filtra las Notas de
-- Crédito por día y la tabla no tenía ninguna columna de fecha.
--
-- Aditiva: NOT NULL con DEFAULT, así que las filas que ya existan quedan con
-- la fecha del momento en que se corre este script (no rompe nada).
ALTER TABLE comprobantes_estadia
  ADD COLUMN fecha DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
