import { Router, Request, Response } from 'express';
import pool from '../db/connection';
import { authenticate, generateToken } from '../middleware/auth';

const router = Router();

// BUG-001 (Critical / Security): SQL Injection.
// BUG-017 (Medium / Logic): No try/catch — an error causes an unhandled
//   promise rejection and crashes the process in Node < 15.
// BUG-021 (Low / Performance): SELECT * returns every column including password.
router.get('/search', async (req: Request, res: Response) => {
  const { q } = req.query;
  const users = await pool.query(
    `SELECT * FROM users WHERE name LIKE '%${q}%'`
  );
  res.json(users.rows);
});

// BUG-003 (Critical / Security): Password stored in plain text — no bcrypt.
// BUG-018 (Medium / API): Returns HTTP 200 instead of 201 on resource creation.
// BUG-028 (Medium / Logic): No input validation — title/email/password can be
//   empty, null, or arbitrarily long.
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, password]
    );

    res.status(200).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// BUG-003 (Critical / Security): Comparing plain-text passwords directly.
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1 AND password = $2',
      [email, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const token = generateToken(user.id, user.email);

    res.json({ token, user });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

// BUG-017 (Medium / Logic): No try/catch on this async handler.
// BUG-021 (Low / Performance): SELECT *.
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const user = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.params.id]);
  res.json(user.rows[0]);
});

// BUG-029 (Low / Code Quality): console.log with full request body — passwords
//   or PII may appear in server logs.
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body;
    console.log('Updating user:', req.body);

    const result = await pool.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
      [name, email, req.params.id]
    );

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Update failed' });
  }
});

// BUG-004 (Critical / Security): No `authenticate` middleware — anyone can
//   delete any user account without a valid token.
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch {
    res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
