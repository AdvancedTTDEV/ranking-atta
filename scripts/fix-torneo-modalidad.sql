-- ============================================================================
-- fix-torneo-modalidad.sql
-- ============================================================================
-- Corrige la modalidad de un torneo que fue etiquetado como ATTA_TEAMS cuando
-- en realidad es un torneo por equipos normal (EQUIPOS).
--
-- USO: pegar este archivo en el cliente MySQL conectado a PRODUCCIÓN
-- (caboose.proxy.rlwy.net:20299, BD railway), o correrlo desde la terminal:
--   mysql -h caboose.proxy.rlwy.net -P 20299 -u root -p railway < fix-torneo-modalidad.sql
--
-- ⚠ ANTES DE EJECUTAR:
-- 1. Identifica el torneo afectado. Mira los que están como ATTA_TEAMS:
--      SELECT id, nombre, modalidad FROM torneos WHERE modalidad = 'ATTA_TEAMS';
-- 2. Confirma con el operador del club que ese torneo debe ser EQUIPOS.
-- 3. Si tiene llaves de nivel_llave (1=Primera, 2=Segunda, 3=Tercera) que ya
--    están en uso, considera primero si es correcto migrar. Para un torneo
--    que NUNCA fue ATTA_TEAMS sólo necesitas el UPDATE de modalidad.
-- 4. HAZ BACKUP antes (ver más abajo).
-- 5. Corre primero las SELECTs para verificar el impacto, luego el UPDATE.
--
-- ⚠ BACKUP (RECOMENDADO):
--   mysqldump --single-transaction --routines --triggers \
--     -h caboose.proxy.rlwy.net -P 20299 -u root -p railway \
--     > backup_antes_fix_torneo_$(date +%Y%m%d_%H%M%S).sql
--   O usa el workflow de GitHub Actions: Actions → Backup BD → Run workflow.
--
-- ⚠ NO HACE FALTA migración Prisma porque el enum `torneo_modalidad` ya
-- incluye el valor EQUIPOS desde la migración 20260711170000.
-- ============================================================================

-- 1) Ver qué torneos están marcados como ATTA_TEAMS:
SELECT id, nombre, modalidad, abierto, creado_en
FROM torneos
WHERE modalidad = 'ATTA_TEAMS';

-- 2) Si tiene llaves con nivel_llave (informativo, no se tocan):
SELECT id, torneo_id, nivel_llave, ronda_eliminacion, COUNT(*) AS llaves
FROM torneo_partidos_programados
WHERE torneo_id IN (SELECT id FROM torneos WHERE modalidad = 'ATTA_TEAMS')
GROUP BY id, torneo_id, nivel_llave, ronda_eliminacion;

-- 3) UPDATE — sólo aplicar al ID confirmado. Reemplaza ? por el id real:
-- UPDATE torneos
-- SET modalidad = 'EQUIPOS'
-- WHERE id = ? AND modalidad = 'ATTA_TEAMS';

-- 4) Verificar:
-- SELECT id, nombre, modalidad FROM torneos WHERE id = ?;
