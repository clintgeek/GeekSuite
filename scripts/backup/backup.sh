#!/usr/bin/env bash
# ==============================================================================
# GeekSuite nightly backup — one timestamped, encrypted, verified set.
# ==============================================================================
# Usage:  scripts/backup/backup.sh            (cron runs exactly this)
#
# Produces   ${SETS_DIR}/<YYYYmmdd_HHMMSS>/
#              mongo.archive.gz.age    mongodump --archive --gzip, ALL databases
#              postgres.sql.gz.age     pg_dumpall (roles + every database)
#              influx.tar.gz.age       influxd backup -portable (all databases)
#              env.tar.gz.age          every apps/*/.env.production (encrypted ONLY)
#              MANIFEST.json           sizes, sha256, per-collection/table counts
# and refreshes  ${LIBRARY_MIRROR}     rsync mirror of BookGeek's ebook library
#                                      (/mnt/extra_space/books, covers included)
#
# Order of operations per component: dump → verify the PLAINTEXT (gzip -t, then
# a real restore into a throwaway --network none container whose counts must
# equal the dump's own counts) → encrypt to the age PUBLIC key → drop plaintext.
# Plaintext only ever sits in ${WORK_ROOT} (system disk, mode 700), never under
# /mnt/Media/Projects where Duplicati could copy it.
#
# The set directory is built as .<stamp>.partial and renamed into place only
# when everything in it has verified, so "a set exists" means "a set is good".
#
# Nothing here writes to the live datastores. Mongo/Postgres dumps are logical
# reads via `docker exec`; Influx is read over its local RPC port by a sidecar
# container sharing its network namespace — the live container is not written.
#
# Exit codes: 0 ok · 1 backup failed (alerted) · 2 config/tooling error · 3 another run holds the lock
# ==============================================================================
set -euo pipefail
umask 077

# shellcheck source=lib.sh
. "$(dirname "$(realpath "$0")")/lib.sh"
GS_HC_URL="${HEALTHCHECK_URL:-}"

mkdir -p "${SETS_DIR}" "${LOG_DIR}" "${WORK_ROOT}"
chmod 700 "${WORK_ROOT}"
GS_LOG_FILE="${LOG_DIR}/backup.log"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "another backup/verify run holds ${LOCK_FILE} — exiting without doing anything"
  exit 3
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
START_EPOCH="$(date +%s)"
PARTIAL="${SETS_DIR}/.${STAMP}.partial"
FINAL="${SETS_DIR}/${STAMP}"
WORK="${WORK_ROOT}/work-${STAMP}"
mkdir -p "${PARTIAL}" "${WORK}"
GS_CLEAN_PATHS+=("${WORK}")

on_exit() {
  local rc=$?
  gs_cleanup
  if [ $rc -ne 0 ] && [ -d "${PARTIAL}" ]; then
    rm -rf -- "${PARTIAL}"
    alert "backup ${STAMP} FAILED (exit ${rc}) — no set written. See ${GS_LOG_FILE}."
  fi
}
trap on_exit EXIT
trap 'exit 130' INT TERM

require_tools
RECIPIENT="$(recipient)"
for c in "${MONGO_CONTAINER}" "${PG_CONTAINER}" "${INFLUX_CONTAINER}"; do
  container_running "$c" || die "datastore container ${c} is not running"
done
[ -r "${MONGO_ENV_FILE}" ] || die "cannot read ${MONGO_ENV_FILE} (Mongo root credential source)" 2

log "=== GeekSuite backup ${STAMP} → ${FINAL} ==="

# encrypt PLAINTEXT NAME — age to the public key, then drop the plaintext.
encrypt_into_set() {
  local src="$1" name="$2"
  "${AGE_BIN}" -r "${RECIPIENT}" -o "${PARTIAL}/${name}.age" "${src}" \
    || { rm -f "${PARTIAL}/${name}.age"; die "encryption of ${name} failed"; }
  [ -s "${PARTIAL}/${name}.age" ] || die "encrypted ${name} is empty"
  rm -f -- "${src}"
}

# ---------------------------------------------------------------- 1. MongoDB
t0="$(date +%s)"
log "mongo: dumping all databases from ${MONGO_CONTAINER}"
# Credentials travel as a YAML config on stdin (--config=/dev/stdin), so they
# are in no process's argv and never touch disk. The archive comes out on stdout.
if ! mongo_config_yaml | docker exec -i "${MONGO_CONTAINER}" \
      mongodump --config=/dev/stdin --archive --gzip \
      > "${WORK}/mongo.archive.gz" 2> "${WORK}/mongodump.err"; then
  redact < "${WORK}/mongodump.err" | tail -n 5 | tee -a "${GS_LOG_FILE}" >&2
  die "mongodump failed"
