-- HU-31 a 35 (Panel de Habitaciones): motivo obligatorio al bloquear una
-- habitación. Nullable porque no aplica a los demás estados — mismo
-- criterio que motivoAnulacion en OrdenCompra/PagoEstadia.
ALTER TABLE habitaciones ADD COLUMN motivoBloqueo TEXT NULL;
