-- ATTA Teams: nueva modalidad de torneo + llaves por nivel.
-- 1) El enum `modalidad` de `torneos` gana el valor ATTA_TEAMS.
-- 2) `torneo_partidos_programados.nivel_llave` distingue las tres llaves
--    paralelas de ATTA Teams (1 = Oro/1ros, 2 = Plata/2dos, 3 = Bronce/3ros).
--    NULL en las modalidades existentes.

ALTER TABLE `torneos` MODIFY COLUMN `modalidad` ENUM('INDIVIDUAL', 'DOBLES', 'EQUIPOS', 'ATTA_TEAMS') NOT NULL DEFAULT 'INDIVIDUAL';

ALTER TABLE `torneo_partidos_programados` ADD COLUMN `nivel_llave` INTEGER NULL;
