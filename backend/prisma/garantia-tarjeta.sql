-- Garantía con tarjeta de crédito (feature/garantia-tarjeta).
--
-- UN SOLO script, aditivo e idempotente ("IF NOT EXISTS": se puede correr más
-- de una vez sin romper nada). Crea tablas nuevas; no modifica ni borra
-- ninguna columna existente. Se va ampliando con cada etapa de la rama.
--
-- NUNCA se guarda el número completo de la tarjeta ni el CVV: solo el token
-- de la pasarela, la marca, los últimos 4 y el vencimiento (PCI-DSS).
--
-- Aplicar primero en una base LOCAL. En la base compartida solo en un
-- despliegue coordinado, una vez aprobado el PR.

CREATE TABLE IF NOT EXISTS `garantias_reserva` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservaId` INTEGER NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `token` VARCHAR(255) NULL,
    `marca` VARCHAR(40) NULL,
    `ultimos4` VARCHAR(4) NULL,
    `vencimiento` VARCHAR(5) NULL,
    `referencia` VARCHAR(191) NULL,
    `monto` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'Vigente',
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `garantias_reserva_reservaId_key`(`reservaId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `garantias_reserva_reservaId_fkey` FOREIGN KEY (`reservaId`) REFERENCES `reservas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Garantía del check-in: preautorización (tarjeta de crédito) o depósito en
-- efectivo. NO es un pago: no suma a lo pagado ni resta del saldo.
CREATE TABLE IF NOT EXISTS `garantias_estadia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservaId` INTEGER NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `montoUsado` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `token` VARCHAR(255) NULL,
    `referencia` VARCHAR(191) NULL,
    `marca` VARCHAR(40) NULL,
    `ultimos4` VARCHAR(4) NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'Pendiente',
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `garantias_estadia_reservaId_key`(`reservaId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `garantias_estadia_reservaId_fkey` FOREIGN KEY (`reservaId`) REFERENCES `reservas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
