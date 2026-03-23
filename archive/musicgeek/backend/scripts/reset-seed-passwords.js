#!/usr/bin/env node
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

const seedUsers = [
  { email: 'chef@guitargeek.com', password: 'chef123', name: 'Chef' },
  { email: 'bob@guitargeek.com', password: 'bob123', name: 'BeginnerBob' },
  { email: 'guru@guitargeek.com', password: 'guru123', name: 'GuitarGuru' },
];

async function resetPasswords() {
  const client = await pool.connect();

  try {
    console.log('🔐 GuitarGeek Password Reset Script');
    console.log('====================================\n');

    for (const user of seedUsers) {
      // Hash the password
      const password_hash = await bcrypt.hash(user.password, 10);

      // Update the user
      const result = await client.query(
        'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING name, email',
        [password_hash, user.email]
      );

      if (result.rows.length > 0) {
        console.log(`✅ Updated password for ${user.name}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Password: ${user.password}\n`);
      } else {
        console.log(`⚠️  User not found: ${user.email}\n`);
      }
    }

    console.log('====================================');
    console.log('✨ Password reset complete!\n');
    console.log('You can now log in with any of the above credentials.');
  } catch (error) {
    console.error('❌ Error resetting passwords:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetPasswords();
