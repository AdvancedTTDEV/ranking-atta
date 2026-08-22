-- ============================================================================
-- MOCK: TORNEO ATTA TEAMS COMPLETO PARA PROBAR EL FLUJO DE PARTIDOS
-- ⚠ Correr SOLO contra la BD de DESARROLLO (host hopper). NUNCA caboose/prod.
--
-- Qué hace (todo en transacción):
--   1) Crea el torneo ATTA_TEAMS "MOCK - ATTA Teams Circuito".
--   2) Crea 24 jugadores nuevos (8 equipos × 3, series 1ra/2da/3ra por trío).
--   3) Inscribe los 8 equipos con nombre_personalizado y sus 3 miembros.
--   4) Genera 2 grupos por serpentina (4 equipos cada uno).
--   5) Genera el round-robin completo de la fase de grupos: 12 partidos
--      PENDIENTES, cada uno con sus 5 detalles (1 DOBLES + 4 INDIVIDUAL).
--
-- Re-ejecutable: borra primero sus propios datos anteriores.
-- Si los checks finales se ven mal: cambia el COMMIT final por ROLLBACK.
-- ============================================================================

START TRANSACTION;

SELECT DATABASE() AS bd_actual;

-- ── Clubes / categorías ──
INSERT IGNORE INTO clubes (nombre)
VALUES ('CTMPO'),('FSH'),('ACHTM'),('CPL'),('ATTA'),('TTTC'),('CTMV'),('CTMH');

SET @primera = (SELECT id FROM categorias WHERE nombre = '1era');
SET @segunda = (SELECT id FROM categorias WHERE nombre = '2da');
SET @tercera = (SELECT id FROM categorias WHERE nombre = '3era');
SET @club    = (SELECT id FROM clubes WHERE nombre = 'ATTA');

-- ── LIMPIEZA de corridas anteriores (SOLO este torneo y SUS jugadores) ──
DELETE FROM jugadores WHERE nombre IN (
    'Armando Bethancourt','Brenda Cedeño','Cristóbal Díaz',
    'Delia Escalante','Emilio Ferrer','Florencia Gutiérrez',
    'Gonzalo Herrera','Henrietta Ibáñez','Iván Jiménez',
    'Julissa Kong','Lucas Lombana','Marisol Méndez',
    'Néstor Obarrio','Olga Pardo','Pablo Quijano',
    'Querube Ríos','Ricardo Sandoval','Susana Tapia',
    'Trinidad Ugarte','Ulises Vargas','Violeta Wan',
    'Wilfredo Xió','Yara Zambrano','Zeus Ábrego'
);
DELETE FROM torneos WHERE nombre = 'MOCK - ATTA Teams Circuito';

-- ============================================================================
-- 1) TORNEO
-- ============================================================================
INSERT INTO torneos (nombre, fecha, ubicacion, modalidad, abierto)
VALUES ('MOCK - ATTA Teams Circuito', CURDATE(), 'Complejo Atlético Pacífico', 'ATTA_TEAMS', 1);
SET @t = LAST_INSERT_ID();

INSERT INTO torneo_categorias (torneo_id, categoria_id) VALUES (@t, @primera);

-- ============================================================================
-- 2) JUGADORES (24: tríos con serie 1ra + 2da + 3ra)
--    orden 1-3 → equipo 1, 4-6 → equipo 2, ...
-- ============================================================================
CREATE TEMPORARY TABLE tmp_jug (
    orden INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(60),
    elo INT,
    cat INT
);

