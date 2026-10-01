# bugs-bunny

A full-stack TypeScript task manager app built with **intentional bugs** — the goal is to find and fix them.

> This is a portfolio/practice project. Every file contains deliberately planted issues spanning security vulnerabilities, React anti-patterns, backend logic errors, and TypeScript misuse. The bugs are documented and fixed one commit at a time.

---

## Purpose

Practicing real-world bug identification and fixing across a full stack:

- Spotting and fixing **security vulnerabilities** (SQL injection, XSS, IDOR, insecure auth)
- Debugging **React hooks** (stale closures, infinite loops, memory leaks, state mutation)
- Fixing **backend issues** (missing transactions, N+1 queries, unhandled promise rejections)
- Improving **TypeScript** correctness (removing `any`, adding null guards)
- Applying **API design** best practices (correct status codes, pagination, input validation)

---

## Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React 18, TypeScript              |
| Backend  | Node.js, Express, TypeScript      |
| Database | PostgreSQL                        |
| Auth     | JWT                               |

---

## Bug tracker

35 bugs across 4 severity levels, tracked in [`BUGS_REPORT.md`](./BUGS_REPORT.md).

| Severity | Count |
|----------|------:|
| Critical | 5     |
| High     | 10    |
| Medium   | 13    |
| Low      | 7     |

Each bug is fixed in its own commit referencing the bug ID (e.g. `fix(BUG-001): use parameterized query to prevent SQL injection`).

---

## Project structure

```
bugs-bunny/
├── client/               # React frontend
│   └── src/
│       ├── api/          # HTTP client
│       ├── components/   # LoginForm, TaskList, TaskForm, UserProfile
│       ├── hooks/        # useTasks
│       └── types.ts
└── server/               # Express backend
    └── src/
        ├── db/           # PostgreSQL connection + schema
        ├── middleware/   # JWT auth
        └── routes/       # users, tasks
```

---

## Running locally

**Prerequisites:** Node.js 18+, PostgreSQL

```bash
# Database
psql -U postgres -f server/src/db/schema.sql

# Server
cd server
npm install
JWT_SECRET=your_secret npm run dev   # runs on :4000

# Client
cd client
npm install
npm start                             # runs on :3000
```
