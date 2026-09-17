const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
pool.query('SELECT NOW()')
  .then(res => { console.log('Success:', res.rows[0]); process.exit(0); })
  .catch(err => { console.error('Error:', err); process.exit(1); });
