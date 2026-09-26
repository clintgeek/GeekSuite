# GeekSuite Backup & Restore

Built 2026-09-25. Modelled on RallyCenter's `scripts/backup-db.sh` / `pull-prod-backups.sh`
(one timestamp per set, verify before encrypt, age to a public key, staleness alarm, dead-man's
switch), adapted to this box: **our scripts make database-consistent, verified, encrypted dumps;
Duplicati carries them off the disk.**

```
datastores ──backup.sh──▶ /mnt/Media/Projects/GeekSuite-backups ──Duplicati──▶ int_backup (sdc)
 (logical dumps,           sets/<stamp>/*.age + MANIFEST.json      (/projects/)   ext_backup (sdf)
  restore-drilled,         library/bookgeek-books (mirror)                        network share (other building)
  then age-encrypted)                                                             [GoogleDrive: not yet — see Fix now #4]
```

---

## Fix now (Chef — found 2026-09-25 while building this)

These are Duplicati-side problems. Nothing here was changed by the backup work; every fix below
is yours to make. `scripts/backup/check-duplicati.sh` alarms on all of them nightly until fixed.

### 1. The Network job has not succeeded since 2026-05-13 — and its remote is NOT empty

Duplicati says *"Found 18140 files that are missing from the remote storage, please run repair."*
**Don't repair, and don't delete the database.** The files are there:

- On the host, `/mnt/network_backup` (CIFS `//192.168.1.81/backup`) is mounted and holds
  **18,151** entries, `duplicati-*.dlist.zip.aes` etc.
- Inside the `duplicati` container, `/backups/network` is **empty**.
- `journalctl -u mnt-network_backup.mount`: the share **failed to mount at boot** (Sep 23 08:24,
  status 32). The container started at 08:27. The share was mounted some time after that.

A bind mount captures what's at the path *when the container starts*. The share came up after
that, so the container still sees the empty directory underneath it. That's why Duplicati sees
0 of 18,140 files. It's the same class of landmine as the container DNS one: containers pin host
state at start.

**Fix:**
1. On the host, confirm the share is mounted: `mountpoint /mnt/network_backup && ls /mnt/network_backup | head`.
2. Restart Duplicati so it sees the real mount. Pick one:
   - Portainer: Containers → `duplicati` → Restart.
   - Shell: `docker restart duplicati`.
   Do it when no job is running. Int starts at 02:00, Ext at 04:00, Network at 05:00 and GoogleDrive at 06:00 local time.
3. Check that it took: `docker exec duplicati sh -c 'ls /backups/network | wc -l'` should show about 18151.
   `scripts/backup/check-duplicati.sh` should no longer print "stale bind mount".
4. In the Duplicati UI, open **DockerNextCloudProjects Network** and choose **Run now**. Watch it finish.
   Only if it *still* reports missing files once the container can see them, open the job's
   **Advanced → Database… → Repair**. **Delete + recreate** is the last resort. It means
   re-uploading about 430 GiB over the LAN, which takes hours, and it is only justified if the
   remote files really are gone.
5. Stop it recurring:
   - Add `_netdev,nofail,x-systemd.after=network-online.target` to the `/mnt/network_backup` line in `/etc/fstab`, so boot waits for the network.
   - In Duplicati's compose, give that volume `bind: { propagation: rslave }`, so a late mount still reaches the container.

### 2. Ext job: `/mnt/ext_backup` (sdf, 458 GB) is 99% full

The job still succeeds, with warnings, but it is one fat night away from failing.

In the Duplicati UI:
1. Open **DockerNextCloudProjects Ext** → **Edit** → step **5 Options** → **Backup retention**.
2. Choose **Smart backup retention**, or "Delete backups older than" a shorter window. Save.
3. On the job, choose **Advanced → Compact now** to reclaim the space.

Or move the job to a larger disk. Freeing ext_backup is also on `DOCS/SUITE_TODO.md`.

### 3. Give Duplicati its own alarm

Duplicati failed silently for 4½ months. Turn on its native notifications as a second alarm path,
independent of our scripts:

