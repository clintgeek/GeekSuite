db = db.getSiblingDB('admin');

// Create a user for the datageek database
db.createUser({
  user: "datageek_user",
  pwd: "DataGeek_User_2024",
  roles: [
    { role: "readWrite", db: "datageek" },
    { role: "dbAdmin", db: "datageek" },
    { role: "clusterMonitor", db: "admin" }  // This role includes serverStatus permission
  ]
});