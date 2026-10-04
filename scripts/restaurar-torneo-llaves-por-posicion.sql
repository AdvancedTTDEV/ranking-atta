-- ============================================================================
-- restaurar-torneo-llaves-por-posicion.sql
-- ============================================================================
-- Restaura un torneo por equipos normal que se creó como ATTA_TEAMS solo para
-- poder separar sus llaves por posición de grupo (1ros a una llave, 2dos a
-- otra). Con la feature `llaves_por_posicion` ya no hace falta ese parche:
-- el torneo vuelve a EQUIPOS y conserva sus llaves separadas.
--
-- Las llaves existentes NO se tocan: sus filas ya tienen `nivel_llave` 1 y 2,
-- que es exactamente lo que lee la feature con `llaves_por_posicion = 2`.
--
-- REQUISITO: aplicar antes la migración 20261004120000_llaves_por_posicion
--   (ALTER TABLE torneos ADD COLUMN llaves_por_posicion INTEGER NULL).
--
-- ⚠ ANTES DE EJECUTAR:
-- 1. HAZ BACKUP (scripts/backup-db.sh o el workflow "Backup BD").
-- 2. Corre las SELECTs, identifica el id del torneo y confírmalo.
-- 3. Si el paso 2 muestra filas con nivel_llave = 3 en ese torneo, la
--    llave 3 no se usó: con `llaves_por_posicion = 2` queda oculta. Si
--    tiene resultados cargados, NO sigas y revísalo antes.
-- ============================================================================

-- 1) Torneos marcados como ATTA_TEAMS:
SELECT id, nombre, fecha, modalidad, llaves_por_posicion
FROM torneos
WHERE modalidad = 'ATTA_TEAMS';

-- 2) Llaves por nivel de cada uno (cuántos partidos y cuántos finalizados):
SELECT torneo_id, nivel_llave,
       COUNT(*) AS partidos,
       SUM(estado = 'FINALIZADO') AS finalizados
FROM torneo_partidos_programados
WHERE fase = 'ELIMINACION'
  AND torneo_id IN (SELECT id FROM torneos WHERE modalidad = 'ATTA_TEAMS')
GROUP BY torneo_id, nivel_llave
ORDER BY torneo_id, nivel_llave;

-- 3) UPDATE — reemplaza ? por el id confirmado:
-- UPDATE torneos
-- SET modalidad = 'EQUIPOS', llaves_por_posicion = 2
-- WHERE id = ? AND modalidad = 'ATTA_TEAMS';

-- 4) Verificar:
-- SELECT id, nombre, modalidad, llaves_por_posicion FROM torneos WHERE id = ?;
