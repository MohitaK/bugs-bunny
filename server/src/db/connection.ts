import { Pool } from 'pg';

// BUG-029 (Code Quality): Database credentials hardcoded directly in source.
// Should read from process.env and fail fast if vars are missing.
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'taskmanager',
  user: 'admin',
  password: 'admin123',
  // BUG-031 (Code Quality): No `max` pool size set. Under load the pool will
  // open unlimited connections and exhaust the Postgres connection limit.
});

export default pool;
