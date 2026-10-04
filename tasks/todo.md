# Tarea: convertir el parche "1 llave → 2 llaves" en feature y restaurar lo anterior

## Hallazgos
- Lo único en el repo que divide una llave en varias es `nivel_llave`: con nivel n, la llave toma solo
  al n-ésimo de cada grupo (`src/app/api/torneos/[id]/llaves/route.ts:168-181, 248`).
- Está atado a la modalidad `ATTA_TEAMS` (18+ archivos usan `esAttaTeams`), con niveles fijos `[1,2,3]`
  y `clasificanPorGrupo: esAttaTeams ? 3 : 2` en `LlavesTorneoModal.tsx`.
- Commits del 22-ago: `b2b5f26` (migración `nivel_llave`), `1a88d5f` (API), `eb4f035` (UI). Están mezclados
  con otras cosas, y hay commits posteriores encima, así que un `git revert` va a dar conflictos.
- `e9f2ba0`: script `scripts/fix-torneo-modalidad.sql` para un torneo de prod creado como `ATTA_TEAMS` que
  en realidad era `EQUIPOS`. El `UPDATE` está comentado. No se sabe si se ejecutó ni qué id es.

## Plan propuesto (pendiente de aprobación)
- [x] Identificado (según el usuario, vía subagente): torneo EQUIPOS creado como ATTA_TEAMS para tener llaves
      separadas; de las 3 llaves solo se usaron 2 (1ros → llave 1, 2dos → llave 2)
- [ ] Confirmar: ATTA Teams se queda como modalidad propia (solo se separa la feature de llaves)
- [ ] Consultar prod (solo lectura): torneo afectado, su `modalidad` y sus llaves por `nivel_llave`
- [ ] Rama `feature/llaves-por-posicion`: opción por torneo "llaves separadas por posición" (2 o 3 llaves),
      para cualquier modalidad, sin depender de `ATTA_TEAMS`. ATTA Teams la usa con 3.
      Se mantiene la columna `nivel_llave` (NULL = una sola llave, como antes).
- [ ] "Restaurar lo anterior": dejar el torneo afectado como estaba (modalidad original y una sola llave)
      vía script SQL revisado, sin reescribir el historial de `main`
- [ ] Verificar: `npm run build`, comparar comportamiento entre `main` y la feature
      (torneo normal = 1 llave; torneo con opción = N llaves)
- [ ] Commit `CLAUDE.md` + `tasks/` en `main`; push de la feature y PR (sin merge directo)

## Review
_(se completa al terminar)_
