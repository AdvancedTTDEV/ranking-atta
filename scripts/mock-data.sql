-- ============================================================================
-- MOCK DATA PARA PROBAR EL FLUJO DE TORNEOS
-- ⚠ Correr SOLO contra la BD de DESARROLLO (host hopper). NUNCA caboose/prod.
--
-- Ejecución (ejemplo con cliente mysql):
--   mysql -h hopper.proxy.rlwy.net -P 26868 -u USUARIO -p railway < scripts/mock-data.sql
-- (o pega el contenido en tu cliente gráfico apuntando a hopper)
--
-- Qué hace:
--   1) Crea el torneo INDIVIDUAL "MOCK - Copa Individual de Prueba":
--      24 jugadores mock, 4 grupos por serpentina (según ELO) y TODOS los
--      cruces round-robin dentro de cada grupo, en estado pendiente.
--      Sin llaves: al abrir el modal se generan vacías solas.
--   2) Toma el torneo ATTA_TEAMS más reciente (o lo crea si no existe),
--      le borra participantes/grupos/partidos previos y le inscribe
--      14 equipos mock de 3 jugadores con series mixtas válidas (regla
--      ATTA) bajo la categoría ancla "primera". SIN grupos ni partidos
--      ni llaves: ese flujo se prueba a mano desde cero.
--
-- Todo va en una transacción: si algo se ve mal en los checks finales,
-- cambia el COMMIT del final por ROLLBACK y no queda nada guardado.
-- Re-ejecutable: primero limpia sus propios datos anteriores.
-- ============================================================================

START TRANSACTION;

-- ── Dónde estoy conectado (verifica que sea hopper antes de seguir) ──
SELECT DATABASE() AS bd_actual;

-- ── Clubes base (no duplica los existentes) ──
INSERT IGNORE INTO clubes (nombre)
VALUES ('CTMPO'),('FSH'),('ACHTM'),('CPL'),('ATTA'),('TTTC'),('CTMV'),('CTMH');

-- ── Categorías ──
SET @primera = (SELECT id FROM categorias WHERE nombre = '1era');
SET @segunda = (SELECT id FROM categorias WHERE nombre = '2da');
SET @tercera = (SELECT id FROM categorias WHERE nombre = '3era');
SET @cuarta  = (SELECT id FROM categorias WHERE nombre = '4ta');

-- ============================================================================
-- LIMPIEZA de mocks anteriores (re-ejecutabilidad)
-- ============================================================================
-- Limpia tanto los de este script ('MOCK -%') como residuos de corridas
-- abortadas del script JS viejo ('Mock ·%')
DELETE FROM torneos WHERE nombre LIKE 'MOCK -%' OR nombre LIKE 'Mock %';

DELETE FROM jugadores
WHERE nombre IN (
    -- individuales (24)
    'Adalberto Montenegro','Berenice Solís','Camilo Zeballos','Dalia Escobar',
    'Efraín Bustamante','Fabiola Quintero','Gerardo Villalaz','Helena Mendieta',
    'Ismael Carvajal','Jacqueline Ordóñez','Kendall Palacios','Lucinda Ferrer',
    'Marlon Aguilera','Nidia Castrellón','Osvaldo Tejada','Priscila Barrios',
    'Quirino Saldaña','Rosaura Ibáñez','Salvador Pineda','Teodora Valdés',
    'Ulises Madrigal','Verónica Estrada','Wenceslao Ríos','Ximena Delgado',
    -- equipos (42)
    'Yolanda Peralta','Zacarías Fuentes','Aurelio Cisneros',
    'Blanca Ledesma','Casimiro Robles','Dulce Anaya',
    'Emiliano Zárate','Fernanda Ocampo','Gustavo Peña',
    'Hortensia Silva','Ignacio Bernal','Josefa Lara',
    'Kirby Andrade','Leandro Muñoz','Mireya Campos',
    'Norberto Gallegos','Ofelia Cedeño','Pancracio Rivas',
    'Ramona Iglesias','Sergio Tuñón','Tomasa Aguilar',
    'Urbano Zeledón','Valentina Ortiz','Wálter Morales',
    'Xenia Garay','Yamil Abud','Zenobia Castaño',
    'Alfonso Umaña','Berta Caballero','César Batista',
    'Dorinda Moreno','Ernesto Lasso','Fabián Sosa',
    'Griselda Navas','Humberto Arjona','Inés Villarreal',
    'Julián Espinosa','Karina Mora','Lisandro Duarte',
    'Marbelis Rangel','Néstor Quiel','Odalis Franco'
);

