/**
 * Pure planner for the Playnite library import
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md). Given the validated export
 * entries and what the household / this user already has, decide exactly
 * what a commit would write — without touching the database or the clock.
 * The dry-run response and the commit are built from the same plan, so they
 * cannot disagree (the Steam importer's pattern, src/steam/importPlanner.js).
 *
 * Every entry lands in exactly one bucket, so
 *   create + addCopy + update + unchanged + skippedHidden + removedHidden
 *     + skippedDeleted + invalid === total.
 * `notInFile` counts household Playnite copies the file no longer mentions;
 * they are reported, never deleted.
 *
 * Writes are:
 *   creates       new Game documents (with their copies)
 *   gameUpdates   copies pushed onto an existing game + fill-only-empty fields
 *   copyUpdates   an existing copy's `playnite` subdoc refreshed
 *   copyRemovals  Playnite copies hidden in Playnite, pulled off a game that
 *                 keeps other copies (Chef, 2026-10-09)
 *   gameDeletes   games whose every copy was hidden in Playnite — the game and
 *                 every household member's row for it go
 *   playerCreates the importing user's first GamePlayer row for a game
 *   playerUpdates hours (guarded) and lastPlayedAt (a $max) on an existing row
 *   installUpdates Playing follows isInstalled on an existing row: a move to
 *                 Playing, a move off it to Backlog, or clearing a leftover
 *                 "not installed anymore" flag (installDecision below)
 */
import constantsModule from '@geeksuite/schemas/gamegeek/constants';
import { mapEntry, normalizeTitle, cleanList } from './mapping.js';

const { INSTALL_PROMOTES_FROM } = constantsModule;

export const SAMPLE_CAP = 20;

/** Hours sources an import may overwrite. 'manual' is never on this list. */
export const OVERWRITABLE_HOURS_SOURCES = Object.freeze(['playnite', 'steam']);

export function round1(n) {
  return Math.round(n * 10) / 10;
}

/** seconds → hours, one decimal. */
export function hoursFromSeconds(seconds) {
  return round1((Number(seconds) || 0) / 3600);
}

/**
 * Shelf for a GamePlayer row the import creates (and only then). Playing
 * means "installed on the laptop, ready to go" (DOCS/TASTE_MODEL.md), so:
 * any Playnite copy installed → playing; no playtime → backlog; else on-hold.
 * Recent activity no longer means playing.
 */
export function inferShelf({ playtimeSeconds, installed }) {
  if (installed) return 'playing';
  if (!playtimeSeconds || playtimeSeconds <= 0) return 'backlog';
  return 'on-hold';
}

/**
 * Playing follows Playnite's isInstalled, for an EXISTING GamePlayer row
 * (PLAYNITE_IMPORT.md §Installed → Playing). Pure.
 *
 *   - Any Playnite copy installed and the shelf is backlog / on-hold /
 *     unshelved → move to playing, but ONLY at the moment a copy becomes
 *     installed (a flip, or a new copy that arrives installed); a manual
 *     move afterwards sticks. Finished, abandoned, wishlist and custom
 *     shelves are never moved (reinstalling a finished game is not a claim
 *     he's back in it).
 *   - On playing, and every Playnite copy is known to be not installed (null
 *     = not yet known never counts) → move to BACKLOG (Chef, 2026-10-09;
 *     this replaced the "not installed anymore" flag-and-ask). A
 *     non-Playnite copy (Android, Switch) does not keep it on Playing: Chef
 *     doesn't track those installs. Unless the user put it on Playing by
 *     hand (or answered "Still playing") since the last install transition
 *     — `installFlagDismissedAt` — so a manual move sticks until it is
 *     installed and uninstalled again.
 *   - A game with no Playnite copy is never moved (Playnite knows nothing
 *     about it). A leftover flag from the old rule is cleared.
 *
 * @param {object} p
 * @param {object[]} p.playniteCopies the game's Playnite subdocs as they will
 *   be after the commit: `{ isInstalled, installedChangedAt }`
 * @param {object} p.player `{ shelf, installFlag, installFlagDismissedAt }`
 * @returns {{ moveToPlaying: boolean, moveToBacklog: boolean, flag: 'clear'|null, lastChange: Date|null }}
 */
