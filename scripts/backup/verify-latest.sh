#!/usr/bin/env bash
# ==============================================================================
# GeekSuite backup — staleness alarm + end-to-end restore drill of the newest set.
# ==============================================================================
# Usage:  scripts/backup/verify-latest.sh [--set STAMP] [--no-drill] [--no-duplicati]
#
# A backup never restored isn't one. Every night this:
#   1. finds the newest complete set; ALERTS if there is none or it is older
#      than MAX_AGE_HOURS (26) — catches backup.sh failing or not running
#   2. checks every file listed in MANIFEST.json exists with the recorded sha256
#   3. decrypts each archive with the PRIVATE key (proves the key still opens
#      them — the only property a restore depends on) and streams it straight
#      into a throwaway --network none container (no plaintext on disk):
#        mongo    → mongorestore, per-collection counts must equal MANIFEST
#        postgres → psql, per-table row counts must equal MANIFEST
#        influx   → influxd restore, per-DB series + field-value counts must
#                   equal the ones recorded at backup time
#        env      → decrypt + gzip/tar listing; file list must equal MANIFEST
#   4. runs check-duplicati.sh — the sets only leave this disk via Duplicati
#
# Alerts: ALERT_WEBHOOK (POST) and VERIFY_HEALTHCHECK_URL/fail. Success pings
# VERIFY_HEALTHCHECK_URL. Exit codes: 0 ok · 1 alarm (stale/corrupt/mismatch/
# Duplicati) · 2 config error (no key, no tools).
# ==============================================================================
set -euo pipefail
umask 077

# shellcheck source=lib.sh
. "$(dirname "$(realpath "$0")")/lib.sh"
GS_HC_URL="${VERIFY_HEALTHCHECK_URL:-}"

SET=""; DRILL=1; DUPLICATI=1
while [ $# -gt 0 ]; do
  case "$1" in
    --set) SET="$2"; shift ;;
    --no-drill) DRILL=0 ;;
    --no-duplicati) DUPLICATI=0 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "${LOG_DIR}" "${WORK_ROOT}"
GS_LOG_FILE="${LOG_DIR}/verify.log"
exec 9>"${LOCK_FILE}"
# Wait for a running backup to finish rather than verifying a half-built set.
flock -w 3600 9 || die "timed out waiting for ${LOCK_FILE}"
trap gs_cleanup EXIT

require_tools
require_key

FAILS=()
fail() { log "FAIL: $*"; FAILS+=("$*"); }

log "=== GeekSuite backup verify ==="

EXPLICIT_SET="${SET}"
[ -n "${SET}" ] || SET="$(latest_set)"
if [ -z "${SET}" ]; then
  die "no complete backup set found in ${SETS_DIR}"
fi
DIR="${SETS_DIR}/${SET}"
[ -f "${DIR}/MANIFEST.json" ] || die "set ${SET} has no MANIFEST.json"

# 1. staleness — of the newest set only; an explicitly chosen older set is not stale by definition
SET_EPOCH="$(date -d "$(echo "${SET}" | sed -E 's/^([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2})$/\1-\2-\3 \4:\5:\6/')" +%s)"
AGE_H=$(( ( $(date +%s) - SET_EPOCH ) / 3600 ))
if [ -z "${EXPLICIT_SET}" ] && [ "${AGE_H}" -gt "${MAX_AGE_HOURS}" ]; then
  fail "newest set ${SET} is ${AGE_H}h old (limit ${MAX_AGE_HOURS}h) — backup.sh has stopped succeeding"
else
  log "set ${SET}: age ${AGE_H}h"
fi

WORK="$(mktemp -d "${WORK_ROOT}/verify.XXXXXX")"; chmod 700 "${WORK}"
GS_CLEAN_PATHS+=("${WORK}")

# Expected counts out of the manifest, as TSV.
python3 - "${DIR}/MANIFEST.json" "${WORK}" <<'PY'
import json, os, sys
m = json.load(open(sys.argv[1])); w = sys.argv[2]
def dump(name, d):
    with open(os.path.join(w, name), "w") as f:
        for k in sorted(d, key=lambda s: s.encode()): f.write(f"{k}\t{d[k]}\n")
dump("mongo.expected.tsv", m["mongo"]["counts"])
dump("pg.expected.tsv", m["postgres"]["counts"])
with open(os.path.join(w, "influx.expected.tsv"), "w") as f:
    for k in sorted(m["influx"]["restored"]):
        v = m["influx"]["restored"][k]; f.write(f"{k}\t{v['series']}\t{v['field_values']}\n")