INSERT INTO tmp_jug (nombre, elo, cat) VALUES
    ('Armando Bethancourt', 905, @primera), ('Brenda Cedeño',     720, @segunda), ('Cristóbal Díaz',      585, @tercera),
    ('Delia Escalante',     862, @primera), ('Emilio Ferrer',     748, @segunda), ('Florencia Gutiérrez', 540, @tercera),
    ('Gonzalo Herrera',     834, @primera), ('Henrietta Ibáñez',  701, @segunda), ('Iván Jiménez',        562, @tercera),
    ('Julissa Kong',        888, @primera), ('Lucas Lombana',     763, @segunda), ('Marisol Méndez',      528, @tercera),
    ('Néstor Obarrio',      851, @primera), ('Olga Pardo',        694, @segunda), ('Pablo Quijano',       599, @tercera),
    ('Querube Ríos',        817, @primera), ('Ricardo Sandoval',  735, @segunda), ('Susana Tapia',        551, @tercera),
    ('Trinidad Ugarte',     879, @primera), ('Ulises Vargas',     712, @segunda), ('Violeta Wan',         574, @tercera),
    ('Wilfredo Xió',        843, @primera), ('Yara Zambrano',     687, @segunda), ('Zeus Ábrego',         536, @tercera);

INSERT INTO jugadores (nombre, elo, club_id, categoria_id)
SELECT nombre, elo, @club, cat FROM tmp_jug ORDER BY orden;

CREATE TEMPORARY TABLE tmp_miembro AS
SELECT j.id AS jugador_id,
       ((tj.orden - 1) DIV 3) + 1 AS equipo,
       ((tj.orden - 1) MOD 3) + 1 AS miembro_orden
FROM tmp_jug tj
JOIN jugadores j ON j.nombre = tj.nombre;

-- ============================================================================
-- 3) EQUIPOS INSCRITOS (participante = capitán + 3 miembros)
-- ============================================================================
CREATE TEMPORARY TABLE tmp_nombres (equipo INT PRIMARY KEY, nombre VARCHAR(80));
INSERT INTO tmp_nombres VALUES
    (1,'ATT Fénix'),(2,'TT Titans'),(3,'Spin Masters'),(4,'Top Spin PC'),
    (5,'Los Smashes'),(6,'Drive Pro'),(7,'Reversos FC'),(8,'Saque Bolita');

INSERT INTO torneo_participantes (torneo_id, jugador_id, categoria_id, nombre_personalizado, seed)
SELECT @t, m.jugador_id, @primera, n.nombre, m.equipo
FROM tmp_miembro m
JOIN tmp_nombres n ON n.equipo = m.equipo
WHERE m.miembro_orden = 1;

INSERT INTO torneo_participante_miembros (torneo_participante_id, jugador_id, orden)
SELECT p.id, m.jugador_id, m.miembro_orden
FROM tmp_miembro m
JOIN tmp_nombres n ON n.equipo = m.equipo
JOIN torneo_participantes p ON p.torneo_id = @t AND p.nombre_personalizado = n.nombre;

-- ============================================================================
-- 4) GRUPOS POR SERPENTINA: G1 {1,4,5,8} · G2 {2,3,6,7}
-- ============================================================================
INSERT INTO torneo_grupos (torneo_id, categoria_id, numero_grupo)
VALUES (@t, @primera, 1), (@t, @primera, 2);

CREATE TEMPORARY TABLE tmp_grupo_equipo (equipo INT PRIMARY KEY, grupo INT);
INSERT INTO tmp_grupo_equipo VALUES
    (1,1),(4,1),(5,1),(8,1),
    (2,2),(3,2),(6,2),(7,2);

INSERT INTO torneo_grupo_participantes (grupo_id, torneo_participante_id, posicion)
SELECT g.id, p.id, te.equipo
FROM tmp_grupo_equipo te
JOIN torneo_grupos g ON g.torneo_id = @t AND g.numero_grupo = te.grupo
JOIN torneo_participantes p ON p.torneo_id = @t
    AND p.nombre_personalizado = (SELECT nombre FROM tmp_nombres WHERE equipo = te.equipo);

-- Posición dentro del grupo (para armar los cruces). Dos copias idénticas
-- porque MySQL no permite referenciar la misma tabla temporal dos veces
-- en una misma consulta.
CREATE TEMPORARY TABLE tmp_pos (
    grupo INT, pos INT, participante INT,
    INDEX (participante)
);
INSERT INTO tmp_pos
SELECT te.grupo,
       ROW_NUMBER() OVER (PARTITION BY te.grupo ORDER BY te.equipo),
       tgp.torneo_participante_id
