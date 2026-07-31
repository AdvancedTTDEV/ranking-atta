-- Casillas vacías y encadenamiento de llaves de eliminación.
ALTER TABLE `torneo_partidos_programados`
  MODIFY COLUMN `participante_local_id` INT NULL,
  MODIFY COLUMN `participante_visitante_id` INT NULL,
  ADD COLUMN `ronda_eliminacion` VARCHAR(30) NULL,
  ADD COLUMN `posicion_llave` INT NULL,
  ADD KEY `tpp_ronda_llave_idx` (`ronda_eliminacion`, `posicion_llave`);
