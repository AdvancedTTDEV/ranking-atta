#!/usr/bin/env bash
# Backup de una base MySQL de Railway a backups/<etiqueta>-<fecha>.sql.gz
#
# Uso:
#   ./scripts/backup-db.sh              # usa DATABASE_URL de .env (hopper / dev)
#   ./scripts/backup-db.sh prod         # usa la URL de PROD hardcodeada abajo
#   ./scripts/backup-db.sh <url> [tag]  # URL arbitraria
#
# Requiere mysqldump (brew install mysql-client).

set -euo pipefail

cd "$(dirname "$0")/.."

# Producción (caboose): crear .env.prod (ignorado por git) con la línea
#   DATABASE_URL=mysql://root:<pass>@caboose.proxy.rlwy.net:<port>/railway
# La contraseña real NUNCA va en este archivo ni en el repo.
if [[ -f .env.prod ]]; then
    PROD_URL="$(grep -E '^DATABASE_URL=' .env.prod | cut -d= -f2-)"
else
    PROD_URL=""
fi

MODE="${1:-dev}"

case "$MODE" in
    prod)
        if [[ -z "$PROD_URL" ]]; then
            echo "❌ Falta .env.prod con DATABASE_URL de producción (ver cabecera del script)." >&2
            exit 1
        fi
        URL="$PROD_URL"
        TAG="prod"
        ;;
    http*|mysql*)
        URL="$MODE"
        TAG="${2:-custom}"
        ;;
    *)
        # dev por defecto: leer .env
        URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)"
        TAG="dev"
        ;;
esac

HOST="$(echo "$URL" | sed -E 's|.*@([^:/]+).*|\1|')"
PORT="$(echo "$URL" | sed -nE 's|.*:([0-9]+)/.*|\1|p')"
DB="$(echo "$URL" | sed -E 's|.*/([^/?]+).*|\1|')"
USER="$(echo "$URL" | sed -E 's|.*://([^:]+):.*|\1|')"
PASS="$(echo "$URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')"

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/${TAG}-${STAMP}.sql.gz"

echo "→ Volcando ${DB} @ ${HOST}:${PORT} → ${OUT}"
mysqldump \
    -h "$HOST" -P "$PORT" -u "$USER" -p"$PASS" \
    --single-transaction --quick --routines --triggers --set-gtid-purged=OFF \
    "$DB" | gzip > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "✅ Listo (${SIZE}). Sugerencia: guardar una copia fuera de esta máquina."