FROM tmp_grupo_equipo te
JOIN torneo_grupos g ON g.torneo_id = @t AND g.numero_grupo = te.grupo
JOIN torneo_grupo_participantes tgp ON tgp.grupo_id = g.id
JOIN torneo_participantes p ON p.id = tgp.torneo_participante_id
    AND p.nombre_personalizado = (SELECT nombre FROM tmp_nombres WHERE equipo = te.equipo);

CREATE TEMPORARY TABLE tmp_pos2 LIKE tmp_pos;
INSERT INTO tmp_pos2 SELECT * FROM tmp_pos;

-- ============================================================================
-- 5) ROUND-ROBIN DE GRUPOS: 6 partidos por grupo, 12 en total
-- ============================================================================
CREATE TEMPORARY TABLE tmp_pair (grupo INT, lpos INT, vpos INT, orden INT);
INSERT INTO tmp_pair VALUES
    (1,1,2,1),(1,3,4,2),(1,1,3,3),(1,2,4,4),(1,1,4,5),(1,2,3,6),
    (2,1,2,7),(2,3,4,8),(2,1,3,9),(2,2,4,10),(2,1,4,11),(2,2,3,12);

INSERT INTO torneo_partidos_programados
    (torneo_id, categoria_id, grupo_id,
     participante_local_id, participante_visitante_id,
     fase, estado, orden, updated_at)
SELECT @t, @primera, g.id,
       lp.participante, vp.participante,
       'GRUPOS', 'PENDIENTE', pr.orden, NOW()
FROM tmp_pair pr
JOIN torneo_grupos g ON g.torneo_id = @t AND g.numero_grupo = pr.grupo
JOIN tmp_pos lp ON lp.grupo = pr.grupo AND lp.pos = pr.lpos
JOIN tmp_pos2 vp ON vp.grupo = pr.grupo AND vp.pos = pr.vpos;

-- 5 detalles por partido de equipos: 1 DOBLES + 4 INDIVIDUAL
INSERT INTO torneo_partido_detalles (partido_programado_id, orden, tipo)
SELECT p.id, d.orden, d.tipo
FROM torneo_partidos_programados p
CROSS JOIN (
    SELECT 1 AS orden, 'DOBLES' AS tipo
    UNION ALL SELECT 2, 'INDIVIDUAL'
    UNION ALL SELECT 3, 'INDIVIDUAL'
    UNION ALL SELECT 4, 'INDIVIDUAL'
    UNION ALL SELECT 5, 'INDIVIDUAL'
) d
WHERE p.torneo_id = @t AND p.fase = 'GRUPOS';

-- ============================================================================
-- CHECKS FINALES
-- ============================================================================
SELECT
    (SELECT COUNT(*) FROM torneo_participantes WHERE torneo_id = @t)          AS equipos,
    (SELECT COUNT(*) FROM torneo_participante_miembros m
       JOIN torneo_participantes t ON t.id = m.torneo_participante_id
       WHERE t.torneo_id = @t)                                                AS miembros,
    (SELECT COUNT(*) FROM torneo_grupos WHERE torneo_id = @t)                 AS grupos,
    (SELECT COUNT(*) FROM torneo_grupo_participantes tgp
       JOIN torneo_grupos g ON g.id = tgp.grupo_id
       WHERE g.torneo_id = @t)                                                AS asignaciones,
    (SELECT COUNT(*) FROM torneo_partidos_programados
       WHERE torneo_id = @t AND fase = 'GRUPOS')                              AS partidos,
    (SELECT COUNT(*) FROM torneo_partido_detalles d
       JOIN torneo_partidos_programados p ON p.id = d.partido_programado_id
       WHERE p.torneo_id = @t)                                                 AS detalles;

COMMIT;