fi
gzip -t "${WORK}/mongo.archive.gz" || die "mongo archive failed gzip integrity check"
mongo_counts_from_log "${WORK}/mongodump.err" > "${WORK}/mongo.expected.tsv"
[ -s "${WORK}/mongo.expected.tsv" ] || die "mongodump reported zero collections — refusing to call that a backup"
rm -f "${WORK}/mongodump.err"
log "mongo: dumped $(cut -f1 "${WORK}/mongo.expected.tsv" | cut -d. -f1 | sort -u | wc -l) databases, $(wc -l < "${WORK}/mongo.expected.tsv") collections, $(awk -F'\t' '{s+=$2} END{print s+0}' "${WORK}/mongo.expected.tsv") documents; restoring into a scratch container to prove it"
drill_mongo "${WORK}/mongo.restored.tsv" < "${WORK}/mongo.archive.gz" || die "mongo pre-encryption restore drill failed"
compare_tsv "mongo pre-encryption drill" "${WORK}/mongo.expected.tsv" "${WORK}/mongo.restored.tsv" \
  || die "mongo restore drill counts do not match the dump"
MONGO_SHA="$(sha256sum "${WORK}/mongo.archive.gz" | cut -d' ' -f1)"
encrypt_into_set "${WORK}/mongo.archive.gz" mongo.archive.gz
MONGO_SECS=$(( $(date +%s) - t0 ))

# ---------------------------------------------------------------- 2. PostgreSQL
t0="$(date +%s)"
log "postgres: pg_dumpall from ${PG_CONTAINER}"
# Local-socket trust auth inside the container; no password involved. The user
# name comes from the container's own env, expanded inside the container.
docker exec "${PG_CONTAINER}" sh -c 'exec pg_dumpall -U "$POSTGRES_USER" --clean --if-exists' \
  | gzip -9 > "${WORK}/postgres.sql.gz" || die "pg_dumpall failed"
gzip -t "${WORK}/postgres.sql.gz" || die "postgres dump failed gzip integrity check"
[ "$(zcat "${WORK}/postgres.sql.gz" | tail -n 5 | grep -c 'PostgreSQL database cluster dump complete')" -gt 0 ] \
  || die "postgres dump is truncated (no 'cluster dump complete' trailer)"
zcat "${WORK}/postgres.sql.gz" | pg_counts_from_dump > "${WORK}/pg.expected.tsv"
log "postgres: $(cut -f1 "${WORK}/pg.expected.tsv" | cut -d. -f1 | sort -u | wc -l) databases with tables, $(wc -l < "${WORK}/pg.expected.tsv") tables, $(awk -F'\t' '{s+=$2} END{print s+0}' "${WORK}/pg.expected.tsv") rows; restoring into a scratch container"
drill_pg "${WORK}/pg.restored.tsv" "${WORK}/pg.expected.tsv" < "${WORK}/postgres.sql.gz" || die "postgres pre-encryption restore drill failed"
compare_tsv "postgres pre-encryption drill" "${WORK}/pg.expected.tsv" "${WORK}/pg.restored.tsv" \
  || die "postgres restore drill counts do not match the dump"
PG_SHA="$(sha256sum "${WORK}/postgres.sql.gz" | cut -d' ' -f1)"
encrypt_into_set "${WORK}/postgres.sql.gz" postgres.sql.gz
PG_SECS=$(( $(date +%s) - t0 ))

# ---------------------------------------------------------------- 3. InfluxDB
t0="$(date +%s)"
log "influx: portable backup of ${INFLUX_CONTAINER} via sidecar on its RPC port"
mkdir -p "${WORK}/influx"
# Sidecar shares the live container's network namespace to reach 127.0.0.1:8088
# (the backup RPC, not exposed on the host). It writes into our work dir as our
# own uid; the live container's filesystem is never touched.
docker run --rm --network "container:${INFLUX_CONTAINER}" --user "$(id -u):$(id -g)" \
  -v "${WORK}/influx:/backup" "$(image_of "${INFLUX_CONTAINER}")" \
  influxd backup -portable -host 127.0.0.1:8088 /backup > "${WORK}/influx.log" 2>&1 \
  || { tail -n 5 "${WORK}/influx.log" | tee -a "${GS_LOG_FILE}" >&2; die "influxd backup failed"; }
ls "${WORK}/influx/"*.manifest >/dev/null 2>&1 || die "influx backup produced no manifest"
tar czf "${WORK}/influx.tar.gz" -C "${WORK}/influx" .
gzip -t "${WORK}/influx.tar.gz" || die "influx archive failed gzip integrity check"
INFLUX_DBS_JSON="$(python3 -c '
import glob,json
m=json.load(open(glob.glob(__import__("sys").argv[1]+"/*.manifest")[0]))
out={}
for f in m.get("files",[]):
    d=f.get("database")
    if d: out.setdefault(d,set()).add(f.get("shardID"))
