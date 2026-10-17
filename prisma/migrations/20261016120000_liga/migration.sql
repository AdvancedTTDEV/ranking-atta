-- Liga: torneo EQUIPOS con 2 grupos + calendario por fechas. Aditiva.
ALTER TABLE `torneos` ADD COLUMN `liga` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `torneo_partidos_programados` ADD COLUMN `fecha_numero` INTEGER NULL;