-- ============================================================================
-- 1) TORNEO INDIVIDUAL COMPLETO
-- ============================================================================

CREATE TEMPORARY TABLE tmp_jug_ind (
    orden INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100), elo FLOAT, club VARCHAR(100)
);

INSERT INTO tmp_jug_ind (nombre, elo, club) VALUES
('Adalberto Montenegro',1980,'CTMPO'),
('Berenice Solís',1965,'FSH'),
('Camilo Zeballos',1939,'ACHTM'),
('Dalia Escobar',1924,'CPL'),
('Efraín Bustamante',1898,'ATTA'),
('Fabiola Quintero',1872,'TTTC'),
('Gerardo Villalaz',1857,'CTMV'),
('Helena Mendieta',1831,'CTMH'),
('Ismael Carvajal',1805,'CTMPO'),
('Jacqueline Ordóñez',1790,'FSH'),
('Kendall Palacios',1764,'ACHTM'),
('Lucinda Ferrer',1738,'CPL'),
('Marlon Aguilera',1723,'ATTA'),
('Nidia Castrellón',1697,'TTTC'),
('Osvaldo Tejada',1682,'CTMV'),
('Priscila Barrios',1656,'CTMH'),
('Quirino Saldaña',1630,'CTMPO'),
('Rosaura Ibáñez',1615,'FSH'),
('Salvador Pineda',1589,'ACHTM'),
('Teodora Valdés',1563,'CPL'),
('Ulises Madrigal',1548,'ATTA'),
('Verónica Estrada',1522,'TTTC'),
('Wenceslao Ríos',1496,'CTMV'),
('Ximena Delgado',1481,'CTMH');

SET @max_j_ind = (SELECT COALESCE(MAX(id),0) FROM jugadores);

INSERT INTO jugadores (nombre, elo, club_id, categoria_id)
SELECT t.nombre, t.elo, c.id, @primera
FROM tmp_jug_ind t
JOIN clubes c ON c.nombre = t.club
ORDER BY t.orden;

INSERT INTO torneos (nombre, fecha, ubicacion, modalidad, abierto)
VALUES ('MOCK - Copa Individual de Prueba', CURDATE(), 'Gimnasio Mock', 'INDIVIDUAL', FALSE);
SET @tind = LAST_INSERT_ID();

INSERT INTO torneo_categorias (torneo_id, categoria_id) VALUES (@tind, @primera);

INSERT INTO torneo_participantes (torneo_id, jugador_id, categoria_id, seed)
SELECT @tind, j.id, @primera,
       ROW_NUMBER() OVER (ORDER BY j.elo DESC, j.id)
FROM jugadores j
WHERE j.id > @max_j_ind;

INSERT INTO torneo_grupos (torneo_id, categoria_id, numero_grupo) VALUES
(@tind,@primera,1),(@tind,@primera,2),(@tind,@primera,3),(@tind,@primera,4);

-- Serpentina: i = seed-1; ronda par → col i%4; ronda impar → col invertida
INSERT INTO torneo_grupo_participantes (grupo_id, torneo_participante_id, posicion)
WITH asign AS (
    SELECT tp.id AS tp_id,
           tp.seed,
           (CASE WHEN ((tp.seed - 1) DIV 4) % 2 = 0
                 THEN ((tp.seed - 1) % 4)
                 ELSE 3 - ((tp.seed - 1) % 4) END) + 1 AS grupo_num
    FROM torneo_participantes tp
    WHERE tp.torneo_id = @tind
)
SELECT g.id,
       a.tp_id,
       ROW_NUMBER() OVER (PARTITION BY a.grupo_num ORDER BY a.seed)
FROM asign a
JOIN torneo_grupos g
  ON g.torneo_id = @tind AND g.numero_grupo = a.grupo_num
ORDER BY a.grupo_num, a.seed;

-- Round-robin dentro de cada grupo (todos PENDIENTES)
-- updated_at va explícito: @updatedAt es cosa del cliente Prisma,
-- la columna no tiene default en MySQL.
INSERT INTO torneo_partidos_programados
    (torneo_id, categoria_id, grupo_id, participante_local_id, participante_visitante_id, orden, fase, estado, updated_at)
