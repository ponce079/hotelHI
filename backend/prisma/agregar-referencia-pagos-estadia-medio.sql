-- Sprint 3 (Check-out / Facturación, HU-50): referencia del cobro con tarjeta
-- simulada (marca, últimos 4 dígitos, código de autorización, cuotas). Sirve
-- para auditar el pago en la tabla de pagos de la estadía. NO guarda el número
-- completo de la tarjeta ni el código de seguridad.
--
-- Aditiva y nullable: no toca datos existentes.
ALTER TABLE pagos_estadia_medio ADD COLUMN referencia VARCHAR(191) NULL;
