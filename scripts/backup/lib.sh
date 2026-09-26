# shellcheck shell=bash
# ==============================================================================
# GeekSuite backup — shared library. Sourced by backup.sh, verify-latest.sh,
# restore.sh. Not executable on its own.
#
# Secrets discipline (read this before editing):
#   - No `set -x`, ever. Credentials live only in shell variables and in the
#     stdin of `docker exec -i`; they never reach argv (visible in `ps`), a log
#     line, or a file outside the mode-700 work dir.
#   - Log lines name things (databases, files, variables), never values.
#   - The age PRIVATE key is only ever passed to `age -d -i <path>`; nothing
#     reads, prints or copies its contents.
# ==============================================================================

GS_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------- configuration
# Optional overrides (HEALTHCHECK_URL, ALERT_WEBHOOK, paths). Values are Chef's;
# this file only ever *sources* it.
GS_CONFIG_FILE="${GS_CONFIG_FILE:-${HOME}/.config/geeksuite/backup.env}"
if [ -r "${GS_CONFIG_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${GS_CONFIG_FILE}"
  set +a
fi

GEEKSUITE_ROOT="${GEEKSUITE_ROOT:-$(cd "${GS_LIB_DIR}/../.." && pwd)}"
# Sibling of the repo, outside git, inside /mnt/Media/Projects — so Duplicati's
# Int/Ext/Network jobs (source /projects/) carry it off this disk with no
# Duplicati change. See DOCS/BACKUP_AND_RESTORE.md.
BACKUP_ROOT="${BACKUP_ROOT:-/mnt/Media/Projects/GeekSuite-backups}"
SETS_DIR="${SETS_DIR:-${BACKUP_ROOT}/sets}"
LOG_DIR="${LOG_DIR:-${BACKUP_ROOT}/logs}"
LIBRARY_SRC="${LIBRARY_SRC:-/mnt/extra_space/books}"
LIBRARY_MIRROR="${LIBRARY_MIRROR:-${BACKUP_ROOT}/library/bookgeek-books}"
# Plaintext staging lives on the system disk, NOT under /mnt/Media/Projects, so
# a Duplicati run that overlaps ours can never pick up an unencrypted dump.
WORK_ROOT="${WORK_ROOT:-${HOME}/.cache/geeksuite-backup}"
LOCK_FILE="${LOCK_FILE:-${WORK_ROOT}/backup.lock}"

AGE_BIN="${AGE_BIN:-${HOME}/.local/bin/age}"
RECIPIENT_FILE="${RECIPIENT_FILE:-${GS_LIB_DIR}/recipient.txt}"
AGE_KEY="${AGE_KEY:-${HOME}/.config/geeksuite/backup-key.age}"

KEEP_SETS="${KEEP_SETS:-7}"            # Duplicati keeps the long history
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"

MONGO_CONTAINER="${MONGO_CONTAINER:-datageek_mongodb}"
PG_CONTAINER="${PG_CONTAINER:-datageek_postgres}"
INFLUX_CONTAINER="${INFLUX_CONTAINER:-datageek_influxdb}"
MONGO_ENV_FILE="${MONGO_ENV_FILE:-${GEEKSUITE_ROOT}/apps/basegeek/.env.production}"

# ---------------------------------------------------------------- logging
GS_LOG_FILE="${GS_LOG_FILE:-/dev/null}"

log()  { printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "${GS_LOG_FILE}" >&2; }
warn() { log "WARNING: $*"; }

# alert: log, POST to ALERT_WEBHOOK, and tell the dead-man's switch this run
# failed (so it alerts now rather than after the grace period). $GS_HC_URL is
# set by each entrypoint to the healthcheck that belongs to it.
alert() {
  local msg="$1"
  log "ALERT: ${msg}"
  if [ -n "${ALERT_WEBHOOK:-}" ]; then
    curl -fsS --max-time 20 -X POST -H 'Content-Type: text/plain' \
      --data-binary "GeekSuite backup alert: ${msg}" "${ALERT_WEBHOOK}" \
      >/dev/null 2>&1 || log "WARNING: alert webhook POST failed"
  fi
  if [ -n "${GS_HC_URL:-}" ]; then
    curl -fsS --max-time 20 -o /dev/null "${GS_HC_URL}/fail" >/dev/null 2>&1 || true
  fi
}

die() { alert "$1"; exit "${2:-1}"; }

hc_success() {
  if [ -n "${GS_HC_URL:-}" ]; then
    curl -fsS --max-time 20 -o /dev/null "${GS_HC_URL}" \
      || warn "healthcheck ping failed (the run itself succeeded)"
  fi
}

human() { numfmt --to=iec --suffix=B "$1" 2>/dev/null || echo "${1}B"; }

# ---------------------------------------------------------------- cleanup registry
# Scratch containers are started inside $(...) and pipelines (subshells), so an
# array registry would lose them; instead every one carries this run's label
# and teardown removes by label.
GS_RUN_ID="${GS_RUN_ID:-$$-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')}"
GS_CLEAN_PATHS=()
gs_cleanup() {
  local ids p
  ids="$(docker ps -aq --filter "label=geeksuite.backup.run=${GS_RUN_ID}" 2>/dev/null || true)"
  [ -n "$ids" ] && docker rm -f $ids >/dev/null 2>&1 || true
  for p in "${GS_CLEAN_PATHS[@]:-}"; do
    [ -n "$p" ] && rm -rf -- "$p" 2>/dev/null || true
  done
}

# Drill containers left behind by a run that was SIGKILLed (no trap ran).
# Only ever matches our own label; never touches anything else.
sweep_stale_drills() {
  local id started
  for id in $(docker ps -aq --filter label=geeksuite.backup.drill=1 2>/dev/null); do
    started="$(docker inspect -f '{{.Created}}' "$id" 2>/dev/null)" || continue
    if [ $(( $(date +%s) - $(date -d "$started" +%s) )) -gt 7200 ]; then
      docker rm -f "$id" >/dev/null 2>&1 && log "removed stale drill container ${id}"
    fi
  done
  return 0
}

# ---------------------------------------------------------------- preflight
require_tools() {
  local t
  for t in docker python3 sha256sum gzip tar flock curl rsync numfmt; do
    command -v "$t" >/dev/null 2>&1 || die "required tool '$t' not found" 2
  done
  [ -x "${AGE_BIN}" ] || die "age binary not found at ${AGE_BIN}" 2
  sweep_stale_drills
}

recipient() {
  [ -s "${RECIPIENT_FILE}" ] || die "age recipient (public key) file ${RECIPIENT_FILE} missing" 2
  head -n1 "${RECIPIENT_FILE}"
}

require_key() {
  [ -r "${AGE_KEY}" ] || die "age private key ${AGE_KEY} missing or unreadable — cannot decrypt" 2
}

container_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" = "true" ]
}

