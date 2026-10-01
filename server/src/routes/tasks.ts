import { Router, Response } from 'express';
import pool from '../db/connection';
import { authenticate } from '../middleware/auth';

const router = Router();

// BUG-009 (High / Performance): N+1 query — one DB round-trip per task to
//   fetch the assignee. 100 tasks = 101 queries.
// BUG-020 (Medium / Performance): No pagination — returns every task in one go.
// BUG-021 (Low / Performance): SELECT * on tasks.
router.get('/', authenticate, async (req: any, res: Response) => {
  try {
    const tasks = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1',
      [req.user.userId]
    );

    for (const task of tasks.rows) {
      const assignee = await pool.query(
        'SELECT name, email FROM users WHERE id = $1',
        [task.assignee_id]
      );
      task.assignee = assignee.rows[0];
    }

    res.json(tasks.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// BUG-010 (High / Logic): Two related inserts with no transaction. If the
//   audit insert fails the task row exists but has no audit record — the DB
//   is left in a partially consistent state.
// BUG-023 (Medium / TypeScript): Non-null assertion on req.user — if
//   authenticate middleware ever fails silently this throws at runtime.
// BUG-025 (High / Logic): Missing `await` on the audit insert. The promise
//   is floating — errors are silently swallowed and the insert may not
//   complete before the response is sent.
// BUG-028 (Medium / Logic): No input validation on title/description/dueDate.
router.post('/', authenticate, async (req: any, res: Response) => {
  try {
    const { title, description, assigneeId, dueDate } = req.body;
    const userId = req.user!.userId;

    const result = await pool.query(
      `INSERT INTO tasks (title, description, user_id, assignee_id, due_date, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [title, description, userId, assigneeId, dueDate]
    );

    pool.query(
      'INSERT INTO task_audit (task_id, action, user_id) VALUES ($1, $2, $3)',
      [result.rows[0].id, 'created', userId]
    );

    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// BUG-005 (High / Security): Insecure Direct Object Reference (IDOR) — the
//   WHERE clause only filters by task id, not by the authenticated user's id.
//   Any logged-in user can update any other user's task.
// BUG-024 (Medium / Logic): Loose equality (==) used to compare strings.
//   While harmless here, it is inconsistent and can hide type coercion bugs.
router.put('/:id', authenticate, async (req: any, res: Response) => {
  try {
    const { title, description, status, dueDate } = req.body;
    const VALID_STATUSES = ['pending', 'in_progress', 'completed'];

    if (!VALID_STATUSES.includes(status) && status != undefined) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      `UPDATE tasks
          SET title = $1, description = $2, status = $3, due_date = $4,
              updated_at = NOW()
        WHERE id = $5
        RETURNING *`,
      [title, description, status, dueDate, req.params.id]
      // Missing: AND user_id = $6 with req.user.userId
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// BUG-004 (Critical / Security): No `authenticate` middleware — anyone can
//   delete any task without a valid session.
// BUG-005 (High / Security): No ownership check — delete by id only.
router.delete('/:id', async (req: any, res: Response) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// BUG-030 (Low / Code Quality): Magic number 70 — the threshold for "on track"
//   is not named, not configurable, and not explained.
// BUG-031 (Low / Code Quality): This handler runs 4 separate COUNT queries
//   that could be collapsed into one query with conditional aggregation.
//   The function is also mixing data fetching, computation, and response
//   formatting — three distinct responsibilities in one block.
// BUG-029 (Low / Code Quality): console.log exposes internal user IDs and
//   raw query result objects in production logs.
router.get('/stats', authenticate, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;

    const totalResult    = await pool.query(
      'SELECT COUNT(*) FROM tasks WHERE user_id = $1',
      [userId]
    );
    const completedResult = await pool.query(
      "SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND status = 'completed'",
      [userId]
    );
    const pendingResult  = await pool.query(
      "SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND status = 'pending'",
      [userId]
    );
    const overdueResult  = await pool.query(
      `SELECT COUNT(*) FROM tasks
        WHERE user_id = $1
          AND due_date < NOW()
          AND status != 'completed'`,
      [userId]
    );

    const total    = Number(totalResult.rows[0].count);
    const completed = Number(completedResult.rows[0].count);
    const pending  = Number(pendingResult.rows[0].count);
    const overdue  = Number(overdueResult.rows[0].count);

    const completionRate = total === 0 ? 0 : (completed / total) * 100;
    const isOnTrack      = completionRate > 70;

    console.log('Stats for user:', userId, { total, completed, pending, overdue });

    res.json({ total, completed, pending, overdue, completionRate, isOnTrack });
  } catch {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// BUG-032 (Low / Code Quality): Dead code — this function is never called.
// It was an earlier implementation that was superseded but never removed.
async function oldFetchTasksForUser(userId: number) {
  const result = await pool.query(
    'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
    [userId]
  );
  return result.rows;
}

export default router;