export function installDecision({ playniteCopies, player, becameInstalled = false }) {
  const list = Array.isArray(playniteCopies) ? playniteCopies : [];
  const out = { moveToPlaying: false, moveToBacklog: false, flag: null, lastChange: null };
  if (!player) return out;
  const shelf = player.shelf ?? null;
  const flagged = player.installFlag === 'uninstalled';

  let lastChange = null;
  for (const p of list) {
    const t = time(p.installedChangedAt);
    if (t !== null && (lastChange === null || t > lastChange)) lastChange = t;
  }
  out.lastChange = lastChange === null ? null : new Date(lastChange);

  const anyInstalled = list.some((p) => p.isInstalled === true);
  const noneInstalled = list.length > 0 && list.every((p) => p.isInstalled === false);
  const keptAt = time(player.installFlagDismissedAt);
  const kept = keptAt !== null && !(lastChange !== null && lastChange > keptAt);

  // Promote only when THIS import saw a copy become installed (a flip, or a
  // new copy arriving installed). An installed game Chef moved to Backlog or
  // On hold by hand stays there on every later import.
  out.moveToPlaying = becameInstalled && anyInstalled && INSTALL_PROMOTES_FROM.includes(shelf);
  out.moveToBacklog = shelf === 'playing' && noneInstalled && !kept;
  // The move clears the flag itself; any other leftover flag is just cleared.
  if (flagged && !out.moveToBacklog) out.flag = 'clear';
  return out;
}

/**
 * May the import write `targetHours` over this row? Manual hours someone
 * typed are never overwritten; a 0 is never written over non-zero hours (a
 * store that doesn't track playtime must not erase hours another source
 * measured).
 */
export function mayOverwriteHours(player, targetHours) {
  const current = Number(player?.hoursPlayed) || 0;
  const eligible = OVERWRITABLE_HOURS_SOURCES.includes(player?.hoursSource) || current === 0;
  if (!eligible) return false;
  if (targetHours === 0 && current > 0) return false;
  return round1(current) !== targetHours;
}

const time = (d) => (d ? new Date(d).getTime() : null);

function storedPlaynite(p) {
  return {
    playniteId: p.playniteId,
    providerGameId: p.providerGameId ?? null,
    sourceName: p.sourceName ?? null,
    playtimeSeconds: Number(p.playtimeSeconds) || 0,
    lastActivity: p.lastActivity ? new Date(p.lastActivity) : null,
    hidden: p.hidden === true,
    // null = imported before isInstalled was stored: unknown, filled next import.
    isInstalled: typeof p.isInstalled === 'boolean' ? p.isInstalled : null,
    installedChangedAt: p.installedChangedAt ? new Date(p.installedChangedAt) : null,
  };
}

function playniteDiffers(a, b) {
  return (
    a.providerGameId !== b.providerGameId ||
    a.sourceName !== b.sourceName ||
    a.playtimeSeconds !== b.playtimeSeconds ||
    time(a.lastActivity) !== time(b.lastActivity) ||
    a.hidden !== b.hidden ||
    a.isInstalled !== b.isInstalled
  );
}

function copyFromMapped(m) {
  return {
    platform: m.copyPlatform,
    format: m.format,
    storefront: m.storefront,
    acquiredAt: null,
    notes: '',
    playnite: { ...m.playnite, installedChangedAt: null },
  };
}

function pushSample(list, item) {
  if (list.length < SAMPLE_CAP) list.push(item);
}

