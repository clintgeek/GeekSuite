#!/usr/bin/env bash
# ==============================================================================
# GeekSuite — is Duplicati actually carrying the backups off this disk?
# ==============================================================================
# Our sets under /mnt/Media/Projects/GeekSuite-backups only leave sda because
# Duplicati's jobs (source /projects/) copy them. A Duplicati job that fails
# quietly makes every set a single-disk backup — and on 2026-09-25 the Network
# job had failed every night since 2026-05-13 without anyone knowing. This
# script is the alarm for that.
#
# How it reads Duplicati (strictly read-only):
#   docker cp the LIVE server DB (and its -wal/-shm if present) out of the
#   `duplicati` container into a mode-700 temp dir → open it read-only → read
#   only the Backup.Name, Metadata (Last* timestamps/messages) and Notification
#   tables → delete the copy. Backup.TargetURL, Option values, ConnectionString
#   and every other table are never selected — they hold encrypted credentials.
#
# For EVERY job, ALERT (non-zero exit) when:
#   - LastBackupFinished is older than MAX_AGE_HOURS (default 26), or missing
#   - LastErrorDate is newer than LastBackupFinished (the last run failed)
#   - the job's newest Notification is Type=Error
#   - a backup-target bind mount (/backups/* in the container) is EMPTY inside
#     the container while the host path has files — a stale mount (see below)
# WARN (reported, exit unaffected) when:
#   - the job's newest Notification is Type=Warning
#   - a backup target mounted here (/mnt/int_backup, /mnt/ext_backup, /mnt/network_backup) is ≥ DISK_WARN_PCT (90) full
#
# Output: job names, timestamps, truncated error text with anything URL- or
# path-with-credentials-like stripped, disk percentages. Nothing else.
#
# Exit codes: 0 ok (warnings allowed) · 1 at least one job alarmed · 2 could not read Duplicati
# ==============================================================================
set -euo pipefail
umask 077

# shellcheck source=lib.sh
. "$(dirname "$(realpath "$0")")/lib.sh"
GS_HC_URL="${DUPLICATI_HEALTHCHECK_URL:-}"
DUPLICATI_CONTAINER="${DUPLICATI_CONTAINER:-duplicati}"
DUPLICATI_DB_PATH="${DUPLICATI_DB_PATH:-/data/Duplicati/Duplicati-server.sqlite}"
DISK_WARN_PCT="${DISK_WARN_PCT:-90}"
TARGET_MOUNTS="${TARGET_MOUNTS:-/mnt/int_backup /mnt/ext_backup /mnt/network_backup}"

mkdir -p "${LOG_DIR}" "${WORK_ROOT}"
GS_LOG_FILE="${GS_LOG_FILE_OVERRIDE:-${LOG_DIR}/duplicati-check.log}"

TMP="$(mktemp -d "${WORK_ROOT}/dup.XXXXXX")"
chmod 700 "${TMP}"
trap 'rm -rf -- "${TMP}"' EXIT

log "--- Duplicati check (read-only copy of ${DUPLICATI_CONTAINER}:${DUPLICATI_DB_PATH}) ---"

container_running "${DUPLICATI_CONTAINER}" || die "container ${DUPLICATI_CONTAINER} is not running — nothing is carrying backups off-disk" 2
docker cp "${DUPLICATI_CONTAINER}:${DUPLICATI_DB_PATH}" "${TMP}/s.sqlite" >/dev/null 2>&1 \
  || die "could not copy the Duplicati server DB out of ${DUPLICATI_CONTAINER}" 2
for sfx in -wal -shm; do
  docker cp "${DUPLICATI_CONTAINER}:${DUPLICATI_DB_PATH}${sfx}" "${TMP}/s.sqlite${sfx}" >/dev/null 2>&1 || true
done

set +e
python3 - "${TMP}/s.sqlite" "${MAX_AGE_HOURS}" > "${TMP}/report" <<'PY'
import re, sqlite3, sys, time
from datetime import datetime, timezone
db, max_age_h = sys.argv[1], float(sys.argv[2])
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)

def clean(s, n=140):
    s = (s or "").replace("\n", " ").replace("\r", " ")
    s = re.sub(r"[a-zA-Z][a-zA-Z0-9+.-]*://\S+", "<url>", s)        # any URL
    s = re.sub(r"(?i)(pass(word)?|auth|token|key|secret)\S*[=:]\S+", r"\1=***", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:n] + ("…" if len(s) > n else "")

def ts(v):
    if not v: return None
    try: return datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).timestamp()
    except ValueError: return None

def fmt(t):
    return datetime.fromtimestamp(t).astimezone().strftime("%Y-%m-%d %H:%M %Z") if t else "never"

now = time.time()
alarms = warns = 0
jobs = c.execute("SELECT ID, Name FROM Backup ORDER BY ID").fetchall()
if not jobs:
    print("ALERT\tno Duplicati jobs defined at all"); sys.exit(1)
