-- Marca de torneo abierto: cualquier jugador puede inscribirse sin importar
-- su categoría. El backend asigna todas las categorías al crearlo y el
-- frontend muestra el selector de jugadores sin filtro de categoría.
ALTER TABLE `torneos`
  ADD COLUMN `abierto` TINYINT(1) NOT NULL DEFAULT 0;
