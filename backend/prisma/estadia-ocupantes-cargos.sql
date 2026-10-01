-- AlterTable
ALTER TABLE `consumos_servicio_adicional` ADD COLUMN `anulado` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `anuladoEn` DATETIME(3) NULL,
    ADD COLUMN `anuladoPor` VARCHAR(191) NULL,
    ADD COLUMN `claveOperacion` VARCHAR(100) NULL,
    ADD COLUMN `descripcion` VARCHAR(500) NULL,
    ADD COLUMN `fechaServicio` DATETIME(3) NULL,
    ADD COLUMN `incluido` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `motivoAnulacion` VARCHAR(500) NULL,
    ADD COLUMN `precioUnitario` DECIMAL(12, 2) NULL;

-- AlterTable
ALTER TABLE `huespedes` ADD COLUMN `fechaNacimiento` DATE NULL,
    ADD COLUMN `paisDocumento` VARCHAR(191) NULL,
    ADD COLUMN `identidadDocumento` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `cargos_verificacion_checkout` ADD COLUMN `habitacionId` INTEGER NULL;

-- CreateTable
CREATE TABLE `ocupantes_reserva` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservaId` INTEGER NOT NULL,
    `identidadActiva` VARCHAR(64) NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `apellido` VARCHAR(191) NOT NULL,
    `tipoDocumento` VARCHAR(191) NULL,
    `numeroDocumento` VARCHAR(191) NULL,
    `paisDocumento` VARCHAR(191) NULL,
    `motivoSinDocumento` VARCHAR(191) NULL,
    `fechaNacimiento` DATE NULL,
    `nacionalidad` VARCHAR(191) NULL,
    `domicilio` VARCHAR(191) NULL,
    `localidad` VARCHAR(191) NULL,
    `paisResidencia` VARCHAR(191) NULL,
    `telefono` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `responsableId` INTEGER NULL,
    `fechaDesde` DATE NOT NULL,
    `fechaHasta` DATE NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'Previsto',
    `verificadoPor` VARCHAR(191) NULL,
    `verificadoEn` DATETIME(3) NULL,
    `ingresoReal` DATETIME(3) NULL,
    `salidaReal` DATETIME(3) NULL,

    UNIQUE INDEX `ocupantes_reserva_identidadActiva_key`(`identidadActiva`),
    INDEX `ocupantes_reserva_reservaId_idx`(`reservaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asignaciones_ocupantes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ocupanteId` INTEGER NOT NULL,
    `habitacionId` INTEGER NOT NULL,
    `desde` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `hasta` DATETIME(3) NULL,
    `motivo` VARCHAR(191) NULL,

    INDEX `asignaciones_ocupantes_habitacionId_hasta_idx`(`habitacionId`, `hasta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventos_estadia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservaId` INTEGER NOT NULL,
    `accion` VARCHAR(191) NOT NULL,
    `detalle` TEXT NOT NULL,
    `operador` VARCHAR(191) NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `eventos_estadia_reservaId_fecha_idx`(`reservaId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `consumos_servicio_adicional_claveOperacion_key` ON `consumos_servicio_adicional`(`claveOperacion`);

-- AddForeignKey
ALTER TABLE `ocupantes_reserva` ADD CONSTRAINT `ocupantes_reserva_reservaId_fkey` FOREIGN KEY (`reservaId`) REFERENCES `reservas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asignaciones_ocupantes` ADD CONSTRAINT `asignaciones_ocupantes_ocupanteId_fkey` FOREIGN KEY (`ocupanteId`) REFERENCES `ocupantes_reserva`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_estadia` ADD CONSTRAINT `eventos_estadia_reservaId_fkey` FOREIGN KEY (`reservaId`) REFERENCES `reservas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ocupantes_reserva` ADD COLUMN `huespedId` INTEGER NULL,
    ADD COLUMN `esTitular` BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX `huespedes_identidadDocumento_key` ON `huespedes`(`identidadDocumento`);
ALTER TABLE `ocupantes_reserva` ADD CONSTRAINT `ocupantes_reserva_huespedId_fkey` FOREIGN KEY (`huespedId`) REFERENCES `huespedes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