1. In the Duplicati UI, open **Settings** → **Default options**. Use "Edit as text", or "Add advanced option".
2. Add either:
   - `send-http-url=<your webhook or healthchecks URL>` and `send-http-level=Warning,Error,Fatal`, or
   - `send-mail-to=…`, `send-mail-level=Warning,Error,Fatal`, plus the SMTP options.
3. Save. The setting applies to all four jobs.

### 4. Add GeekSuite to the GoogleDrive job (the only copy outside this building)

The GoogleDrive job has no `/projects/` source. Today, GeekSuite's only off-site copy is the
Network job, and that is the broken one in #1.

1. In the Duplicati UI, open **DockerNextCloudProjects GoogleDrive** → **Edit** → step **3 Source Data**.
2. In the folder tree: **Computer → / → projects → GeekSuite-backups**. Tick it.
   Add only this folder, not all of `/projects/`. It holds about 1.5 GB of library plus about 5 MB per nightly set.
3. **Next → Next → Save**.

### 5. Key custody and alarms (from this build)

- **Copy the private key off this box now.**
  - The key is `~/.config/geeksuite/backup-key.age`, mode 600. Store it in Bitwarden as a secure note or attachment.
  - Every dump is encrypted to it. If this box dies, the key dies with it, and every set in every
    Duplicati copy becomes unreadable ciphertext.
  - The matching public key is `scripts/backup/recipient.txt`. It is safe to commit.
- Fill in `~/.config/geeksuite/backup.env`:
  - `HEALTHCHECK_URL` and `VERIFY_HEALTHCHECK_URL` (e.g. two healthchecks.io checks, daily with a 2 h grace period).
  - Optionally `DUPLICATI_HEALTHCHECK_URL` and `ALERT_WEBHOOK`.
