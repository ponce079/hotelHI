-- Usuarios y Seguridad: tabla de usuarios reales para el login (reemplaza
-- el login simulado por tarjetas de rol). Mismo formato que genera Prisma
-- para el modelo Usuario de schema.prisma. "IF NOT EXISTS": se puede correr
-- más de una vez sin romper nada.
--
-- La forma más simple de aplicarla es `node scripts/crear-tabla-usuarios.js`
-- (usa la conexión del .env y además crea el administrador inicial).
CREATE TABLE IF NOT EXISTS `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `apellido` VARCHAR(191) NOT NULL,
    `dni` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `rol` VARCHAR(191) NOT NULL,
    `foto` MEDIUMTEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `intentosFallidos` INTEGER NOT NULL DEFAULT 0,
    `bloqueadoHasta` DATETIME(3) NULL,
    `ultimoIngreso` DATETIME(3) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_usuario_key`(`usuario`),
    UNIQUE INDEX `usuarios_dni_key`(`dni`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
