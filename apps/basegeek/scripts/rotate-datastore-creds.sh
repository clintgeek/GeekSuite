#!/usr/bin/env bash
#
# rotate-datastore-creds.sh — rotate the datageek Mongo admin password (Q58)
#
# WHY THIS EXISTS
#   Q58. Note the premise was corrected on 2026-09-07: a full-history scan (7,847 blobs,
#   all refs) shows the `datageek_admin` password was never committed to this repo. The
#   publicly-committed pair was the unused `datageek_user`, dropped in wave 18. Rotation
#   is still right — the value sat in plaintext across eleven live files and four dead
#   archives, has been read into three AI transcripts, and is short and guessable — and
#   this script is the reusable procedure for the next credential that really is exposed.
#   See DOCS/BURN_QUEUE.md Q58 and DOCS/RUNBOOK.md §13.
#
# WHAT IT DOES
#   1. Reads the current admin pair from apps/basegeek/.env.production (never prints it).
#   2. Verifies that pair authenticates against the datageek_mongodb container.
#   3. Generates a new URI-safe password (openssl rand -hex 24).
#   4. changeUserPassword on admin, then verifies new works and old fails.
#   5. Rewrites every env file in this repo that embeds the old value (backed up first).
#   6. Prints the per-app recreate commands (or runs them with --restart).
#
# SECRETS HYGIENE
#   No `set -x`. No credential is ever echoed, logged or passed on a command line —
#   values reach mongosh through forwarded environment variables (`docker exec -e VAR`),
#   which keeps them out of argv. Output names variables and files, never values.
#
# USAGE
#   ./rotate-datastore-creds.sh                   # dry run: show what would change
#   ./rotate-datastore-creds.sh --apply           # rotate + rewrite env files
#   ./rotate-datastore-creds.sh --apply --restart # also recreate the affected containers
#   ./rotate-datastore-creds.sh --rollback DIR    # undo: set Mongo back to the backed-up
#                                                 # password and restore the env files
#
set -euo pipefail

CONTAINER="datageek_mongodb"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/basegeek/.env.production"
BACKUP_ROOT="${ROTATE_BACKUP_ROOT:-$HOME/.geeksuite/rotation-backups}"

# Directories scanned for the old value. Deliberately excludes .git — history cannot be
# rewritten here, and it is the reason we are rotating in the first place.
SCAN_DIRS=("apps" "archive" "packages" "tools" "DOCS" "scripts")

# Apps whose containers must be recreated to pick up a rewritten env file.
RESTART_APPS=(basegeek bookgeek bujogeek fitnessgeek flockgeek notegeek storygeek)

MODE="dry-run"
RESTART=0
ROLLBACK_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)    MODE="apply" ;;
    --dry-run)  MODE="dry-run" ;;
    --restart)  RESTART=1 ;;
    --rollback) MODE="rollback"; ROLLBACK_DIR="${2:-}"; shift ;;
    -h|--help)  sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

log()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
die()  { printf 'FAILED: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- helpers

# Read one KEY=value from an env file. Prints the value on stdout for capture by a
# caller that keeps it in a variable — never call this where output is logged.
read_env() {
  python3 - "$1" "$2" <<'PY'
import re, sys
key, path = sys.argv[1], sys.argv[2]
m = re.search(rf'^{re.escape(key)}=(.*)$', open(path).read(), re.M)
if not m:
    sys.exit(f'{key} not found in {path}')
print(m.group(1).strip())
PY
}

# Authenticate against Mongo as $M_USER / $M_PASS (both must be exported).
# Returns 0 when the pair is accepted, 1 otherwise.
mongo_auth_ok() {
  docker exec -e M_USER -e M_PASS "$CONTAINER" mongosh --quiet --eval '
    try {
      db.getSiblingDB("admin").auth(process.env.M_USER, process.env.M_PASS);
      print("ok");
    } catch (e) { print("no"); }
  ' 2>/dev/null | grep -qx ok
}

# Set $M_USER's password to $NEW_PASS, authenticating with $M_USER / $M_PASS.
mongo_set_password() {
  docker exec -e M_USER -e M_PASS -e NEW_PASS "$CONTAINER" mongosh --quiet --eval '
    const admin = db.getSiblingDB("admin");
    admin.auth(process.env.M_USER, process.env.M_PASS);
    admin.changeUserPassword(process.env.M_USER, process.env.NEW_PASS);
    print("changed");
  ' | grep -qx changed
}

# Files under SCAN_DIRS containing the literal value in $NEEDLE (repo-relative paths).
files_with_needle() {
  ( cd "$REPO_ROOT" && python3 - "${SCAN_DIRS[@]}" <<'PY'
import os, sys
needle = os.environ['NEEDLE']
skip = {'node_modules', '.git', 'dist', 'build', 'data', 'coverage', '.next'}
for base in sys.argv[1:]:
    if not os.path.isdir(base):
        continue
    for dirpath, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in skip]
        for fn in files:
            p = os.path.join(dirpath, fn)
            try:
                if os.path.islink(p) or os.path.getsize(p) > 2_000_000:
                    continue
                if needle in open(p, errors='replace').read():
                    print(p)
            except OSError:
                continue
PY
  )
}

