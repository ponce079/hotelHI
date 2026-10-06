-- E-commerce (HU-99 a HU-104), etapa 1B-1: tabla datos_reserva_web.
--
-- Qué crea: la tabla datos_reserva_web (modelo DatosReservaWeb de
-- schema.prisma), 1 a 1 con reservas: datos propios de una reserva hecha
-- desde la web (email y teléfono de contacto, llegada estimada, solicitudes,
-- consentimiento, y la garantía con tarjeta SIN número completo ni CVV).
-- Índices únicos en reservaId y claveIdempotencia, y FK a reservas(id).
--
-- Aditiva: no toca ninguna tabla ni dato existente.
-- Idempotente: CREATE TABLE IF NOT EXISTS con la FK adentro; correrla dos
-- veces no cambia nada.
--
-- Cómo aplicarla (desde backend/, con DATABASE_URL apuntando a la base que
-- corresponde):
--   npx prisma db execute --file prisma/agregar-datos-reserva-web.sql
--   npx prisma generate
CREATE TABLE IF NOT EXISTS `datos_reserva_web` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservaId` INTEGER NOT NULL,
    `claveIdempotencia` VARCHAR(64) NOT NULL,
    `emailContacto` VARCHAR(190) NOT NULL,
    `telefonoContacto` VARCHAR(40) NOT NULL,
    `horaEstimadaLlegada` VARCHAR(30) NULL,
    `solicitudesEspeciales` VARCHAR(500) NULL,
    `aceptaPoliticasEn` DATETIME(3) NOT NULL,
    `versionPoliticas` VARCHAR(20) NOT NULL,
    `aceptaComunicaciones` BOOLEAN NOT NULL DEFAULT false,
    `tarjetaTitular` VARCHAR(120) NULL,
    `tarjetaMarca` VARCHAR(20) NULL,
    `tarjetaUltimos4` CHAR(4) NULL,
    `tarjetaVencimiento` VARCHAR(7) NULL,
    `garantiaToken` VARCHAR(64) NULL,
    `pasarelaReferencia` VARCHAR(64) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `datos_reserva_web_reservaId_key`(`reservaId`),
    UNIQUE INDEX `datos_reserva_web_claveIdempotencia_key`(`claveIdempotencia`),
    PRIMARY KEY (`id`),
    CONSTRAINT `datos_reserva_web_reservaId_fkey` FOREIGN KEY (`reservaId`) REFERENCES `reservas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- IMPORTANTE: este archivo se aplica con `node scripts/actualizar-esquema-ecommerce.js --aplicar`
-- (verificación previa: scripts/verificar-previo-ecommerce.js) y NO con `prisma db execute`: el
-- script pasa por la guardia de la base compartida (_destinoMigracion.js), acepta solo este
-- CREATE TABLE IF NOT EXISTS y se niega si la tabla ya existe con otra forma.