for jid, name in jobs:
    name = (name or "").strip()
    md = dict(c.execute("SELECT Name, Value FROM Metadata WHERE BackupID=? AND Name IN "
                        "('LastBackupFinished','LastErrorDate','LastErrorMessage')", (jid,)).fetchall())
    fin, err = ts(md.get("LastBackupFinished")), ts(md.get("LastErrorDate"))
    note = c.execute("SELECT Type, Title, Message, Timestamp FROM Notification WHERE BackupID=? "
                     "ORDER BY Timestamp DESC LIMIT 1", (str(jid),)).fetchone()
    problems = []
    if fin is None:
        problems.append("has never finished a backup")
    elif (now - fin) / 3600 > max_age_h:
        problems.append(f"last success {fmt(fin)} is {int((now - fin) / 3600)}h old (limit {int(max_age_h)}h)")
    if err and (fin is None or err > fin):
        problems.append(f"last run FAILED at {fmt(err)}: {clean(md.get('LastErrorMessage'))}")
    # An Error notification only matters if nothing has succeeded since it:
    # a job that failed on the 19th and has succeeded every night after is
    # healthy (the first live run flagged GoogleDrive for exactly that).
    note_t = float(note[3]) if note and str(note[3]).lstrip("-").isdigit() else None
    if note and note[0] == "Error" and (fin is None or note_t is None or note_t > fin):
        msg = f"newest notification is an Error ({fmt(note_t)})"
        if not any("FAILED" in p for p in problems): msg += f": {clean(note[2] or note[1])}"
        problems.append(msg)
    if problems:
        alarms += 1
        print(f"ALERT\t{name}: " + "; ".join(problems))
    else:
        print(f"OK\t{name}: last success {fmt(fin)}")
    if note and note[0] == "Warning" and (fin is None or note_t is None or note_t >= fin - 86400):
        warns += 1
        print(f"WARN\t{name}: newest notification is a Warning ({fmt(note[3])}): {clean(note[2] or note[1])}")
sys.exit(1 if alarms else 0)
PY
rc=$?
set -e
[ -s "${TMP}/report" ] || die "could not read job status from the Duplicati server DB" 2

ALERTS=()
while IFS=$'\t' read -r level text; do
  case "$level" in
    ALERT) ALERTS+=("$text"); log "ALERT: Duplicati job ${text}" ;;
    WARN)  warn "Duplicati job ${text}" ;;
    *)     log "Duplicati job ${text}" ;;
  esac
done < "${TMP}/report"

# Stale bind mounts. A host mount that appears AFTER the container started
# (e.g. the CIFS share failing at boot and being mounted later) is invisible
# inside the container — it keeps seeing the empty directory underneath. On
# 2026-09-25 that is exactly why the Network job reported "18140 files missing
# from the remote" while the host showed 18151 files on the share. Compare
# host vs in-container entry counts for every backup-target bind mount.
while read -r src dst; do
  [ -n "$src" ] || continue
  # "has at least one entry" is all we need — and it is instant even on an
  # 18k-file CIFS share, where a full listing takes ~a minute.
  host_n="$(find "$src" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null | wc -l)"
  cont_n="$(docker exec "${DUPLICATI_CONTAINER}" find "$dst" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null | wc -l || echo 0)"
  if [ "${host_n}" -gt 0 ] && [ "${cont_n}" -eq 0 ]; then
    ALERTS+=("stale bind mount: host ${src} has files but ${DUPLICATI_CONTAINER} sees ${dst} EMPTY — the share was mounted after the container started; restart the container (do NOT repair/recreate the Duplicati DB)")
    log "ALERT: stale bind mount — host ${src} has files, container ${dst} is empty"
  else
    log "target mount ${src} → ${dst}: visible inside the container ($([ "${cont_n}" -gt 0 ] && echo non-empty || echo empty on both sides))"
  fi
done < <(docker inspect "${DUPLICATI_CONTAINER}" --format '{{range .Mounts}}{{.Source}} {{.Destination}}{{"\n"}}{{end}}' \
          | awk '$2 ~ /^\/backups\//')

for m in ${TARGET_MOUNTS}; do
  if mountpoint -q "$m"; then
    pct="$(df --output=pcent "$m" | tail -n1 | tr -dc '0-9')"
    if [ "${pct}" -ge "${DISK_WARN_PCT}" ]; then
      warn "backup target ${m} is ${pct}% full (warn at ${DISK_WARN_PCT}%)"
    else
      log "backup target ${m} is ${pct}% full"
    fi
  else
    warn "backup target ${m} is not mounted"
  fi
done

if [ "$rc" -ne 0 ] || [ "${#ALERTS[@]}" -gt 0 ]; then
  # One combined alert (webhook + /fail), rather than one per job.
  msg="Duplicati: ${#ALERTS[@]} problem(s) — off-disk copies are not being made: $(printf '%s | ' "${ALERTS[@]}")"
  alert "${msg% | }"
  exit 1
fi
log "--- Duplicati check OK ---"
hc_success