# Count occurrences of $NEEDLE in the file named by $1.
count_needle() {
  python3 -c '
import os, sys
print(open(sys.argv[1], errors="replace").read().count(os.environ["NEEDLE"]))' "$1"
}

# Literal in-place replacement of $NEEDLE with $REPL in $1. Prints the count replaced.
replace_in_file() {
  python3 -c '
import os, sys
p = sys.argv[1]
old, new = os.environ["NEEDLE"], os.environ["REPL"]
t = open(p, errors="replace").read()
n = t.count(old)
if n:
    open(p, "w").write(t.replace(old, new))
print(n)' "$1"
}

# ---------------------------------------------------------------- rollback

# Order matters: read the live (post-rotation) password out of the env files BEFORE
# restoring them, because that is the only credential that can authenticate right now.
if [[ "$MODE" == "rollback" ]]; then
  [[ -n "$ROLLBACK_DIR" && -d "$ROLLBACK_DIR" ]] || die "--rollback needs an existing backup directory"
  [[ -f "$ROLLBACK_DIR/MANIFEST" ]] || die "$ROLLBACK_DIR has no MANIFEST — not a backup from this script"
  [[ -f "$ROLLBACK_DIR/files/apps/basegeek/.env.production" ]] || die "backup has no basegeek .env.production"

  step "Rollback from $ROLLBACK_DIR"
  M_USER="$(read_env MONGO_INITDB_ROOT_USERNAME "$ENV_FILE")"
  M_PASS="$(read_env MONGO_INITDB_ROOT_PASSWORD "$ENV_FILE")"          # current (new)
  NEW_PASS="$(read_env MONGO_INITDB_ROOT_PASSWORD "$ROLLBACK_DIR/files/apps/basegeek/.env.production")"  # target (old)
  export M_USER M_PASS NEW_PASS
  log "  admin user: $M_USER"

  mongo_auth_ok || die "the pair in $ENV_FILE does not authenticate — cannot roll back automatically"
  mongo_set_password || die "changeUserPassword failed — Mongo still holds the current password"
  log "  Mongo password set back to the backed-up value"

  while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    src="$ROLLBACK_DIR/files/$rel"
    [[ -f "$src" ]] || die "backup missing for $rel"
    install -m 600 "$src" "$REPO_ROOT/$rel"
    log "  restored $rel"
  done < "$ROLLBACK_DIR/MANIFEST"

  step "Recreate the apps to pick it up"
  log "  (cd $REPO_ROOT/apps/basegeek && docker compose up -d --no-deps basegeek)   # datastores untouched"
  for a in "${RESTART_APPS[@]:1}"; do log "  (cd $REPO_ROOT/apps/$a && docker compose up -d)"; done
  exit 0
fi

# ---------------------------------------------------------------- preflight

step "Preflight"
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"
command -v openssl >/dev/null || die "openssl not on PATH"
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -qx true \
  || die "container $CONTAINER is not running"
log "  container $CONTAINER is up"

M_USER="$(read_env MONGO_INITDB_ROOT_USERNAME "$ENV_FILE")"
M_PASS="$(read_env MONGO_INITDB_ROOT_PASSWORD "$ENV_FILE")"
export M_USER M_PASS
log "  admin user: $M_USER (password read from .env.production, length ${#M_PASS})"

mongo_auth_ok || die "the pair in .env.production does not authenticate — fix that before rotating"
log "  current credential authenticates"

# ---------------------------------------------------------------- inventory