print(json.dumps({d:len(s) for d,s in sorted(out.items())}))' "${WORK}/influx")"
rm -rf "${WORK}/influx"
log "influx: shards per database ${INFLUX_DBS_JSON}; restoring into a scratch container"
drill_influx "${WORK}/influx.restored.tsv" < "${WORK}/influx.tar.gz" || die "influx pre-encryption restore drill failed"
[ -s "${WORK}/influx.restored.tsv" ] || die "influx drill restored no databases"
while IFS=$'\t' read -r db s v; do log "influx drill: ${db} restored — ${s} series, ${v} field values"; done < "${WORK}/influx.restored.tsv"
INFLUX_SHA="$(sha256sum "${WORK}/influx.tar.gz" | cut -d' ' -f1)"
encrypt_into_set "${WORK}/influx.tar.gz" influx.tar.gz
INFLUX_SECS=$(( $(date +%s) - t0 ))

# ---------------------------------------------------------------- 4. env files (encrypted only)
log "env: archiving apps/*/.env.production (names only in logs)"
( cd "${GEEKSUITE_ROOT}" && compgen -G 'apps/*/.env.production' ) | LC_ALL=C sort > "${WORK}/env.list" \
  || die "no apps/*/.env.production found"
tar czf "${WORK}/env.tar.gz" -C "${GEEKSUITE_ROOT}" -T "${WORK}/env.list"
gzip -t "${WORK}/env.tar.gz" || die "env archive failed gzip integrity check"
[ "$(tar tzf "${WORK}/env.tar.gz" | wc -l)" -eq "$(wc -l < "${WORK}/env.list")" ] || die "env archive entry count mismatch"
ENV_SHA="$(sha256sum "${WORK}/env.tar.gz" | cut -d' ' -f1)"
encrypt_into_set "${WORK}/env.tar.gz" env.tar.gz
log "env: $(wc -l < "${WORK}/env.list") files: $(tr '\n' ' ' < "${WORK}/env.list")"

# ---------------------------------------------------------------- 5. BookGeek library mirror
# /mnt/extra_space shares a physical disk (sdc) with /mnt/int_backup and is in
# no Duplicati job. Mirroring it here puts it on sda and into Duplicati's
# /projects/ jobs, which keep the history — so a plain mirror (not nightly
# tarballs) is enough, and it dedupes.
t0="$(date +%s)"
LIB_FILES=0; LIB_BYTES=0
if [ -d "${LIBRARY_SRC}" ]; then
  src_n="$(find "${LIBRARY_SRC}" -type f | wc -l)"
  mkdir -p "${LIBRARY_MIRROR}"
  dst_n="$(find "${LIBRARY_MIRROR}" -type f | wc -l)"
  DELETE_FLAG="--delete"
  # A vanished or half-unmounted source must not empty the mirror.
  if [ "${dst_n}" -gt 20 ] && [ $(( src_n * 2 )) -lt "${dst_n}" ]; then
    DELETE_FLAG=""
    alert "library source has ${src_n} files vs ${dst_n} in the mirror — skipping --delete this run; check ${LIBRARY_SRC}"
  fi
  rsync -a ${DELETE_FLAG} --exclude '.DS_Store' "${LIBRARY_SRC}/" "${LIBRARY_MIRROR}/" \
    || die "rsync of ${LIBRARY_SRC} failed"
  # Calibre's metadata.db is SQLite: re-copy it with the online-backup API so
  # the mirror never holds a torn page from a mid-write rsync.
  if [ -f "${LIBRARY_SRC}/metadata.db" ]; then
    python3 - "${LIBRARY_SRC}/metadata.db" "${LIBRARY_MIRROR}/metadata.db" <<'PY' || die "sqlite backup of metadata.db failed"
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2] + ".tmp")
src.backup(dst); dst.close(); src.close()
chk = sqlite3.connect(sys.argv[2] + ".tmp").execute("PRAGMA integrity_check").fetchone()[0]
if chk != "ok": sys.exit("integrity_check: " + chk)
import os; os.replace(sys.argv[2] + ".tmp", sys.argv[2])
PY
  fi
  LIB_FILES="$(find "${LIBRARY_MIRROR}" -type f | wc -l)"
  LIB_BYTES="$(du -sb "${LIBRARY_MIRROR}" | cut -f1)"
  log "library: mirror has ${LIB_FILES} files, $(human "${LIB_BYTES}") (source ${src_n} files)"
else
  alert "library source ${LIBRARY_SRC} missing — mirror left untouched"
fi
LIB_SECS=$(( $(date +%s) - t0 ))

