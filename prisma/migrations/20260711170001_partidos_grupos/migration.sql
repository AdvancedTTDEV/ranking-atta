-- Partidos visuales de grupos/llaves y sus sets.
-- La tabla `partidos` no se modifica: continúa siendo el historial de ELO.

CREATE TABLE `torneo_partidos_programados` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `torneo_id` INT NOT NULL,
  `categoria_id` INT NOT NULL,
  `grupo_id` INT NULL,
  `participante_local_id` INT NOT NULL,
  `participante_visitante_id` INT NOT NULL,
  `arbitro_jugador_id` INT NULL,
  `ganador_participante_id` INT NULL,
  `sets_local` INT NOT NULL DEFAULT 0,
  `sets_visitante` INT NOT NULL DEFAULT 0,
  `orden` INT NOT NULL DEFAULT 1,
  `estado` ENUM('PENDIENTE', 'FINALIZADO') NOT NULL DEFAULT 'PENDIENTE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tpp_grupo_orden_uq` (`grupo_id`, `orden`),
  KEY `tpp_torneo_idx` (`torneo_id`),
  KEY `tpp_categoria_idx` (`categoria_id`),
  KEY `tpp_local_idx` (`participante_local_id`),
  KEY `tpp_visitante_idx` (`participante_visitante_id`),
  CONSTRAINT `tpp_torneo_fk` FOREIGN KEY (`torneo_id`) REFERENCES `torneos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tpp_categoria_fk` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tpp_grupo_fk` FOREIGN KEY (`grupo_id`) REFERENCES `torneo_grupos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tpp_local_fk` FOREIGN KEY (`participante_local_id`) REFERENCES `torneo_participantes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tpp_visitante_fk` FOREIGN KEY (`participante_visitante_id`) REFERENCES `torneo_participantes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tpp_ganador_fk` FOREIGN KEY (`ganador_participante_id`) REFERENCES `torneo_participantes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tpp_arbitro_fk` FOREIGN KEY (`arbitro_jugador_id`) REFERENCES `jugadores` (`id`) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `torneo_partido_sets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `partido_programado_id` INT NOT NULL,
  `numero` INT NOT NULL,
  `puntos_local` INT NOT NULL,
  `puntos_visitante` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tps_partido_numero_uq` (`partido_programado_id`, `numero`),
  CONSTRAINT `tps_partido_fk` FOREIGN KEY (`partido_programado_id`) REFERENCES `torneo_partidos_programados` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `torneo_partido_detalles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `partido_programado_id` INT NOT NULL,
  `orden` INT NOT NULL,
  `tipo` ENUM('DOBLES', 'INDIVIDUAL') NOT NULL,
  `ganador_lado` ENUM('LOCAL', 'VISITANTE') NULL,
  `sets_local` INT NOT NULL DEFAULT 0,
  `sets_visitante` INT NOT NULL DEFAULT 0,
  `estado` ENUM('PENDIENTE', 'FINALIZADO') NOT NULL DEFAULT 'PENDIENTE',
  PRIMARY KEY (`id`),
  UNIQUE KEY `tpd_partido_orden_uq` (`partido_programado_id`, `orden`),
  CONSTRAINT `tpd_partido_fk` FOREIGN KEY (`partido_programado_id`) REFERENCES `torneo_partidos_programados` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `torneo_partido_detalle_jugadores` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `detalle_id` INT NOT NULL,
  `jugador_id` INT NOT NULL,
  `lado` ENUM('LOCAL', 'VISITANTE') NOT NULL,
  `orden` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tpdj_detalle_jugador_uq` (`detalle_id`, `jugador_id`),
  KEY `tpdj_jugador_idx` (`jugador_id`),
  CONSTRAINT `tpdj_detalle_fk` FOREIGN KEY (`detalle_id`) REFERENCES `torneo_partido_detalles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tpdj_jugador_fk` FOREIGN KEY (`jugador_id`) REFERENCES `jugadores` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `torneo_partido_detalle_sets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `detalle_id` INT NOT NULL,
  `numero` INT NOT NULL,
  `puntos_local` INT NOT NULL,
  `puntos_visitante` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tpds_detalle_numero_uq` (`detalle_id`, `numero`),
  CONSTRAINT `tpds_detalle_fk` FOREIGN KEY (`detalle_id`) REFERENCES `torneo_partido_detalles` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
