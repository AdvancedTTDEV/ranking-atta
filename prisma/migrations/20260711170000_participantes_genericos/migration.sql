-- Participantes genéricos para torneos individual, dobles y por equipos.
-- Los inscritos antiguos se preservan y se convierten en miembros de su
-- inscripción correspondiente antes de que la aplicación use el nuevo flujo.

ALTER TABLE `torneos`
  ADD COLUMN `modalidad` ENUM('INDIVIDUAL', 'DOBLES', 'EQUIPOS') NOT NULL DEFAULT 'INDIVIDUAL';

ALTER TABLE `torneo_participantes`
  ADD COLUMN `nombre_personalizado` VARCHAR(100) NULL;

CREATE TABLE `torneo_participante_miembros` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `torneo_participante_id` INT NOT NULL,
  `jugador_id` INT NOT NULL,
  `orden` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tp_miembros_participante_jugador_uq` (`torneo_participante_id`, `jugador_id`),
  KEY `tp_miembros_jugador_idx` (`jugador_id`),
  CONSTRAINT `tp_miembros_participante_fk`
    FOREIGN KEY (`torneo_participante_id`) REFERENCES `torneo_participantes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tp_miembros_jugador_fk`
    FOREIGN KEY (`jugador_id`) REFERENCES `jugadores` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `torneo_participante_miembros` (`torneo_participante_id`, `jugador_id`, `orden`)
SELECT `id`, `jugador_id`, 1
FROM `torneo_participantes`
WHERE `jugador_id` IS NOT NULL;
