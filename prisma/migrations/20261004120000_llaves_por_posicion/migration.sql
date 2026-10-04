-- Llaves separadas por posición de grupo para cualquier modalidad.
-- NULL = una sola llave (comportamiento clásico). 2 o 3 = cantidad de
-- llaves paralelas; la llave n (`torneo_partidos_programados.nivel_llave`)
-- toma al n-ésimo clasificado de cada grupo. ATTA_TEAMS ignora la columna
-- y usa siempre 3.

ALTER TABLE `torneos` ADD COLUMN `llaves_por_posicion` INTEGER NULL;
