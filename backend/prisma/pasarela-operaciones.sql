-- Registro persistente de la pasarela de pagos SIMULADA: tabla pasarela_operaciones
-- (modelo PasarelaOperacion de schema.prisma).
--
-- Qué crea: UNA tabla nueva. Una fila por operación de la pasarela (GARANTIA, COBRO, PREAUTORIZACION,
-- CAPTURA, LIBERACION), con la idempotencia (la misma clave devuelve el mismo resultado aunque se
-- reinicie el backend) y el estado de cada preautorización (Vigente, Capturada, Capturada con remanente
-- liberado, Liberada). NUNCA el número completo de la tarjeta ni el CVV: solo marca, últimos 4 y token.
-- Sin clave foránea a reservas: es el registro del proveedor simulado, no del negocio.
--
-- Aditiva: no toca ninguna tabla ni dato existente.
-- Idempotente: CREATE TABLE IF NOT EXISTS; correrla dos veces no cambia nada.
--
-- Se aplica con `node scripts/actualizar-esquema-ecommerce.js --aplicar` (junto con las otras tres
-- tablas del despliegue) y NO con `prisma db execute`: el script pasa por la guardia de la base
-- compartida (_destinoMigracion.js), acepta solo CREATE TABLE IF NOT EXISTS de estas tablas y se niega
-- si alguna ya existe con otra forma.
CREATE TABLE IF NOT EXISTS `pasarela_operaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operacion` VARCHAR(20) NOT NULL,
    `claveIdempotencia` VARCHAR(191) NULL,
    `referencia` VARCHAR(40) NULL,
    `referenciaPrevia` VARCHAR(255) NULL,
    `monto` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `aprobada` BOOLEAN NOT NULL,
    `motivo` VARCHAR(191) NULL,
    `marca` VARCHAR(40) NULL,
    `ultimos4` CHAR(4) NULL,
    `token` VARCHAR(255) NULL,
    `estadoPreautorizacion` VARCHAR(40) NULL,
    `montoCapturado` DECIMAL(12, 2) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pasarela_operaciones_claveIdempotencia_key`(`claveIdempotencia`),
    UNIQUE INDEX `pasarela_operaciones_referencia_key`(`referencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
