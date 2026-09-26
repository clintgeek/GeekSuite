#!/usr/bin/env bash
# ==============================================================================
# GeekSuite restore — put a chosen backup set back, into scratch or live.
# ==============================================================================
# Usage:
#   restore.sh --list
#   restore.sh --set STAMP|latest --verify
#       Full drill of that set (decrypt + restore into throwaway containers +
#       counts vs MANIFEST). Touches nothing live. Same as verify-latest.sh.
#   restore.sh --set S --component mongo|postgres|influx --target scratch
#       Restore into a NEW throwaway container (--network none) and LEAVE IT
#       RUNNING so you can inspect it with `docker exec -it <name> mongosh|psql|influx`.
#       Remove it with `docker rm -f <name>` when done — or leave it: the next
#       backup/verify run sweeps drill-labelled containers older than 2 hours,
#       so a forgotten scratch copy of the data does not linger.
#   restore.sh --set S --component mongo --target live [--db NAME] [--with-users] [--dry-run] [--yes]
#       mongorestore --drop into datageek_mongodb: every database except admin
#       (users/roles), or only database NAME. OVERWRITES those databases.
#       --with-users also replays admin users/roles (only for a rebuilt, empty
#       Mongo). Without --yes it only prints the plan (same as --dry-run).
#   restore.sh --set S --component postgres --target live [--dry-run] [--yes]
#       Replays the pg_dumpall into datageek_postgres (DROPs and re-creates every
#       database in it). Stop anything connected first or DROP DATABASE fails.
#   restore.sh --set S --component influx --target live [--dry-run] [--yes]
#       Restores each database as <db>_restored_<stamp> alongside the live one —
#       never over it. Swap by hand once you've checked it (see the doc).
#   restore.sh --set S --component env --out DIR
#       Decrypts the .env.production files into DIR (mode 700, must not exist).
#       Never writes over live env files; copy them into place yourself.
#   restore.sh --component library [--dry-run|--yes]
#       rsync the BookGeek library mirror back to /mnt/extra_space/books
#       (no --delete; files missing from the source come back, nothing is removed).
#
# Nothing here runs without --yes except --list, --verify, --target scratch,
# and --component env (which only writes into a new directory you name).
# ==============================================================================
set -euo pipefail
umask 077

# shellcheck source=lib.sh
. "$(dirname "$(realpath "$0")")/lib.sh"
GS_HC_URL=""   # restores never ping the dead-man's switch

SET=""; COMPONENT=""; TARGET=""; DB=""; OUT=""; YES=0; DRY=0; VERIFY=0; LIST=0; WITH_USERS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --list) LIST=1 ;;
    --set) SET="$2"; shift ;;
    --component) COMPONENT="$2"; shift ;;
    --target) TARGET="$2"; shift ;;
    --db) DB="$2"; shift ;;
    --out) OUT="$2"; shift ;;
    --yes) YES=1 ;;
    --with-users) WITH_USERS=1 ;;
    --dry-run) DRY=1 ;;
    --verify) VERIFY=1 ;;
    -h|--help) sed -n '2,42p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
[ "${DRY}" = 1 ] && YES=0

mkdir -p "${LOG_DIR}" "${WORK_ROOT}"
GS_LOG_FILE="${LOG_DIR}/restore.log"

if [ "${LIST}" = 1 ]; then
  for s in $(list_sets); do
    python3 - "${SETS_DIR}/$s/MANIFEST.json" "$s" <<'PY'
import json, sys
try: m = json.load(open(sys.argv[1]))
except Exception: print(f"{sys.argv[2]}  (no readable MANIFEST)"); sys.exit()
b = sum(f["bytes"] for f in m["files"].values())
print(f'{m["stamp"]}  mongo {m["mongo"]["documents"]} docs/{m["mongo"]["collections"]} colls  '
      f'postgres {m["postgres"]["rows"]} rows/{m["postgres"]["tables"]} tables  '
      f'influx {",".join(m["influx"]["restored"]) or "-"}  {b/1048576:.1f} MiB')
PY
  done
  exit 0
fi

require_tools
if [ "${COMPONENT}" != "library" ]; then
  require_key
  [ -n "${SET}" ] || { echo "--set STAMP|latest is required" >&2; exit 2; }
  [ "${SET}" = latest ] && SET="$(latest_set)"
  DIR="${SETS_DIR}/${SET}"
  [ -f "${DIR}/MANIFEST.json" ] || { echo "no such set: ${SET} (try --list)" >&2; exit 2; }