step "Files embedding the current password"
NEEDLE="$M_PASS"
export NEEDLE
mapfile -t TARGETS < <(files_with_needle | sort)
[[ ${#TARGETS[@]} -gt 0 ]] || die "no file contains the current password — nothing to rewrite (wrong env file?)"

TOTAL=0
for f in "${TARGETS[@]}"; do
  n="$(count_needle "$REPO_ROOT/$f")"
  TOTAL=$((TOTAL + n))
  printf '  %-45s %s occurrence(s)\n' "$f" "$n"
done
log "  ${#TARGETS[@]} files, $TOTAL occurrences"

if [[ "$MODE" == "dry-run" ]]; then
  step "Dry run — nothing changed"
  log "  would: generate a new 48-char hex password"
  log "  would: changeUserPassword('$M_USER') on admin in $CONTAINER"
  log "  would: rewrite the ${#TARGETS[@]} files above (backed up under $BACKUP_ROOT)"
  log "  would: leave containers alone (add --restart to recreate them)"
  log ""
  log "  Re-run with --apply to do it."
  exit 0
fi

# ---------------------------------------------------------------- apply

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
step "Backing up to $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/files"
chmod 700 "$BACKUP_ROOT" "$BACKUP_DIR" "$BACKUP_DIR/files"
: > "$BACKUP_DIR/MANIFEST"
for f in "${TARGETS[@]}"; do
  mkdir -p "$BACKUP_DIR/files/$(dirname "$f")"
  install -m 600 "$REPO_ROOT/$f" "$BACKUP_DIR/files/$f"
  printf '%s\n' "$f" >> "$BACKUP_DIR/MANIFEST"
done
chmod 600 "$BACKUP_DIR/MANIFEST"
log "  ${#TARGETS[@]} files backed up (mode 600)"

step "Generating the new password"
NEW_PASS="$(openssl rand -hex 24)"   # 48 hex chars: URI-safe, no escaping needed
export NEW_PASS
log "  generated, length ${#NEW_PASS}, hex (URI-safe)"

step "Changing the password in Mongo"
mongo_set_password \
  || die "changeUserPassword did not report success — no file was rewritten, credential unchanged"
log "  password changed"

step "Verifying"
OLD_PASS="$M_PASS"
export M_PASS="$NEW_PASS"
mongo_auth_ok || die "the new credential does not authenticate — restore with: $0 --rollback $BACKUP_DIR"
log "  new credential authenticates"
export M_PASS="$OLD_PASS"
if mongo_auth_ok; then
  die "the OLD credential still authenticates — rotation did not take; investigate before rewriting files"
fi
log "  old credential rejected"
export M_PASS="$NEW_PASS"

step "Rewriting env files"
REPL="$NEW_PASS"
export REPL
for f in "${TARGETS[@]}"; do
  n="$(replace_in_file "$REPO_ROOT/$f")"
  left="$(count_needle "$REPO_ROOT/$f")"
  [[ "$left" == "0" ]] || die "$f still contains the old value after rewrite"
  printf '  %-45s %s replaced\n' "$f" "$n"
done

mapfile -t LEFTOVER < <(files_with_needle | sort)
[[ ${#LEFTOVER[@]} -eq 0 ]] || die "old value still present in: ${LEFTOVER[*]}"
log "  old value gone from the working tree (git history still has it — expected)"

step "Containers"
if [[ "$RESTART" == "1" ]]; then
  for a in "${RESTART_APPS[@]}"; do
    log "  recreating $a"
    # basegeek's compose file doubles as the datastore compose file, and the rewritten
    # MONGO_INITDB_ROOT_PASSWORD counts as config drift on the mongodb service — a plain
    # `up -d` there would recreate the datastores. --no-deps rolls the app alone.
    if [[ "$a" == "basegeek" ]]; then
      ( cd "$REPO_ROOT/apps/$a" && docker compose up -d --no-deps basegeek ) \
        || die "docker compose up -d --no-deps basegeek failed"
    else
      ( cd "$REPO_ROOT/apps/$a" && docker compose up -d ) || die "docker compose up -d failed for $a"
    fi
  done
  log "  all apps recreated — check health next"
else
  log "  not restarted (no --restart). Run, in this order:"
  log "    (cd $REPO_ROOT/apps/basegeek && docker compose up -d --no-deps basegeek)   # datastores untouched"
  for a in "${RESTART_APPS[@]:1}"; do log "    (cd $REPO_ROOT/apps/$a && docker compose up -d)"; done
fi

step "Done"
log "  rollback: $0 --rollback $BACKUP_DIR"
log "  the new password lives only in the env files and Mongo. It was never printed."
