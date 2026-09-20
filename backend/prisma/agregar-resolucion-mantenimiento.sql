-- Reparto de responsabilidad de mantenimiento (Housekeeping resuelve,
-- Recepcionista solo reporta) — se retira el simulacro de notificación
-- (canal/destinatario) y se agregan campos reales de prioridad y
-- resolución. Todas nullable/con default, no tocan filas existentes.
ALTER TABLE ordenes_mantenimiento ADD COLUMN urgente TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE ordenes_mantenimiento ADD COLUMN estado VARCHAR(191) NOT NULL DEFAULT 'Pendiente';
ALTER TABLE ordenes_mantenimiento ADD COLUMN resueltaEn DATETIME(3) NULL;
ALTER TABLE ordenes_mantenimiento ADD COLUMN resueltaPor VARCHAR(191) NULL;

-- Guarda el estado previo a "mantenimiento" para poder restaurarlo (en vez
-- de liberar siempre a "libre") cuando la orden se marca "Resuelta".
ALTER TABLE habitaciones ADD COLUMN estadoAnterior VARCHAR(191) NULL;
