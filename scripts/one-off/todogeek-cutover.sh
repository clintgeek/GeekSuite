#!/usr/bin/env bash
# BuJoGeek -> TodoGeek cutover (2026-10-10). One-off, written for Chef to
# read, authorize and run himself:
#
#     cd /mnt/Media/Projects/GeekSuite && bash scripts/one-off/todogeek-cutover.sh
#
# It stops and asks before every step. Answer anything but "y" and it exits
# with nothing further changed; re-running starts over and each step is safe to
# repeat (already-done steps say so and move on).
#
# TodoGeek is OFFLINE from step 1 until step 6 (~15 min, mostly CI).
#
#   1. Freeze      nginx: add todogeek vhost + 410 for bujogeek./bujo.; stop bujogeek
#   2. Push        git push origin main, then wait for Watchtower to redeploy basegeek
#   3. Copy DB     Mongo bujogeek -> todogeek (bujogeek is left intact = rollback)
#   4. Migrate     app key in user prefs, app registry, aiGeek (dry run, then apply)
#   5. Env         apps/todogeek/.env.production + .env.local: bujogeek -> todogeek
#   6. Start       todogeek container up, bujogeek container removed, verify
#   7. Phones      (you) install the new PWA, re-enable reminders
#
# Secrets: Mongo credentials are read from the mongo container's own env inside
# `docker exec` — they never appear in this script, its output, or your shell.
# Env files are edited in place with sed; no values are printed.
#
# ROLLBACK (any point before you drop DB bujogeek):
#   git revert the five rename commits + push; restore the old vhost
#   (~/clintgeek.com_bujogeek.conf.retired -> sites-available, delete the
#   todogeek conf, reload); revert the env sed (todogeek -> bujogeek);
#   docker compose up -d in the old app dir. Writes made in TodoGeek after the
#   cutover would be in DB todogeek only.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SITES=/mnt/Media/Docker/nginx/config/sites-available
NEW_CONF="${ROOT}/scripts/one-off/clintgeek.com_todogeek.conf"
OLD_CONF="${SITES}/clintgeek.com_bujogeek.conf"
RETIRED_CONF="${HOME}/clintgeek.com_bujogeek.conf.retired"
MONGO=datageek_mongodb
MIGRATION=scripts/rename-bujogeek-to-todogeek.js   # inside the basegeek container

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED:\033[0m %s\n' "$*" >&2; exit 1; }
ask()  {
  printf '\n\033[33m?? %s [y/N] \033[0m' "$1"
  read -r a
  [ "$a" = y ] || die "you said no — nothing past this point was done"
}

# Run mongosh in the mongo container as root, credentials from its own env.
mongo_eval() {
  docker exec "${MONGO}" sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "$1"' _ "$1"
}

cd "${ROOT}"

# ------------------------------------------------------------------ preflight
say "Preflight"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "not on main"
[ -f "${NEW_CONF}" ] || die "missing ${NEW_CONF}"
git log --oneline origin/main..HEAD | sed 's/^/   unpushed: /'
note "bujogeek container: $(docker inspect -f '{{.State.Status}}' bujogeek 2>/dev/null || echo 'gone')"
note "DB bujogeek collections: $(mongo_eval 'db.getSiblingDB("bujogeek").getCollectionNames().length')"
note "DB todogeek collections: $(mongo_eval 'db.getSiblingDB("todogeek").getCollectionNames().length')"

# ------------------------------------------------------------------ 0. backup
# Lesson from the real run (2026-10-10): take a fresh suite dump BEFORE the
# first write, not just lean on last night's.
say "0. Fresh suite backup"
ask "Run scripts/backup/backup.sh now? (recommended before any write)"
"${ROOT}/scripts/backup/backup.sh"

# ------------------------------------------------------------------ 1. freeze
say "1. Freeze — nginx swap and stop bujogeek"
note "Copies ${NEW_CONF##*/} into ${SITES}"
note "Moves the bujogeek vhost to ${RETIRED_CONF} (kept for rollback)"
note "Old names answer 410 Gone; todogeek answers 502 until step 6."
ask "Freeze now? TodoGeek/BuJoGeek go offline"
if cmp -s "${NEW_CONF}" "${SITES}/clintgeek.com_todogeek.conf"; then
  note "todogeek vhost already in place"
else
  cp "${NEW_CONF}" "${SITES}/clintgeek.com_todogeek.conf"
fi
if [ -f "${OLD_CONF}" ]; then mv "${OLD_CONF}" "${RETIRED_CONF}"; else note "old vhost already retired"; fi
docker exec NGINX nginx -t || die "nginx -t failed — the old vhost is at ${RETIRED_CONF}; fix before reloading"
docker exec NGINX nginx -s reload
docker stop bujogeek >/dev/null 2>&1 && note "bujogeek stopped" || note "bujogeek already stopped"
note "bujogeek.clintgeek.com -> $(curl -s -o /dev/null -w '%{http_code}' https://bujogeek.clintgeek.com/) (want 410)"

# ------------------------------------------------------------------ 2. push
say "2. Push the rename (CI -> Release images -> Watchtower redeploys the fleet)"
if docker exec basegeek test -f "${MIGRATION}" 2>/dev/null; then
  note "basegeek already runs the new image — skipping the push"
else
  if [ -n "$(git log --oneline origin/main..HEAD)" ]; then
    ask "git push origin main? (every app restarts once)"
    git push origin main
  fi
  note "Waiting for basegeek to run the new image (checks every 30s, gives up after 30 min)..."
  for i in $(seq 1 60); do
    docker exec basegeek test -f "${MIGRATION}" 2>/dev/null && break
    sleep 30
    [ "$i" = 60 ] && die "basegeek never picked up the new image — check CI (gh run list) and Watchtower logs, then re-run"
  done
  note "basegeek redeployed; waiting for healthy..."
  for i in $(seq 1 20); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' basegeek)" = healthy ] && break
    sleep 6
  done
  note "basegeek: $(docker inspect -f '{{.State.Health.Status}}' basegeek)"
fi

# ------------------------------------------------------------------ 3. copy DB
say "3. Copy Mongo DB bujogeek -> todogeek"
# Count DOCUMENTS, not collections: basegeek creates empty collections (and
# their indexes) in todogeek the moment the new image boots.
existing="$(mongo_eval 'const d=db.getSiblingDB("todogeek"); print(d.getCollectionNames().reduce((n,c)=>n+d[c].countDocuments(),0))')"
if [ "${existing}" != 0 ]; then
  note "DB todogeek already holds ${existing} document(s) — skipping the copy."
  note "(If you didn't run this before, stop and look at it: Ctrl-C now.)"
else
  note "DB todogeek has only empty collections (basegeek made them at boot); they're replaced."
  note "DB bujogeek is read, not changed. It stays as the rollback copy."
  ask "Copy it?"
  docker exec "${MONGO}" sh -c '
    set -e
    A="-u $MONGO_INITDB_ROOT_USERNAME -p $MONGO_INITDB_ROOT_PASSWORD --authenticationDatabase admin"
    mongodump $A --quiet --db=bujogeek --archive=/tmp/bujogeek-cutover.arc
    mongorestore $A --quiet --drop --archive=/tmp/bujogeek-cutover.arc --nsFrom="bujogeek.*" --nsTo="todogeek.*"
    rm -f /tmp/bujogeek-cutover.arc'
fi
note "documents per collection, bujogeek vs todogeek:"
mongo_eval 'const a=db.getSiblingDB("bujogeek"), b=db.getSiblingDB("todogeek");
  a.getCollectionNames().sort().forEach(c => print("   ", c.padEnd(22), a[c].countDocuments(), b[c].countDocuments()))'

# ------------------------------------------------------------------ 4. migrate
say "4. Migrate stored app keys (dry run first — read the counts)"
docker exec basegeek node "${MIGRATION}"
ask "Apply the migration above?"
docker exec basegeek node "${MIGRATION}" --apply
note "re-check (should plan nothing):"
docker exec basegeek node "${MIGRATION}" | tail -5

# ------------------------------------------------------------------ 5. env
say "5. Point the app's env at the new name (values not shown)"
ask "Rewrite bujogeek -> todogeek in apps/todogeek/.env.production and .env.local?"
for f in apps/todogeek/.env.production apps/todogeek/.env.local; do
  [ -f "$f" ] || continue
  sed -i -E 's/bujo\.clintgeek/todogeek.clintgeek/g; s/bujogeek/todogeek/g' "$f"
  left="$(grep -i bujo "$f" | cut -d= -f1 | tr '\n' ' ' || true)"
  note "$f: keys still naming bujo: ${left:-none}"
done

# ------------------------------------------------------------------ 6. start
say "6. Start TodoGeek"
ask "Pull and start the todogeek container, then remove the old bujogeek one?"
(cd apps/todogeek && docker compose pull todogeek && docker compose up -d todogeek)
note "waiting for healthy..."
for i in $(seq 1 20); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' todogeek 2>/dev/null)" = healthy ] && break
  sleep 6
done
note "todogeek: $(docker inspect -f '{{.State.Status}} / {{.State.Health.Status}}' todogeek)"
docker rm bujogeek >/dev/null 2>&1 && note "old bujogeek container removed" || note "bujogeek container already gone"

say "Verify"
note "todogeek.clintgeek.com -> $(curl -s -o /dev/null -w '%{http_code}' https://todogeek.clintgeek.com/) (want 200)"
note "bujogeek.clintgeek.com -> $(curl -s -o /dev/null -w '%{http_code}' https://bujogeek.clintgeek.com/) (want 410)"
note "bujo.clintgeek.com     -> $(curl -s -o /dev/null -w '%{http_code}' https://bujo.clintgeek.com/) (want 410)"
note "basegeek health: $(curl -s -m 10 https://basegeek.clintgeek.com/api/health | grep -o '"status":"[a-z]*"')"

# ------------------------------------------------------------------ 7. phones
say "7. Your part"
note "- Open https://todogeek.clintgeek.com and check your tasks and habits are there."
note "- On each phone (yours and Heather's): install the TodoGeek PWA, turn reminders"
note "  back on in Settings, and delete the old BuJoGeek PWA."
note "- Keep DB bujogeek until you're happy; it's the rollback. Drop it later with:"
note "    docker exec datageek_mongodb sh -c 'mongosh -u \"\$MONGO_INITDB_ROOT_USERNAME\" -p \"\$MONGO_INITDB_ROOT_PASSWORD\" --authenticationDatabase admin --eval \"db.getSiblingDB(\\\"bujogeek\\\").dropDatabase()\"'"
echo