fi

if [ "${VERIFY}" = 1 ]; then
  exec "$(dirname "$(realpath "$0")")/verify-latest.sh" --set "${SET}" --no-duplicati
fi

trap gs_cleanup EXIT
confirm_or_plan() {
  log "PLAN: $*"
  if [ "${YES}" != 1 ]; then
    log "dry run — nothing changed. Re-run with --yes to do it."
    exit 0
  fi
}

case "${COMPONENT}:${TARGET}" in
  # ---------------------------------------------------------------- scratch
  mongo:scratch)
    c="$(scratch_mongo)" || { log "scratch mongo failed to start"; exit 1; }
    decrypt_stream "${DIR}/mongo.archive.gz.age" \
      | docker exec -i "$c" mongorestore --archive --gzip --drop --quiet 2> >(redact | tail -n 5 >&2)
    docker rename "$c" "${c/drill/keep}" && c="${c/drill/keep}"
    log "restored ${SET} into scratch container ${c} (--network none). Inspect: docker exec -it ${c} mongosh   Remove: docker rm -f ${c}"
    GS_RUN_ID="none"   # so the EXIT trap leaves it running
    ;;
  postgres:scratch)
    c="$(scratch_pg)" || { log "scratch postgres failed to start"; exit 1; }
    decrypt_stream "${DIR}/postgres.sql.gz.age" | gunzip \
      | docker exec -i "$c" psql -U postgres -d postgres -q -o /dev/null 2>&1 | grep '^ERROR' | head -n 5 || true
    docker rename "$c" "${c/drill/keep}" && c="${c/drill/keep}"
    log "restored ${SET} into scratch container ${c}. Inspect: docker exec -it ${c} psql -U postgres   Remove: docker rm -f ${c}"
    GS_RUN_ID="none"
    ;;
  influx:scratch)
    c="$(scratch_influx)" || { log "scratch influx failed to start"; exit 1; }
    decrypt_stream "${DIR}/influx.tar.gz.age" | docker exec -i "$c" sh -c 'mkdir -p /tmp/r && tar xzf - -C /tmp/r'
    for db in $(python3 -c 'import json,sys; print(" ".join(k for k in json.load(open(sys.argv[1]))["influx"]["shards_per_db"] if k!="_internal"))' "${DIR}/MANIFEST.json"); do
      docker exec "$c" influxd restore -portable -db "$db" -host 127.0.0.1:8088 /tmp/r >/dev/null
    done
    docker rename "$c" "${c/drill/keep}" && c="${c/drill/keep}"
    log "restored ${SET} into scratch container ${c}. Inspect: docker exec -it ${c} influx   Remove: docker rm -f ${c}"
    GS_RUN_ID="none"
    ;;

  # ---------------------------------------------------------------- live
  mongo:live)
    container_running "${MONGO_CONTAINER}" || { log "${MONGO_CONTAINER} is not running"; exit 1; }
    # Default excludes admin.* (users/roles): replaying system.users with --drop
    # swaps the account the restore itself is authenticated as, mid-restore —
    # index builds then fail "requires authentication" (seen in the 2026-09-25
    # stand-in test). Only pass --with-users when the live users are gone.
    if [ -n "${DB}" ]; then NS_ARGS=(--nsInclude "${DB}.*")
    elif [ "${WITH_USERS}" = 1 ]; then NS_ARGS=()
    else NS_ARGS=(--nsExclude "admin.*"); fi
    decrypt_stream "${DIR}/mongo.archive.gz.age" | gzip -t || { log "archive does not decrypt cleanly"; exit 1; }
    confirm_or_plan "mongorestore --drop set ${SET} into LIVE ${MONGO_CONTAINER}: ${DB:-ALL databases in the archive$([ "${WITH_USERS}" = 1 ] && echo ' INCLUDING admin users/roles' || echo ' except admin (users/roles)')} will be REPLACED with the ${SET} contents"
    # Sidecar sharing Mongo's network namespace: the archive arrives on stdin and
    # the credential config through a forwarded env var (-e NAME, no value on argv),
    # written to the sidecar's own /tmp — the live container's filesystem is untouched.
    GS_MONGO_CFG="$(mongo_config_yaml)"; export GS_MONGO_CFG
    decrypt_stream "${DIR}/mongo.archive.gz.age" \
      | docker run --rm -i --network "container:${MONGO_CONTAINER}" -e GS_MONGO_CFG \
          --label "geeksuite.backup.run=${GS_RUN_ID}" "$(image_of "${MONGO_CONTAINER}")" \
          sh -c 'umask 077; printf "%s\n" "$GS_MONGO_CFG" > /tmp/c.yaml; unset GS_MONGO_CFG; exec mongorestore --config=/tmp/c.yaml --archive --gzip --drop "$@"' \
          sh "${NS_ARGS[@]}" 2> >(redact | tail -n 15 >&2)
    unset GS_MONGO_CFG
    log "mongo live restore of ${SET} (${DB:-all}) finished — restart the apps that cache state if needed"
    ;;
  postgres:live)
    container_running "${PG_CONTAINER}" || { log "${PG_CONTAINER} is not running"; exit 1; }
    decrypt_stream "${DIR}/postgres.sql.gz.age" | gzip -t || { log "dump does not decrypt cleanly"; exit 1; }
    confirm_or_plan "replay pg_dumpall ${SET} into LIVE ${PG_CONTAINER}: every database in the dump is DROPPED and re-created"
    decrypt_stream "${DIR}/postgres.sql.gz.age" | gunzip \
      | docker exec -i "${PG_CONTAINER}" sh -c 'exec psql -U "$POSTGRES_USER" -d postgres -q -o /dev/null' 2>&1 \
      | grep -E '^(ERROR|FATAL)' | head -n 20 || true
    log "postgres live restore of ${SET} finished (ERROR lines above, if any; role 'already exists' noise is harmless)"
    ;;
  influx:live)
    container_running "${INFLUX_CONTAINER}" || { log "${INFLUX_CONTAINER} is not running"; exit 1; }
    SUFFIX="_restored_${SET}"
    DBS="$(python3 -c 'import json,sys; print(" ".join(k for k in json.load(open(sys.argv[1]))["influx"]["shards_per_db"] if k!="_internal"))' "${DIR}/MANIFEST.json")"
    confirm_or_plan "restore influx set ${SET} into LIVE ${INFLUX_CONTAINER} as NEW databases: $(for d in $DBS; do printf '%s%s ' "$d" "$SUFFIX"; done)(live databases untouched)"
    W="$(mktemp -d "${WORK_ROOT}/influx-restore.XXXXXX")"; GS_CLEAN_PATHS+=("$W")
    decrypt_stream "${DIR}/influx.tar.gz.age" | tar xzf - -C "$W"
    for db in $DBS; do
      docker run --rm --network "container:${INFLUX_CONTAINER}" --user "$(id -u):$(id -g)" -v "$W:/backup:ro" \
        "$(image_of "${INFLUX_CONTAINER}")" influxd restore -portable -db "$db" -newdb "${db}${SUFFIX}" -host 127.0.0.1:8088 /backup
    done
    log "influx: restored as ${DBS// /${SUFFIX} }${SUFFIX} — see DOCS/BACKUP_AND_RESTORE.md for the SELECT INTO swap"
    ;;

  # ---------------------------------------------------------------- env + library
  env:*)
    [ -n "${OUT}" ] || { echo "--out DIR is required for env (a new directory; never the repo)" >&2; exit 2; }
    [ -e "${OUT}" ] && { echo "${OUT} already exists — refusing to write into it" >&2; exit 2; }
    mkdir -p "${OUT}"; chmod 700 "${OUT}"
    decrypt_stream "${DIR}/env.tar.gz.age" | tar xzf - -C "${OUT}"
    log "env files of ${SET} decrypted into ${OUT} ($(find "${OUT}" -type f | wc -l) files, mode 700). Copy into place by hand; delete ${OUT} after."
    ;;
  library:*)
    [ -d "${LIBRARY_MIRROR}" ] || { log "no mirror at ${LIBRARY_MIRROR}"; exit 1; }
    log "rsync preview (${LIBRARY_MIRROR} → ${LIBRARY_SRC}, no --delete):"
    rsync -rlt --dry-run --itemize-changes "${LIBRARY_MIRROR}/" "${LIBRARY_SRC}/" | head -n 40
    confirm_or_plan "copy the mirror back into ${LIBRARY_SRC} (adds/overwrites, deletes nothing)"
    rsync -rlt "${LIBRARY_MIRROR}/" "${LIBRARY_SRC}/"
    log "library restored from mirror"
    ;;
  *)
    echo "need --list, --verify, or --component mongo|postgres|influx|env|library [--target scratch|live]" >&2
    exit 2 ;;
esac
