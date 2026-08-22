-- ============================================================
-- FIX DE COLLATION PARA revertir_partido
-- Fecha: 2026-08-16
-- Problema: MySQL 1267 - Illegal mix of collations
--           (utf8mb4_0900_ai_ci,IMPLICIT) and (utf8mb4_unicode_ci,IMPLICIT)
-- Causa: Las variables VARCHAR(20) dentro del SP (v_ronda) heredan la
--        collation de la sesión, mientras que las columnas ENUM
--        (ronda_alcanzada, ronda) usan utf8mb4_0900_ai_ci.
-- Solución: Forzar collation_connection al inicio + COLLATE explícito
--           en cada comparación vulnerable.
-- ============================================================
-- IMPORTANTE: Este script DROPea y CREa el SP. No toca tablas ni datos.
-- Aplicar UNA VEZ con mysql cliente (soporta DELIMITER) o desde Railway UI
-- quitando las líneas DELIMITER y ajustando el END final.
-- ============================================================

DROP PROCEDURE IF EXISTS revertir_partido;

DELIMITER $$

CREATE PROCEDURE revertir_partido(IN p_partido_id INT)
BEGIN
    DECLARE v_jugador1 INT;
    DECLARE v_jugador2 INT;
    DECLARE v_ganador  INT;
    DECLARE v_perdedor INT;
    DECLARE v_torneo   INT;
    DECLARE v_ronda    VARCHAR(20);
    DECLARE v_tipo_especial VARCHAR(10);

    DECLARE v_elo_ganador_antes FLOAT;
    DECLARE v_elo_perdedor_antes FLOAT;

    DECLARE v_bono_ganador FLOAT;
    DECLARE v_bono_perdedor FLOAT;

    DECLARE v_pts_ganador FLOAT;
    DECLARE v_pts_perdedor FLOAT;

    DECLARE v_cat_ganador INT;
    DECLARE v_cat_perdedor INT;

    DECLARE v_participacion_id_ganador INT;
    DECLARE v_participacion_id_perdedor INT;

    /* variables para diagnóstico */
    DECLARE v_sqlstate CHAR(5);
    DECLARE v_errno INT;
    DECLARE v_text TEXT;

    /* handler que devuelve el error real de MySQL */
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            GET DIAGNOSTICS CONDITION 1
                v_sqlstate = RETURNED_SQLSTATE,
                v_errno    = MYSQL_ERRNO,
                v_text     = MESSAGE_TEXT;

            ROLLBACK;

            SET @proc_error_msg = CONCAT('MySQL ', v_errno, ' (', v_sqlstate, '): ', v_text);
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @proc_error_msg;
        END;

    /* Forzamos la collation de la sesión ANTES de cualquier lógica */
    SET collation_connection = 'utf8mb4_0900_ai_ci';

    START TRANSACTION;

    /* 1. CARGAR EL PARTIDO ORIGINAL */
    SELECT jugador1_id, jugador2_id, ganador_id, torneo_id, ronda, tipo_especial
    INTO v_jugador1, v_jugador2, v_ganador, v_torneo, v_ronda, v_tipo_especial
    FROM partidos
    WHERE id = p_partido_id
    LIMIT 1;

    IF v_ganador IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'No se puede revertir: partido no existe o no tiene ganador.';
    END IF;

    SET v_perdedor = IF(v_ganador = v_jugador1, v_jugador2, v_jugador1);

    /* 2. CARGAR PARTICIPACIONES CREADAS (COLLATE explícito anti-1267) */
    SELECT id, elo_antes, bonificacion, categoria_id
    INTO v_participacion_id_ganador, v_elo_ganador_antes, v_bono_ganador, v_cat_ganador
    FROM participaciones
    WHERE jugador_id = v_ganador
      AND torneo_id = v_torneo
      AND ronda_alcanzada COLLATE utf8mb4_0900_ai_ci
          = v_ronda COLLATE utf8mb4_0900_ai_ci
    ORDER BY id DESC
    LIMIT 1;

    IF v_perdedor IS NOT NULL THEN
        SELECT id, elo_antes, bonificacion, categoria_id
        INTO v_participacion_id_perdedor, v_elo_perdedor_antes, v_bono_perdedor, v_cat_perdedor
        FROM participaciones
        WHERE jugador_id = v_perdedor
          AND torneo_id = v_torneo
          AND (
            ronda_alcanzada COLLATE utf8mb4_0900_ai_ci
                = v_ronda COLLATE utf8mb4_0900_ai_ci
            OR (
                LOWER(v_ronda COLLATE utf8mb4_0900_ai_ci)
                    = 'campeon' COLLATE utf8mb4_0900_ai_ci
                AND ronda_alcanzada COLLATE utf8mb4_0900_ai_ci
                    = 'Final' COLLATE utf8mb4_0900_ai_ci
            )
          )
        ORDER BY id DESC
        LIMIT 1;
    ELSE
        SET v_participacion_id_perdedor = NULL;
        SET v_elo_perdedor_antes = NULL;
        SET v_bono_perdedor = NULL;
        SET v_cat_perdedor = NULL;
    END IF;

    /* 3. REVERSAR ELO */
    IF v_elo_ganador_antes IS NOT NULL THEN
        UPDATE jugadores
        SET elo = v_elo_ganador_antes
        WHERE id = v_ganador;
    END IF;

    IF v_perdedor IS NOT NULL AND v_elo_perdedor_antes IS NOT NULL THEN
        UPDATE jugadores
        SET elo = v_elo_perdedor_antes
        WHERE id = v_perdedor;
    END IF;

    /* 4. BORRAR PARTICIPACIONES */
    IF v_participacion_id_ganador IS NOT NULL THEN
        DELETE FROM participaciones WHERE id = v_participacion_id_ganador;
    END IF;

    IF v_perdedor IS NOT NULL AND v_participacion_id_perdedor IS NOT NULL THEN
        DELETE FROM participaciones WHERE id = v_participacion_id_perdedor;
    END IF;

    /* 5. ELIMINAR EL PARTIDO */
    DELETE FROM partidos WHERE id = p_partido_id;

    COMMIT;
END$$

DELIMITER ;

-- ============================================================
-- PARA APLICAR:
-- ============================================================
-- 1. Backup del SP actual:
--    mysql ... -e "SHOW CREATE PROCEDURE revertir_partido\G" > backup.sql
--
-- 2. Aplicar el fix (cliente mysql soporta DELIMITER):
--    mysql ... < fix_revertir_partido.sql
--
-- 3. Si lo pegás en Railway UI (no soporta DELIMITER):
--    - Borrá las líneas "DELIMITER $$" y "DELIMITER ;"
--    - Cambiá el "END$$" final por "END;"
--    - Ejecutá
--
-- 4. Verificar:
--    mysql ... -e "SHOW CREATE PROCEDURE revertir_partido\G"
-- ============================================================