WITH parejas AS (
    SELECT gp1.grupo_id AS gid,
           gp1.torneo_participante_id AS loc,
           gp2.torneo_participante_id AS vis,
           gp1.posicion AS p1,
           gp2.posicion AS p2
    FROM torneo_grupo_participantes gp1
    JOIN torneo_grupo_participantes gp2
      ON gp2.grupo_id = gp1.grupo_id AND gp2.posicion > gp1.posicion
    JOIN torneo_grupos g ON g.id = gp1.grupo_id
    WHERE g.torneo_id = @tind
)
SELECT @tind, @primera, gid, loc, vis,
       ROW_NUMBER() OVER (PARTITION BY gid ORDER BY p1, p2),
       'GRUPOS', 'PENDIENTE', NOW()
FROM parejas;

-- ============================================================================
-- 2) ATTA TEAMS: solo inscripción de equipos mock
-- ============================================================================

SET @atta = (SELECT id FROM torneos WHERE modalidad = 'ATTA_TEAMS' ORDER BY id DESC LIMIT 1);

INSERT INTO torneos (nombre, fecha, ubicacion, modalidad, abierto)
SELECT 'MOCK - Torneo ATTA Teams', CURDATE(), 'Gimnasio Mock', 'ATTA_TEAMS', FALSE
FROM DUAL WHERE @atta IS NULL;

SET @atta = COALESCE(@atta, LAST_INSERT_ID());
INSERT IGNORE INTO torneo_categorias (torneo_id, categoria_id) VALUES (@atta, @primera);

-- Dejar el torneo limpio (solo quedará la inscripción nueva)
DELETE FROM torneo_partidos_programados WHERE torneo_id = @atta;
DELETE FROM torneo_grupos WHERE torneo_id = @atta;
DELETE tm FROM torneo_participante_miembros tm
JOIN torneo_participantes tp ON tp.id = tm.torneo_participante_id
WHERE tp.torneo_id = @atta;
DELETE FROM torneo_participantes WHERE torneo_id = @atta;

-- Series válidas según regla ATTA rotando patrones:
--   P0 [1era,2da,3era] · P1 [1era,4ta,3era] · P2 [2da,2da,3era]
--   P3 [2da,3era,4ta]  · P4 [1era,3era,4ta] · P5 [3era,3era,4ta]
--   P6 [2da,4ta,3era]
CREATE TEMPORARY TABLE tmp_equipos (
    equipo INT, miembro INT,
    nombre VARCHAR(100), elo FLOAT,
    club VARCHAR(100), serie VARCHAR(10)
);

INSERT INTO tmp_equipos VALUES
(1,1,'Yolanda Peralta',1900,'FSH','1era'),   (1,2,'Zacarías Fuentes',1695,'ACHTM','2da'), (1,3,'Aurelio Cisneros',1490,'CPL','3era'),
(2,1,'Blanca Ledesma',1897,'CPL','1era'),    (2,2,'Casimiro Robles',1292,'ATTA','4ta'),   (2,3,'Dulce Anaya',1487,'TTTC','3era'),
(3,1,'Emiliano Zárate',1694,'ATTA','2da'),   (3,2,'Fernanda Ocampo',1689,'TTTC','2da'),   (3,3,'Gustavo Peña',1484,'CTMV','3era'),
(4,1,'Hortensia Silva',1691,'TTTC','2da'),   (4,2,'Ignacio Bernal',1486,'CTMV','3era'),   (4,3,'Josefa Lara',1281,'CTMH','4ta'),
(5,1,'Kirby Andrade',1888,'CTMV','1era'),    (5,2,'Leandro Muñoz',1483,'CTMH','3era'),    (5,3,'Mireya Campos',1278,'CTMPO','4ta'),
(6,1,'Norberto Gallegos',1485,'CTMH','3era'),(6,2,'Ofelia Cedeño',1480,'CTMPO','3era'),   (6,3,'Pancracio Rivas',1275,'FSH','4ta'),
(7,1,'Ramona Iglesias',1682,'CTMH','2da'),   (7,2,'Sergio Tuñón',1277,'CTMPO','4ta'),     (7,3,'Tomasa Aguilar',1472,'FSH','3era'),
(8,1,'Urbano Zeledón',1879,'CTMPO','1era'),  (8,2,'Valentina Ortiz',1674,'FSH','2da'),    (8,3,'Wálter Morales',1469,'ACHTM','3era'),
(9,1,'Xenia Garay',1876,'FSH','1era'),       (9,2,'Yamil Abud',1271,'ACHTM','4ta'),       (9,3,'Zenobia Castaño',1466,'CPL','3era'),
(10,1,'Alfonso Umaña',1673,'ACHTM','2da'),   (10,2,'Berta Caballero',1668,'CPL','2da'),   (10,3,'César Batista',1463,'ATTA','3era'),
(11,1,'Dorinda Moreno',1867,'CPL','1era'),   (11,2,'Ernesto Lasso',1462,'ATTA','3era'),   (11,3,'Fabián Sosa',1297,'TTTC','4ta'),
(12,1,'Griselda Navas',1864,'ATTA','1era'),  (12,2,'Humberto Arjona',1299,'TTTC','4ta'),  (12,3,'Inés Villarreal',1494,'CTMV','3era'),
(13,1,'Julián Espinosa',1661,'CTMV','2da'),  (13,2,'Karina Mora',1696,'CTMH','2da'),      (13,3,'Lisandro Duarte',1491,'CTMPO','3era'),
(14,1,'Marbelis Rangel',1670,'TTTC','2da'),  (14,2,'Néstor Quiel',1465,'CTMV','3era'),    (14,3,'Odalis Franco',1300,'CTMH','4ta');

