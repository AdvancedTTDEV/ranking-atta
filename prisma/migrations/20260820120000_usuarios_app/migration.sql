-- Usuarios autorizados a entrar al dashboard.
-- Mientras la tabla esté vacía, el login con Google queda abierto.
-- Al insertar el primer usuario, solo los emails activos podrán entrar:
--   INSERT INTO usuarios_app (email, nombre, rol) VALUES ('tu@email.com', 'Tu Nombre', 'ADMIN');

CREATE TABLE `usuarios_app` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(100) NULL,
    `rol` ENUM('ADMIN', 'OPERADOR', 'LECTURA') NOT NULL DEFAULT 'ADMIN',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_en` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX `email` (`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
