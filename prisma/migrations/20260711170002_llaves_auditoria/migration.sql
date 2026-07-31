-- Soporte auditable para llaves y correcciones de resultados.
ALTER TABLE `torneo_partidos_programados`
  ADD COLUMN `fase` ENUM('GRUPOS','ELIMINACION') NOT NULL DEFAULT 'GRUPOS',
  ADD COLUMN `siguiente_partido_id` INT NULL,
  ADD COLUMN `siguiente_lado` ENUM('LOCAL','VISITANTE') NULL,
  ADD KEY `tpp_fase_idx` (`fase`),
  ADD KEY `tpp_siguiente_idx` (`siguiente_partido_id`),
  ADD CONSTRAINT `tpp_siguiente_fk` FOREIGN KEY (`siguiente_partido_id`) REFERENCES `torneo_partidos_programados` (`id`) ON DELETE SET NULL;

CREATE TABLE `torneo_partido_auditorias` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `partido_programado_id` INT NOT NULL,
  `accion` ENUM('RESULTADO','REVERSION','AJUSTE_MANUAL','AVANCE_MANUAL') NOT NULL,
  `motivo` VARCHAR(255) NULL,
  `detalle` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `tpa_partido_idx` (`partido_programado_id`),
  CONSTRAINT `tpa_partido_fk` FOREIGN KEY (`partido_programado_id`) REFERENCES `torneo_partidos_programados` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
