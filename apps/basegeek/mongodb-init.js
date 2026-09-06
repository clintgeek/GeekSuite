// docker-entrypoint-initdb.d — runs once, on an EMPTY data directory only.
//
// The root user (MONGO_INITDB_ROOT_USERNAME / _PASSWORD) is created by the
// mongo image itself from the environment; nothing here repeats it.
//
// Until 2026-09-06 this file carried a second, hard-coded account
// (`datageek_user`) in a public repository. Nothing in the suite connected as
// it — every app URI uses the root account — so the account was dropped and
// the file made env-driven: set DATAGEEK_APP_USER and DATAGEEK_APP_PASSWORD
// in the mongodb service's `environment:` (from apps/basegeek/.env) to get a
// least-privilege application user on a fresh datastore; leave them unset and
// this script does nothing. Credentials never live in this file again.
const user = process.env.DATAGEEK_APP_USER;
const pwd = process.env.DATAGEEK_APP_PASSWORD;

if (user && pwd) {
  db = db.getSiblingDB('admin');
  db.createUser({
    user,
    pwd,
    roles: [
      { role: 'readWrite', db: 'datageek' },
      { role: 'dbAdmin', db: 'datageek' },
      { role: 'clusterMonitor', db: 'admin' },
    ],
  });
  print(`mongodb-init: created application user ${user}`);
} else {
  print('mongodb-init: DATAGEEK_APP_USER/_PASSWORD unset — no application user created');
}