# Image ID of a live container, so a scratch copy runs the exact same version.
image_of() { docker inspect -f '{{.Image}}' "$1"; }

# ---------------------------------------------------------------- secrets
# Build a mongodump/mongorestore YAML config ("uri: ...") from basegeek's
# .env.production. Output goes ONLY into a pipe to `docker exec -i ... --config=/dev/stdin`.
# Never call this where stdout is logged.
mongo_config_yaml() {
  python3 - "${MONGO_ENV_FILE}" <<'PY'
import json, re, sys, urllib.parse
text = open(sys.argv[1]).read()
def get(k):
    m = re.search(rf'^{re.escape(k)}=(.*)$', text, re.M)
    if not m:
        sys.exit(f'{k} not found in env file')
    v = m.group(1).strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        v = v[1:-1]
    return v
u = urllib.parse.quote(get('MONGO_INITDB_ROOT_USERNAME'), safe='')
p = urllib.parse.quote(get('MONGO_INITDB_ROOT_PASSWORD'), safe='')
print('uri: ' + json.dumps(f'mongodb://{u}:{p}@127.0.0.1:27017/?authSource=admin'))
PY
}

# Strip anything that looks like URI credentials from tool stderr before logging.
redact() { sed -E 's#(mongodb(\+srv)?://)[^@/ ]*@#\1***@#g; s#(password[=: ]+)[^ ,]*#\1***#Ig'; }

# ---------------------------------------------------------------- counts
# Mongo: "done dumping db.coll (N documents)" lines from mongodump/mongorestore
# stderr → TSV "ns<TAB>N". System and internal namespaces are dropped: they do
# not round-trip as ordinary collections (users/roles are restored specially).
mongo_counts_from_log() {
  sed -nE 's/.*done dumping ([^ ]+) \(([0-9]+) documents?\).*/\1\t\2/p' "$1" \
    | awk -F'\t' '{split($1,a,"."); db=a[1]; coll=substr($1,length(db)+2)}
                  db=="config"||db=="local"{next} coll ~ /^system\./ {next} {print}' \
    | LC_ALL=C sort
}