SET @max_j_atta = (SELECT COALESCE(MAX(id),0) FROM jugadores);

INSERT INTO jugadores (nombre, elo, club_id, categoria_id)
SELECT t.nombre, t.elo, c.id,
       CASE t.serie
           WHEN '1era' THEN @primera
           WHEN '2da'  THEN @segunda
           WHEN '3era' THEN @tercera
           ELSE @cuarta
       END
FROM tmp_equipos t
JOIN clubes c ON c.nombre = t.club
ORDER BY t.equipo, t.miembro;

CREATE TEMPORARY TABLE tmp_map (INDEX(equipo)) AS
SELECT t.equipo, t.miembro, j.id AS jugador_id
FROM tmp_equipos t
JOIN jugadores j ON j.nombre = t.nombre AND j.id > @max_j_atta;

-- Participante = equipo; representante (jugador_id) = miembro 1;
-- categoría del participante = ancla "primera"
INSERT INTO torneo_participantes (torneo_id, jugador_id, categoria_id)
SELECT @atta, m.jugador_id, @primera
FROM tmp_map m
WHERE m.miembro = 1
ORDER BY m.equipo;

-- Los 3 miembros de cada equipo.
-- (MySQL no deja referenciar una temporal dos veces en la misma
-- consulta, así que primero materializo el mapa equipo→participante.)
CREATE TEMPORARY TABLE tmp_rep (INDEX(equipo)) AS
SELECT m.equipo, tp.id AS tp_id
FROM tmp_map m
JOIN torneo_participantes tp
  ON tp.torneo_id = @atta AND tp.jugador_id = m.jugador_id
WHERE m.miembro = 1;

INSERT INTO torneo_participante_miembros (torneo_participante_id, jugador_id, orden)
SELECT r.tp_id, m.jugador_id, m.miembro
FROM tmp_map m
JOIN tmp_rep r ON r.equipo = m.equipo;

-- ============================================================================
-- CHECKS (deberían salir: grupos=4 · partidos=60 · equipos=14 · miembros=42)
-- ============================================================================
SELECT 'Grupos individuales' AS checkeo, COUNT(*) AS valor FROM torneo_grupos WHERE torneo_id = @tind
UNION ALL
SELECT 'Partidos de grupos', COUNT(*) FROM torneo_partidos_programados WHERE torneo_id = @tind
UNION ALL
SELECT 'Equipos inscriptos ATTA', COUNT(*) FROM torneo_participantes WHERE torneo_id = @atta
UNION ALL
SELECT 'Miembros ATTA', COUNT(*) FROM torneo_participante_miembros tm
JOIN torneo_participantes tp ON tp.id = tm.torneo_participante_id
WHERE tp.torneo_id = @atta;

COMMIT;
