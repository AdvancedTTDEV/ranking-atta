-- Sincronización con el schema de desarrollo (2026-07-29).
-- Esta migración cubre los cambios que las migraciones previas NO
-- incluían pero que el schema.prisma sí declara:
--
-- 1. `torneos.modalidad`: necesario para los flujos INDIVIDUAL / DOBLES /
--    EQUIPOS que ya están implementados en el backend.
-- 2. Valor `Campeón` en `partidos.ronda` (capitalización de cierre del
--    bracket, usado en la UI de llaves y en el modal de resultados del
--    partido final).
-- 3. Valor `campeón` en `participaciones.ronda_alcanzada` (paridad con
--    el anterior; ambos enums se modifican juntos para mantener el
--    shadow de Prisma estable).
--
-- Los MODIFY son puramente aditivos: solo AÑADEN valores al final del
-- enum, no reordenan ni eliminan los existentes. Esto preserva los
-- datos actuales de prod (que no tenían `Campeón` / `modalidad`).
ALTER TABLE `torneos`
  ADD COLUMN `modalidad` ENUM('INDIVIDUAL', 'DOBLES', 'EQUIPOS') NOT NULL DEFAULT 'INDIVIDUAL';

ALTER TABLE `partidos`
  MODIFY COLUMN `ronda` ENUM('Grupos', '32avos', '16avos', 'Octavos', 'Cuartos', 'Semifinal', 'Final', 'Campeón') NULL;

ALTER TABLE `participaciones`
  MODIFY COLUMN `ronda_alcanzada` ENUM('grupos', '32avos', '16avos', 'octavos', 'cuartos', 'semifinal', 'final', 'campeón') NULL;