# ---------------------------------------------------------------- 6. MANIFEST
export STAMP MONGO_SHA PG_SHA INFLUX_SHA ENV_SHA INFLUX_DBS_JSON LIB_FILES LIB_BYTES \
       MONGO_SECS PG_SECS INFLUX_SECS LIB_SECS START_EPOCH LIBRARY_MIRROR GEEKSUITE_ROOT
python3 - "${PARTIAL}" "${WORK}" <<'PY'
import hashlib, json, os, socket, sys, time, glob
part, work = sys.argv[1], sys.argv[2]
E = os.environ
def tsv(p, cols=2):
    out = {}
    for line in open(p):
        f = line.rstrip("\n").split("\t")
        out[f[0]] = int(f[1]) if cols == 2 else {"series": int(f[1]), "field_values": int(f[2])}
    return out
def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""): h.update(b)
    return h.hexdigest()
files = {}
for name, plain_sha in [("mongo.archive.gz", E["MONGO_SHA"]), ("postgres.sql.gz", E["PG_SHA"]),
                        ("influx.tar.gz", E["INFLUX_SHA"]), ("env.tar.gz", E["ENV_SHA"])]:
    p = os.path.join(part, name + ".age")
    files[name + ".age"] = {"bytes": os.path.getsize(p), "sha256": sha(p), "plaintext_sha256": plain_sha}
mongo = tsv(os.path.join(work, "mongo.expected.tsv"))
pg = tsv(os.path.join(work, "pg.expected.tsv"))
influx = tsv(os.path.join(work, "influx.restored.tsv"), 3)
app_data = {}
for d in sorted(glob.glob(os.path.join(E["GEEKSUITE_ROOT"], "apps/*/data"))):
    app = d.split("/")[-2]
    if app == "basegeek":   # live datastore files — covered by the logical dumps above
        continue
    n = b = 0
    for root, _, fs in os.walk(d):
        for f in fs:
            n += 1
            try: b += os.path.getsize(os.path.join(root, f))
            except OSError: pass
    app_data[app] = {"files": n, "bytes": b}
m = {
    "format": 1,
    "stamp": E["STAMP"],
    "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "host": socket.gethostname(),
    "duration_seconds": {"total": int(time.time()) - int(E["START_EPOCH"]), "mongo": int(E["MONGO_SECS"]),
                         "postgres": int(E["PG_SECS"]), "influx": int(E["INFLUX_SECS"]), "library": int(E["LIB_SECS"])},
    "encryption": {"tool": "age", "recipient_file": "scripts/backup/recipient.txt"},
    "files": files,
    "mongo": {"collections": len(mongo), "documents": sum(mongo.values()), "counts": mongo},
    "postgres": {"tables": len(pg), "rows": sum(pg.values()), "counts": pg},
    "influx": {"shards_per_db": json.loads(E["INFLUX_DBS_JSON"]), "restored": influx},
    "env": {"files": [l.strip() for l in open(os.path.join(work, "env.list"))]},
    "library_mirror": {"path": E["LIBRARY_MIRROR"], "files": int(E["LIB_FILES"]), "bytes": int(E["LIB_BYTES"])},
    "app_data_not_in_set": {"note": "apps/*/data (except basegeek) is under /mnt/Media/Projects and rides Duplicati directly", "apps": app_data},
    "not_backed_up": {"redis": "sessions, rate limits, refresh-token state — transient by design"},
}
json.dump(m, open(os.path.join(part, "MANIFEST.json"), "w"), indent=2, sort_keys=False)
PY

chmod 700 "${PARTIAL}"; chmod 600 "${PARTIAL}"/*
mv "${PARTIAL}" "${FINAL}"

# ---------------------------------------------------------------- 7. retention
mapfile -t ALL < <(list_sets)
if [ "${#ALL[@]}" -gt "${KEEP_SETS}" ]; then
  for old in "${ALL[@]:0:${#ALL[@]}-${KEEP_SETS}}"; do
    log "retention: removing set ${old} (keeping newest ${KEEP_SETS}; Duplicati holds older history)"
    rm -rf -- "${SETS_DIR:?}/${old}"
  done
fi
# Stale partials from a crashed run (older than a day) are garbage.
find "${SETS_DIR}" -mindepth 1 -maxdepth 1 -type d -name '.*.partial' -mmin +1440 -exec rm -rf -- {} + 2>/dev/null || true

SET_BYTES="$(du -sb "${FINAL}" | cut -f1)"
log "=== backup ${STAMP} OK — set $(human "${SET_BYTES}"), $(( $(date +%s) - START_EPOCH ))s (mongo ${MONGO_SECS}s, postgres ${PG_SECS}s, influx ${INFLUX_SECS}s, library ${LIB_SECS}s) ==="
hc_success