# Postgres: count the data lines of every COPY block in a plain pg_dumpall
# stream (stdin) → TSV "db.schema.table<TAB>N". Exact rows-in-the-dump.
pg_counts_from_dump() {
  awk '
    /^\\connect / { db=$NF; gsub(/"/,"",db); sub(/^dbname=/,"",db); gsub(/\x27/,"",db); next }
    /^COPY / && / FROM stdin;$/ { t=$2; n=0; inc=1; next }
    inc && /^\\\.$/ { printf "%s.%s\t%d\n", db, t, n; inc=0; next }
    inc { n++ }
  ' | LC_ALL=C sort
}

# ---------------------------------------------------------------- scratch containers
# Every scratch container: random name, --network none (nothing can reach it
# and it can reach nothing), --rm, and registered for teardown on exit.
rand_suffix() { od -An -N4 -tx1 /dev/urandom | tr -d ' \n'; }

scratch_mongo() {
  local name="gs-drill-mongo-$(rand_suffix)" i
  docker run -d --rm --network none --name "$name" --label geeksuite.backup.drill=1 --label "geeksuite.backup.run=${GS_RUN_ID}" \
    --tmpfs /data/db:rw,size=4g --tmpfs /data/configdb:rw,size=64m \
    "$(image_of "${MONGO_CONTAINER}")" --wiredTigerCacheSizeGB 0.5 --quiet >/dev/null
  for i in $(seq 1 60); do
    [ "$(docker exec "$name" mongosh --quiet --eval 'db.adminCommand("ping").ok' 2>/dev/null)" = 1 ] && { echo "$name"; return 0; }
    sleep 1
  done
  return 1
}

scratch_pg() {
  local name="gs-drill-pg-$(rand_suffix)" i
  docker run -d --rm --network none --name "$name" --label geeksuite.backup.drill=1 --label "geeksuite.backup.run=${GS_RUN_ID}" \
    -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=postgres \
    --tmpfs /var/lib/postgresql/data:rw,size=2g \
    "$(image_of "${PG_CONTAINER}")" -c fsync=off -c full_page_writes=off -c synchronous_commit=off >/dev/null
  # The entrypoint runs a temporary server during init, then restarts it —
  # wait for init to finish before trusting pg_isready.
  for i in $(seq 1 90); do
    # (grep -c, not -q: -q closes the pipe early and pipefail would call that a failure)
    if [ "$(docker logs "$name" 2>&1 | grep -c 'PostgreSQL init process complete')" -gt 0 ] \
       && docker exec "$name" pg_isready -U postgres -q 2>/dev/null; then
      echo "$name"; return 0
    fi
    sleep 1
  done
  return 1
}

scratch_influx() {
  local name="gs-drill-influx-$(rand_suffix)" i
  docker run -d --rm --network none --name "$name" --label geeksuite.backup.drill=1 --label "geeksuite.backup.run=${GS_RUN_ID}" \
    -e INFLUXDB_HTTP_AUTH_ENABLED=false -e INFLUXDB_REPORTING_DISABLED=true \
    -e INFLUXDB_MONITOR_STORE_ENABLED=false \
    --tmpfs /var/lib/influxdb:rw,size=2g --tmpfs /tmp:rw,size=1g \
    "$(image_of "${INFLUX_CONTAINER}")" >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" influx -execute 'SHOW DATABASES' >/dev/null 2>&1 && { echo "$name"; return 0; }
    sleep 1
  done
  return 1
}

# ---------------------------------------------------------------- drills
# Each drill reads a PLAINTEXT stream on stdin (the caller decides whether that
# is a staged file or `age -d` of an encrypted one), restores it into a fresh
# scratch container, and writes restored counts as TSV to $1.

# drill_mongo OUT_TSV  < mongo.archive.gz
drill_mongo() {
  local out="$1" c
  c="$(scratch_mongo)" || { log "scratch mongo failed to start"; return 1; }
  if ! docker exec -i "$c" mongorestore --archive --gzip --drop --quiet \
        --numInsertionWorkersPerCollection=4 2> >(redact | tail -n 5 >&2); then
    log "mongorestore into scratch container FAILED"; return 1
  fi
  docker exec "$c" mongosh --quiet --eval '
    const skip = ["config", "local"];
    db.adminCommand({ listDatabases: 1, nameOnly: true }).databases.forEach(d => {
      if (skip.includes(d.name)) return;
      const s = db.getSiblingDB(d.name);
      s.getCollectionInfos({ type: "collection" }).forEach(ci => {
        if (ci.name.startsWith("system.")) return;
        print(d.name + "." + ci.name + "\t" + s.getCollection(ci.name).countDocuments({}));
      });
    });' | LC_ALL=C sort > "$out"
  docker rm -f "$c" >/dev/null 2>&1 || true
}

# drill_pg OUT_TSV EXPECTED_TSV  < postgres.sql.gz
# Counts exactly the tables the dump carried, so the comparison is like-for-like.
drill_pg() {
  local out="$1" expected="$2" c errs db sql
  c="$(scratch_pg)" || { log "scratch postgres failed to start"; return 1; }
  errs="$(gunzip | docker exec -i "$c" psql -U postgres -d postgres -q -o /dev/null 2>&1 >/dev/null | grep -c '^ERROR' || true)"
  # Expected noise: the dump re-creates the bootstrap superuser, which the
  # scratch container already has. Row counts below are the real test.
  [ "${errs:-0}" -gt 0 ] && log "postgres scratch restore: ${errs} ERROR line(s) (role re-creation noise is expected; row counts decide)"
  : > "$out"
  for db in $(cut -f1 "$expected" | cut -d. -f1 | LC_ALL=C sort -u); do
    sql="$(awk -F'\t' -v db="$db" '{ split($1,a,"."); if (a[1]!=db) next;
            t=substr($1,length(db)+2); lit=$1; gsub(/\x27/,"\x27\x27",lit);
            printf "%sSELECT \x27%s\x27, count(*) FROM %s", (n++?" UNION ALL ":""), lit, t }' "$expected")"
    [ -z "$sql" ] && continue
    docker exec -i "$c" psql -U postgres -d "$db" -AtF $'\t' -c "$sql" >> "$out" \
      || { log "postgres count query failed in db ${db}"; return 1; }
  done
  LC_ALL=C sort -o "$out" "$out"
  docker rm -f "$c" >/dev/null 2>&1 || true
}

# drill_influx OUT_TSV  < influx.tar.gz   (tar of an `influxd backup -portable` dir)
# Output TSV: "db<TAB>series<TAB>field_values" per restored non-internal DB.
drill_influx() {
  local out="$1" c dbs db series vals
  c="$(scratch_influx)" || { log "scratch influx failed to start"; return 1; }
  docker exec -i "$c" sh -c 'mkdir -p /tmp/r && tar xzf - -C /tmp/r' || { log "influx archive extract FAILED"; return 1; }
  dbs="$(docker exec "$c" sh -c 'cat /tmp/r/*.manifest' | python3 -c '
import json,sys
m=json.load(sys.stdin)
print("\n".join(sorted({f["database"] for f in m.get("files",[]) if f.get("database") and f["database"]!="_internal"})))')"
  : > "$out"
  for db in $dbs; do
    docker exec "$c" influxd restore -portable -db "$db" -host 127.0.0.1:8088 /tmp/r >/dev/null 2>&1 \
      || { log "influxd restore of ${db} FAILED"; return 1; }
    series="$(docker exec "$c" influx -database "$db" -format csv -execute 'SHOW SERIES EXACT CARDINALITY' 2>/dev/null \
      | awk -F, 'NR>1{s+=$NF} END{print s+0}')"
    vals="$(docker exec "$c" influx -database "$db" -format csv -execute 'SELECT count(*) FROM /.*/' 2>/dev/null \
      | awk -F, 'NR==1{next} {for(i=4;i<=NF;i++) s+=$i} END{printf "%d", s+0}')"
    printf '%s\t%s\t%s\n' "$db" "$series" "$vals" >> "$out"
  done
  docker rm -f "$c" >/dev/null 2>&1 || true
}

# compare_tsv LABEL EXPECTED ACTUAL → 0 when identical; logs a short diff otherwise.
compare_tsv() {
  local label="$1" exp="$2" act="$3" n_exp n_act
  n_exp="$(awk -F'\t' '{s+=$2} END{print s+0}' "$exp")"
  n_act="$(awk -F'\t' '{s+=$2} END{print s+0}' "$act")"
  if diff -q "$exp" "$act" >/dev/null; then
    log "${label}: MATCH — $(wc -l < "$exp") namespaces, ${n_exp} rows/docs"
    return 0
  fi
  log "${label}: MISMATCH — expected ${n_exp} in $(wc -l < "$exp") namespaces, restored ${n_act} in $(wc -l < "$act")"
  diff "$exp" "$act" | head -n 20 | sed 's/^/    /' | tee -a "${GS_LOG_FILE}" >&2
  return 1
}

# ---------------------------------------------------------------- sets
# Complete sets only: a set dir is renamed into place (from .<stamp>.partial)
# after every file in it is verified and MANIFEST.json is written.
list_sets() {
  [ -d "${SETS_DIR}" ] || return 0
  find "${SETS_DIR}" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
    -regex '.*/[0-9]{8}_[0-9]{6}' -printf '%f\n' | LC_ALL=C sort
}
latest_set() { list_sets | tail -n1; }

decrypt_stream() { "${AGE_BIN}" -d -i "${AGE_KEY}" "$1"; }