- Install the cron lines ([Schedule](#schedule)).

---

## What's covered

| What | How | Where it lands | Verified by |
|---|---|---|---|
| **MongoDB**: all 17 DBs (`userGeek`, `aiGeek`, `fitnessgeek`, `gamegeek`, …) | `mongodump --archive --gzip` in `datageek_mongodb`. Credentials go in as a config on stdin, never on argv | `sets/<stamp>/mongo.archive.gz.age` | Restored into a scratch mongod before encryption. Restored again nightly after decryption. Per-collection counts must equal the dump's own "done dumping … (N documents)" |
| **PostgreSQL**: every DB + roles (`datageek`, `fitnessgeek`, `geekpr`, `guitargeek`, `postgres`) | `pg_dumpall --clean --if-exists` in `datageek_postgres` (local socket, trust) | `postgres.sql.gz.age` | Trailer check. Restored into scratch postgres before and after encryption. Per-table row counts must equal the COPY-block line counts in the dump |
| **InfluxDB 1.8** (`geekdata`: Garmin vitals, request metrics) | `influxd backup -portable` from a **sidecar** sharing the live container's network namespace (RPC `127.0.0.1:8088`). The live container is not written to | `influx.tar.gz.age` | Restored into scratch influxd. Series + field-value counts are recorded at backup time and must match on the nightly re-restore. First run was also checked against live: identical |
| **Env files**: every `apps/*/.env.production` (a glob, so new apps are covered automatically; ThingGeek was picked up on its first night) | tar → age. **Never stored in plaintext** in the backup tree | `env.tar.gz.age` | Decrypt + list nightly; file list must equal MANIFEST |
| **BookGeek library + covers** (`/mnt/extra_space/books`, 1.5 GB) | `rsync -a --delete` mirror. Calibre's `metadata.db` is re-copied with SQLite's online-backup API + `integrity_check`. Plaintext (ebooks aren't secrets) | `library/bookgeek-books/` | File count. A guard skips `--delete` and alerts if the source has under half the mirror's files (unmounted/vanished source) |
| **Manifest** | sizes, sha256 (ciphertext and plaintext), per-collection/table counts, Influx shards, durations | `sets/<stamp>/MANIFEST.json` (plaintext; counts and names only) | sha256 re-checked nightly |

**Why the library is here:** `/mnt/extra_space` is sdc2, the *same physical disk* as
`/mnt/int_backup` (sdc1), and it was in **no** Duplicati job. The mirror puts it on sda and into
Duplicati's `/projects/` jobs, which keep the version history, so one mirror is enough. It also
dedupes, where nightly tarballs wouldn't.

## What's not covered, and why

| What | Why |
|---|---|
| **Redis** (`datageek_redis`) | Sessions, rate-limit counters and refresh-token rotation state are transient by design. Losing them logs people out once. Deliberately skipped |
| **`apps/*/data`** (gamegeek covers/imports 58 MB, notegeek, thinggeek) | Already under `/mnt/Media/Projects`, so Duplicati carries them directly. Encrypted nightly tarballs would defeat Duplicati's dedupe. MANIFEST records their file counts/bytes at set time so a restore can tell whether they drifted. `apps/basegeek/data` is the live datastore directory: dumped logically above, never tarred |
| **Point-in-time across Mongo collections** | Standalone mongod, no oplog, so `--oplog` isn't available. Each collection is consistent; the set spans the ~2 s the dump takes |
| **Raw datastore files** (`apps/basegeek/data/{mongodb,postgres,influxdb}`) | Duplicati *does* copy these today, via `/projects/`, and they can be torn: it logs FileLocked warnings. **The dumps are the restorable copy.** Once a few weeks of dumps have proven themselves, consider excluding `*/GeekSuite/apps/basegeek/data/*` from the Duplicati jobs (job → Edit → 3 Source Data → Filters → Exclude) to save space. Recommended, not done |
| **Off-site copy of GeekSuite** | Only the Network job reaches another building, and it is broken (Fix now #1). GoogleDrive doesn't include it yet (Fix now #4) |

## Where things live

| Path | What | Notes |
|---|---|---|
| `/mnt/Media/Projects/GeekSuite-backups/sets/<YYYYmmdd_HHMMSS>/` | One complete set | Built as `.<stamp>.partial` and renamed only after everything verified, so a set that exists is a set that passed. Mode 700 |
| `/mnt/Media/Projects/GeekSuite-backups/library/bookgeek-books/` | Library mirror | |
| `/mnt/Media/Projects/GeekSuite-backups/logs/` | `backup.log`, `verify.log`, `duplicati-check.log`, `restore.log`, `cron.log` | Names and counts only; audited for secret values on first run: 0 hits |
| `~/.cache/geeksuite-backup/` | Plaintext staging + lock | System disk (sdb), deliberately **outside** `/mnt/Media/Projects`, so an overlapping Duplicati run can never pick up an unencrypted dump. Removed by trap |
| `~/.config/geeksuite/backup-key.age` | age **private** key | Mode 600. Never printed, never committed. **Keep a copy off-box** |
| `~/.config/geeksuite/backup.env` | `HEALTHCHECK_URL`, `VERIFY_HEALTHCHECK_URL`, `DUPLICATI_HEALTHCHECK_URL`, `ALERT_WEBHOOK` | Template: names only |
| `scripts/backup/recipient.txt` | age **public** key | Safe to commit |

The backup tree is a sibling of the repo, not inside it: outside git entirely.

**Retention:** the newest **7** sets locally (`KEEP_SETS`). Duplicati holds the long history of
this tree (its own retention per job), so local tiering would just be duplicated effort. A set is
about 5.5 MB today.

## Schedule

The system clock is America/Chicago and cron runs in local time. Duplicati's Int job starts at
**02:00**, so our set is written well before it, and the same night's Duplicati run carries it.

```cron
# GeekSuite: nightly backup set — dump, restore-drill, encrypt (00:40; done in ~1 min, before Duplicati Int at 02:00)
40 0 * * * /mnt/Media/Projects/GeekSuite/scripts/backup/backup.sh >> /mnt/Media/Projects/GeekSuite-backups/logs/cron.log 2>&1
# GeekSuite: verify newest set — staleness (26h), sha256, decrypt + restore drill vs MANIFEST, Duplicati health (01:15)
15 1 * * * /mnt/Media/Projects/GeekSuite/scripts/backup/verify-latest.sh >> /mnt/Media/Projects/GeekSuite-backups/logs/cron.log 2>&1
# GeekSuite: Duplicati health once all four jobs have run (GoogleDrive ends ~06:35) — catches last night's failures same morning (07:30)
30 7 * * * /mnt/Media/Projects/GeekSuite/scripts/backup/check-duplicati.sh >> /mnt/Media/Projects/GeekSuite-backups/logs/cron.log 2>&1
```

The scripts source `~/.config/geeksuite/backup.env` themselves, so the cron lines carry no
`set -a; . …`. They were tested under `env -i HOME=… PATH=/usr/bin:/bin`.

## Alarms and exit codes

| Script | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| `backup.sh` | set written | failed (partial removed, alerted) | config/tooling | another run holds the lock (no-op) |
| `verify-latest.sh` | newest set fresh, intact, restores with matching counts, Duplicati healthy | stale / missing / corrupt / count mismatch / Duplicati problem | no key / tools | — |
| `check-duplicati.sh` | all jobs healthy (warnings allowed) | a job is stale, its last run failed, its newest notification is an Error, or a target bind mount is stale | can't read Duplicati | — |

- On failure: POST to `ALERT_WEBHOOK`, and ping `<healthcheck>/fail`.
- On success: ping `<healthcheck>`. The dead-man's switch is the only alarm that fires if cron never starts us at all.
- `verify-latest.sh` **will exit 1 every night until Fix now #1 is done.** That is intended.
- **check-duplicati reads Duplicati read-only:**
  - It `docker cp`s the live server DB into a mode-700 temp dir, opens it read-only, and deletes the copy.
  - It selects only job names, `Metadata` `Last*` timestamps/messages, and `Notification`.
  - It never selects `TargetURL`, `Option`, or `ConnectionString`: they hold encrypted credentials.
  - Error text is truncated and URL-stripped.

## Restoring

`scripts/backup/restore.sh --help` has every mode. Anything that writes to a live datastore needs
`--yes`; without it, the script prints the plan and stops.

```sh
cd /mnt/Media/Projects/GeekSuite
scripts/backup/restore.sh --list                                   # sets, with counts and sizes
scripts/backup/restore.sh --set latest --verify                     # full drill of a set; touches nothing live
```

### "I broke one app's data" (most likely case)

1. Look at it first. This leaves a scratch container running (`--network none`):
   `restore.sh --set 20260925_224032 --component mongo --target scratch`.
   Inspect it with `docker exec -it <name> mongosh`.
2. Restore just that database. Dry-run first, then run it for real:
   ```sh
   restore.sh --set 20260925_224032 --component mongo --target live --db gamegeek --dry-run
   restore.sh --set 20260925_224032 --component mongo --target live --db gamegeek --yes
   ```
   This runs `mongorestore --drop` for `gamegeek.*` only. It runs from a sidecar container sharing
   Mongo's network namespace; credentials come from basegeek's `.env.production` via a forwarded
   env var, never on argv.
3. Restart that app's container if it caches anything.

Scratch containers are labelled. The next `backup.sh`/`verify-latest.sh` run sweeps any older than
2 h, so a forgotten plaintext copy doesn't linger.

### "The box / disk died" (full rebuild)

1. Get the set back first:
   - Restore `GeekSuite-backups/` from Duplicati (Int, Ext or Network), or from GoogleDrive once Fix now #4 is done.
   - Put the **private key** from Bitwarden at `~/.config/geeksuite/backup-key.age`, mode 600.
2. Env files: `restore.sh --set S --component env --out ~/restored-env`.
   - This writes into a new mode-700 dir only.
   - Copy each file to `apps/<app>/.env.production` by hand, then delete the dir.
3. Bring up the datastores empty: `apps/basegeek/docker-compose.yml`, with `.env` symlinked to `.env.production` (see RUNBOOK §13).
   Then restore each store:
   - Mongo: `restore.sh --set S --component mongo --target live --with-users --yes`.
     `--with-users` also replays admin users/roles, which an empty Mongo needs. **Never use it against a Mongo that still has its users.** Replaying `system.users` with `--drop` swaps the account the restore is authenticated as, mid-restore, and index builds then fail. This was seen in testing.
   - Postgres: `restore.sh --set S --component postgres --target live --yes`.
     It DROPs and re-creates every database in the dump, so nothing may be connected; stop basegeek first.
   - Influx: see below.
4. Library: `restore.sh --component library --dry-run`, then `--yes`.
   This rsyncs the mirror back without `--delete`, and without owner/group, so it adds and overwrites but removes nothing.
5. Bring the apps up, then run `scripts/backup/verify-latest.sh` to confirm the chain works again.

### Influx

`restore.sh --set S --component influx --target live --yes` restores each database **alongside**
the live one, as `<db>_restored_<stamp>`. It never overwrites; Influx 1.x refuses to restore over
an existing DB. To adopt it, in `influx` as the admin user, pick one:

- **Replace:** `DROP DATABASE geekdata`, then re-run the restore (the name is now free), or
  `influxd restore -portable -db geekdata …` by hand from a decrypted archive.
- **Merge back:** `SELECT * INTO "geekdata"."autogen".:MEASUREMENT FROM "geekdata_restored_<stamp>"."autogen"./.*/ GROUP BY *`.
  Then drop the `_restored` DB.

### Postgres, one database only

`pg_dumpall` is cluster-wide. For a single DB:
1. Restore to scratch: `--component postgres --target scratch`.
2. Stream that DB across. The single quotes make `$POSTGRES_USER` expand inside the container:
   ```sh
   docker exec <scratch> pg_dump -U postgres -Fc <db> \
     | docker exec -i datageek_postgres sh -c 'pg_restore -U "$POSTGRES_USER" --clean --if-exists -d <db>'
   ```

## First run (2026-09-25 22:26 CDT)

| | |
|---|---|
| Duration | **44 s** total: mongo 13 s (incl. drill), postgres 4 s, influx 7 s, library 20 s (first sync; 3 s after) |
| Set size | **5.5 MB**: mongo 1.2 MB, postgres 34 KB, influx 4.4 MB, env 5 KB |
| Mongo | 14 DBs with data, **124 collections, 6,336 documents**. Matches live exactly (live total 6,673 minus 337 in `local`, which isn't dumped). Biggest: aiGeek 1,942, gamegeek 1,418, fitnessgeek 949, storygeek 712, bookgeek 555. The 423 MB on disk is mostly `journal` (201 MB) + `diagnostic.data` (204 MB), not data |
| Postgres | 4 DBs with tables, **37 tables, 166 rows** |
| Influx | `geekdata`: 36 shards, **27 series, 1,258,062 field values**. Identical to a live count taken the same minute |
| Library | 1,632 files, 1.5 GB (source 1,651, minus 19 `.DS_Store`) |
| Restore drill (verify-latest, from ciphertext) | mongo **MATCH** 124/6,336 · postgres **MATCH** 37/166 · influx **MATCH** 27/1,258,062 · env **MATCH**. About 22 s |

The negative paths were tested too:
- a stale set → exit 1;
- one flipped byte in a ciphertext → sha256 FAIL and restore FAIL, exit 1;
- no sets → 1;
- missing key → 2;
- lock held → 3.

The live-restore paths (`--yes`) were exercised against stand-in scratch containers, never production.

## Design notes and landmines found while building

- **Verify before encrypt, and after.** Unlike RallyCenter's VPS, this box holds the private key,
  so both checks run here. The pre-encryption check is a real restore, not just `gzip -t`.
  `mongorestore --dryRun` still needs a server, so it bought nothing over the real restore.
- **Scratch containers use tmpfs + `fsync=off`.** On the overlay layer, the first Mongo drill took
  5 min 18 s for 1.2 MB. On tmpfs it takes about 12 s.
- **`grep -q` under `pipefail` is a trap.** `grep -q` exits on the first match, the writer upstream
  gets SIGPIPE, and the pipeline "fails". The scripts use `grep -c` instead.
- **Scratch containers are started in subshells**, so an array registry of names is lost. Cleanup
  goes by a per-run Docker label instead.
- **Staging is outside `/mnt/Media/Projects`**, because Duplicati's `/projects/` jobs would
  otherwise be free to copy a plaintext dump mid-run.