with open(os.path.join(w, "env.expected"), "w") as f:
    f.write("".join(x + "\n" for x in m["env"]["files"]))
with open(os.path.join(w, "files.tsv"), "w") as f:
    for k, v in m["files"].items(): f.write(f"{k}\t{v['sha256']}\t{v['bytes']}\n")
PY

# 2. presence + checksum of every encrypted file
while IFS=$'\t' read -r name sha bytes; do
  f="${DIR}/${name}"
  if [ ! -s "$f" ]; then fail "${name} missing or empty"; continue; fi
  [ "$(sha256sum "$f" | cut -d' ' -f1)" = "$sha" ] || fail "${name} sha256 does not match MANIFEST (bit rot or tampering)"
done < "${WORK}/files.tsv"

# 3. decrypt + restore drills
if [ "${DRILL}" = 1 ]; then
  t0=$(date +%s)
  if decrypt_stream "${DIR}/mongo.archive.gz.age" | drill_mongo "${WORK}/mongo.restored.tsv"; then
    compare_tsv "mongo drill (${SET})" "${WORK}/mongo.expected.tsv" "${WORK}/mongo.restored.tsv" \
      || fail "mongo restored counts differ from MANIFEST"
  else
    fail "mongo archive did not decrypt/restore"
  fi
  log "mongo drill took $(( $(date +%s) - t0 ))s"

  t0=$(date +%s)
  if decrypt_stream "${DIR}/postgres.sql.gz.age" | drill_pg "${WORK}/pg.restored.tsv" "${WORK}/pg.expected.tsv"; then
    compare_tsv "postgres drill (${SET})" "${WORK}/pg.expected.tsv" "${WORK}/pg.restored.tsv" \
      || fail "postgres restored row counts differ from MANIFEST"
  else
    fail "postgres dump did not decrypt/restore"
  fi
  log "postgres drill took $(( $(date +%s) - t0 ))s"

  t0=$(date +%s)
  if decrypt_stream "${DIR}/influx.tar.gz.age" | drill_influx "${WORK}/influx.restored.tsv"; then
    if diff -q "${WORK}/influx.expected.tsv" "${WORK}/influx.restored.tsv" >/dev/null; then
      while IFS=$'\t' read -r db s v; do log "influx drill (${SET}): ${db} MATCH — ${s} series, ${v} field values"; done < "${WORK}/influx.restored.tsv"
    else
      fail "influx restored counts differ from MANIFEST"
      diff "${WORK}/influx.expected.tsv" "${WORK}/influx.restored.tsv" | head -n 10 | sed 's/^/    /' | tee -a "${GS_LOG_FILE}" >&2
    fi
  else
    fail "influx archive did not decrypt/restore"
  fi
  log "influx drill took $(( $(date +%s) - t0 ))s"
fi

# env: decrypt, integrity, and the file list — never extracted to disk here.
if decrypt_stream "${DIR}/env.tar.gz.age" | tar tzf - | LC_ALL=C sort > "${WORK}/env.actual"; then
  if diff -q <(LC_ALL=C sort "${WORK}/env.expected") "${WORK}/env.actual" >/dev/null; then
    log "env: MATCH — $(wc -l < "${WORK}/env.actual") files decrypt and list cleanly"
  else
    fail "env archive file list differs from MANIFEST"
  fi
else
  fail "env archive did not decrypt/list"
fi

# library mirror sanity (it is not per-set; Duplicati versions it)
LIB_N="$(find "${LIBRARY_MIRROR}" -type f 2>/dev/null | wc -l)"
[ "${LIB_N}" -gt 0 ] && log "library mirror: ${LIB_N} files" || fail "library mirror ${LIBRARY_MIRROR} is empty or missing"

# 4. Duplicati — the only thing that takes these sets off this disk
if [ "${DUPLICATI}" = 1 ]; then
  if ! GS_LOG_FILE_OVERRIDE="${GS_LOG_FILE}" DUPLICATI_HEALTHCHECK_URL="" ALERT_WEBHOOK="" \
       "$(dirname "$(realpath "$0")")/check-duplicati.sh"; then
    fail "Duplicati is not carrying the backups off-disk (see check above)"
  fi
fi

if [ "${#FAILS[@]}" -gt 0 ]; then
  die "verify of ${SET}: ${#FAILS[@]} problem(s) — $(printf '%s; ' "${FAILS[@]}")"
fi
log "=== verify ${SET} OK ==="
hc_success