/**
 * @param {object} params
 * @param {object[]} params.entries validated export entries (parse.js)
 * @param {object[]} params.existingGames the household's games (lean):
 *   `_id, title, genres, releaseDate, platformsAvailable, externalIds, copies`
 * @param {object[]} params.existingPlayers this user's GamePlayer rows (lean):
 *   `gameId, shelf, hoursPlayed, hoursSource, lastPlayedAt, installFlag, installFlagDismissedAt`
 * @param {string} params.userId
 * @param {boolean} [params.includeHidden=false] also create/keep hidden
 *   entries; when false a hidden entry is never created, and an already
 *   imported hidden copy is removed (Chef, 2026-10-09)
 * @param {Iterable<string>} [params.deletedPlayniteIds] playniteIds someone
 *   deleted from GameGeek (PlayniteTombstone): never created or added again
 * @param {Date} params.now stamps install transitions
 * @param {Iterable<string>} [params.seenPlayniteIds] every playniteId in the
 *   file, including invalid entries, so those don't count as `notInFile`
 * @param {number} [params.invalid=0] entries the parser already rejected
 * @param {number} [params.total] entries in the file (defaults to entries + invalid)
 */
export function planPlayniteImport({
  entries,
  existingGames,
  existingPlayers,
  userId,
  includeHidden = false,
  deletedPlayniteIds,
  now,
  seenPlayniteIds,
  invalid = 0,
  total,
}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('planPlayniteImport: `now` must be a Date');
  const list = Array.isArray(entries) ? entries : [];
  const games = Array.isArray(existingGames) ? existingGames : [];

  // movedToPlaying / movedToBacklog are per-user outcomes, and gamesRemoved
  // counts games, not entries: all three sit outside the
  // create + … + invalid === total sum.
  const counts = {
    create: 0, addCopy: 0, update: 0, unchanged: 0, skippedHidden: 0, removedHidden: 0, skippedDeleted: 0,
    notInFile: 0, invalid, movedToPlaying: 0, movedToBacklog: 0, gamesRemoved: 0,
  };
  const samples = {
    create: [], addCopy: [], update: [], removedHidden: [], notInFile: [], movedToPlaying: [], movedToBacklog: [],
  };
  const deleted = new Set(deletedPlayniteIds ?? []);

  // ── Indexes over what the household already has ────────────────────────
  const byPlayniteId = new Map(); // playniteId → { work, playnite }
  const bySteam = new Map(); // steamAppId → work
  const byTitle = new Map(); // normalized title → work
  const works = []; // every game this import touches or may touch, in first-seen order
  const workById = new Map();

  function workForExisting(game) {
    const id = String(game._id);
    let w = workById.get(id);
    if (w) return w;
    const playniteCopies = new Map();
    for (const c of game.copies ?? []) {
      if (c?.playnite?.playniteId) playniteCopies.set(c.playnite.playniteId, storedPlaynite(c.playnite));
    }
    w = {
      isNew: false,
      gameId: id,
      title: game.title,
      game,
      playniteCopies, // playniteId → playnite subdoc as it will be after the commit
      pushCopies: [],
      removeCopies: [], // playniteIds hidden in Playnite → pulled off this game
      entryKinds: [], // 'create' | 'addCopy' | 'match'
      mapped: [], // mapped entries that belong to this game this run
      touched: false,
    };
    workById.set(id, w);
    return w;
  }

  for (const game of games) {
    const w = workForExisting(game);
    for (const [pid] of w.playniteCopies) if (!byPlayniteId.has(pid)) byPlayniteId.set(pid, w);
    const appId = game.externalIds?.steamAppId;
    if (appId && !bySteam.has(String(appId))) bySteam.set(String(appId), w);
    const key = normalizeTitle(game.title);
    if (key && !byTitle.has(key)) byTitle.set(key, w);
  }

  const playersByGameId = new Map((existingPlayers ?? []).map((p) => [String(p.gameId), p]));
  const seen = new Set(seenPlayniteIds ?? []);
  const inFile = new Set();
  const copyUpdates = [];
  const steamFills = new Map(); // gameId → steamAppId filled on an existing game
  let newKey = 0;

  // ── Match every entry ───────────────────────────────────────────────────
  for (const entry of list) {
    const m = mapEntry(entry);
    seen.add(m.playniteId);
    if (inFile.has(m.playniteId)) {
      // The same playniteId twice in one file is a broken export row.
      counts.invalid += 1;
      continue;
    }
    inFile.add(m.playniteId);

    // 1. Same playniteId → update that copy — or, if it is now hidden in
    //    Playnite, remove it (Chef, 2026-10-09: DLC entries he hid kept
    //    showing up). Unhidden later, it comes back through 2–4 below.
    const hit = byPlayniteId.get(m.playniteId);
    if (hit && !hit.isNew && m.hidden && !includeHidden) {
      hit.removeCopies.push(m.playniteId);
      hit.playniteCopies.delete(m.playniteId);
      byPlayniteId.delete(m.playniteId);
      hit.touched = true;
      counts.removedHidden += 1;
      pushSample(samples.removedHidden, { title: hit.title });
      continue;
    }
    if (hit) {
      const before = hit.playniteCopies.get(m.playniteId);
      // An install transition is stamped with `now`; the first fill of a copy
      // imported before isInstalled existed (null → a value) is not one.
      const flipped = typeof before.isInstalled === 'boolean' && before.isInstalled !== m.playnite.isInstalled;
      const after = { ...m.playnite, installedChangedAt: flipped ? now : before.installedChangedAt ?? null };
      // Only the MOMENT a copy becomes installed promotes to Playing; after
      // that a shelf Chef picks by hand sticks (Chef, 2026-09-25: "it stays").
      if (flipped && m.playnite.isInstalled === true) hit.becameInstalled = true;
      const changed = playniteDiffers(before, after);
      if (changed) {
        copyUpdates.push({ gameId: hit.gameId, playniteId: m.playniteId, set: after });
        hit.playniteCopies.set(m.playniteId, after);
      }
      hit.touched = true;
      hit.mapped.push(m);
      hit.entryKinds.push({ kind: 'match', changed });
      continue;
    }

    if (m.hidden && !includeHidden) {
      counts.skippedHidden += 1;
      continue;
    }
    // Deleted from GameGeek by someone → never brought back (Chef, 2026-10-09).
    if (deleted.has(m.playniteId)) {
      counts.skippedDeleted += 1;
      continue;
    }

    // 2. Same steamAppId, 3. same normalized title → another copy of that game.
    const target = (m.steamAppId && bySteam.get(m.steamAppId)) || byTitle.get(m.normalizedTitle);
    if (target) {
      const copy = copyFromMapped(m);
      if (target.isNew) target.doc.copies.push(copy);
      else target.pushCopies.push(copy);
      target.playniteCopies.set(m.playniteId, { ...copy.playnite });
      byPlayniteId.set(m.playniteId, target);
      target.touched = true;
      target.mapped.push(m);
      target.entryKinds.push({ kind: 'addCopy' });
      if (!target.isNew && m.playnite.isInstalled === true) target.becameInstalled = true;
      counts.addCopy += 1;
      pushSample(samples.addCopy, { title: target.isNew ? target.doc.title : target.title, storefront: m.storefront });
      // Fill-only-empty steamAppId on an existing game, if no other game holds it.
      if (!target.isNew && m.steamAppId && !target.game.externalIds?.steamAppId && !steamFills.has(target.gameId)
        && !bySteam.has(m.steamAppId)) {
        steamFills.set(target.gameId, m.steamAppId);
        bySteam.set(m.steamAppId, target);
      }
      if (m.steamAppId && !bySteam.has(m.steamAppId) && target.isNew && !target.doc.externalIds.steamAppId) {
        target.doc.externalIds.steamAppId = m.steamAppId;
        bySteam.set(m.steamAppId, target);
      }
      continue;
    }

    // 4. Create. Later entries with the same title/steamAppId join it above.
    const key = `new:${newKey++}`;
    const w = {
      isNew: true,
      key,
      title: m.title,
      doc: {
        title: m.title,
        sortTitle: m.sortTitle,
        releaseDate: m.releaseDate,
        genres: m.genres,
        tags: m.tags,
        platformsAvailable: [],
        externalIds: { steamAppId: m.steamAppId },
        copies: [copyFromMapped(m)],
        owned: true,
        source: 'playnite-import',
        createdBy: userId ?? null,
      },
      playniteCopies: new Map([[m.playniteId, { ...m.playnite, installedChangedAt: null }]]),
      entryKinds: [{ kind: 'create' }],
      mapped: [m],
      touched: true,
    };
    works.push(w);
    byPlayniteId.set(m.playniteId, w);
    if (m.steamAppId) bySteam.set(m.steamAppId, w);
    if (!byTitle.has(m.normalizedTitle)) byTitle.set(m.normalizedTitle, w);
    counts.create += 1;
    pushSample(samples.create, { title: m.title, storefront: m.storefront });
  }

  // ── Per game: catalog, then the importing user's row ────────────────────
  const creates = [];
  const gameUpdates = [];
  const playerCreates = [];
  const playerUpdates = [];
  const installUpdates = [];
  const copyRemovals = [];
  const gameDeletes = [];

  // Hidden copies: pulled off the game, or the game goes with its last copy.
  for (const w of workById.values()) {
    if (!w.removeCopies.length) continue;
    const gone = new Set(w.removeCopies);
    const left = (w.game.copies ?? []).filter((c) => !gone.has(c?.playnite?.playniteId)).length + w.pushCopies.length;
    if (left === 0) {
      w.removed = true;
      gameDeletes.push({ gameId: w.gameId, playniteIds: w.removeCopies });
      counts.gamesRemoved += 1;
    } else {
      copyRemovals.push({ gameId: w.gameId, playniteIds: w.removeCopies });
    }
  }

  const touched = [...workById.values(), ...works].filter((w) => w.touched && !w.removed);
  for (const w of touched) {
    const platforms = [];
    for (const m of w.mapped) for (const p of [...m.platforms, m.copyPlatform]) if (!platforms.includes(p)) platforms.push(p);

    let gameLevelChange = false;
    if (w.isNew) {
      const d = w.doc;
      d.platformsAvailable = platforms;
      for (const m of w.mapped) {
        if (!d.releaseDate && m.releaseDate) d.releaseDate = m.releaseDate;
        if (!d.genres.length && m.genres.length) d.genres = m.genres;
      }
      d.tags = cleanList(w.mapped.flatMap((m) => m.tags));
      creates.push({ key: w.key, doc: d });
    } else {
      const g = w.game;
      const set = {};
      if (!(g.genres ?? []).length) {
        const genres = w.mapped.find((m) => m.genres.length)?.genres;
        if (genres) set.genres = genres;
      }
      if (!g.releaseDate) {
        const rd = w.mapped.find((m) => m.releaseDate)?.releaseDate;
        if (rd) set.releaseDate = rd;
      }
      if (steamFills.has(w.gameId)) set['externalIds.steamAppId'] = steamFills.get(w.gameId);
      const have = new Set(g.platformsAvailable ?? []);
      const addPlatforms = platforms.filter((p) => !have.has(p));
      if (w.pushCopies.length || Object.keys(set).length || addPlatforms.length) {
        gameUpdates.push({ gameId: w.gameId, pushCopies: w.pushCopies, set, addPlatforms });
        if (Object.keys(set).length || addPlatforms.length) gameLevelChange = true;
      }
    }

    // Hours and lastPlayedAt come from every Playnite copy the game will
    // have after the commit — including copies this file didn't mention.
    let seconds = 0;
    let newest = null;
    for (const p of w.playniteCopies.values()) {
      seconds += p.playtimeSeconds || 0;
      if (p.lastActivity && (!newest || p.lastActivity > newest)) newest = p.lastActivity;
    }
    const hours = hoursFromSeconds(seconds);
    const ref = w.isNew ? { key: w.key } : { gameId: w.gameId };
    const player = w.isNew ? null : playersByGameId.get(w.gameId);
    let hoursBefore = 0;

    if (!player) {
      playerCreates.push({
        ...ref,
        doc: {
          shelf: inferShelf({
            playtimeSeconds: seconds,
            installed: [...w.playniteCopies.values()].some((p) => p.isInstalled === true),
          }),
          favorite: w.mapped.some((m) => m.favorite),
          hoursPlayed: hours,
          hoursSource: 'playnite',
          lastPlayedAt: newest,
        },
      });
      if (!w.isNew) gameLevelChange = true;
    } else {
      hoursBefore = Number(player.hoursPlayed) || 0;
      const upd = { gameId: w.gameId };
      if (mayOverwriteHours(player, hours)) upd.hoursPlayed = hours;
      if (newest && (!player.lastPlayedAt || newest > new Date(player.lastPlayedAt))) upd.lastPlayedAt = newest;
      if (upd.hoursPlayed !== undefined || upd.lastPlayedAt) {
        playerUpdates.push(upd);
        gameLevelChange = true;
      }
    }

    // Classify this game's playniteId-matched entries. A game-level change
    // (a fill, a new row, new hours) is credited to the first matched entry
    // unless a create/addCopy entry on the same game already explains it.
    const explainedByAdd = w.entryKinds.some((k) => k.kind !== 'match');
    let credited = explainedByAdd;
    let anyUpdate = false;
    for (const k of w.entryKinds) {
      if (k.kind !== 'match') continue;
      if (k.changed || (!credited && gameLevelChange)) {
        counts.update += 1;
        credited = true;
        anyUpdate = true;
      } else {
        counts.unchanged += 1;
      }
    }
    if (anyUpdate) {
      const hoursAfter = playerUpdates.find((u) => u.gameId === w.gameId)?.hoursPlayed ?? (player ? hoursBefore : hours);
      pushSample(samples.update, { title: w.title, hoursBefore: player ? round1(hoursBefore) : null, hoursAfter: round1(hoursAfter) });
    }
  }

  // ── Playing follows isInstalled: every existing row of this user ───────
  // Every household game, not only the ones this file touched: a flag whose
  // condition stopped holding (the user added a Switch copy) still clears.
  // Rows the import creates took their shelf from inferShelf above.
  for (const w of workById.values()) {
    if (w.removed) continue;
    const player = playersByGameId.get(w.gameId);
    if (!player) continue;
    const d = installDecision({ playniteCopies: [...w.playniteCopies.values()], player, becameInstalled: !!w.becameInstalled });
    if (!d.moveToPlaying && !d.moveToBacklog && !d.flag) continue;
    const op = { gameId: w.gameId };
    if (d.moveToPlaying) {
      op.moveToPlaying = true;
      counts.movedToPlaying += 1;
      pushSample(samples.movedToPlaying, { title: w.title, shelfBefore: player.shelf ?? null });
    }
    if (d.moveToBacklog) {
      op.moveToBacklog = true;
      op.lastChange = d.lastChange;
      counts.movedToBacklog += 1;
      pushSample(samples.movedToBacklog, { title: w.title });
    }
    if (d.flag === 'clear') op.flag = 'clear';
    installUpdates.push(op);
  }

  // ── Copies the file no longer mentions: listed, never deleted ───────────
  for (const game of games) {
    for (const c of game.copies ?? []) {
      const pid = c?.playnite?.playniteId;
      if (pid && !seen.has(pid)) {
        counts.notInFile += 1;
        pushSample(samples.notInFile, { title: game.title });
      }
    }
  }

  return {
    total: total ?? list.length + invalid,
    counts,
    samples,
    ops: { creates, gameUpdates, copyUpdates, copyRemovals, gameDeletes, playerCreates, playerUpdates, installUpdates },
  };
}

export default { planPlayniteImport, inferShelf, installDecision, mayOverwriteHours, hoursFromSeconds, round1 };
