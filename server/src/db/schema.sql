-- TaskManager Database Schema

CREATE TABLE users (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(100) NOT NULL,
  email     VARCHAR(255) UNIQUE NOT NULL,
  password  VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- BUG-033: No indexes on user_id / assignee_id / status — every join and filter
-- will do a full table scan once the tasks table grows.
CREATE TABLE tasks (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  status       VARCHAR(50) DEFAULT 'pending',
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  assignee_id  INTEGER REFERENCES users(id),
  due_date     TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- Missing:
--   CREATE INDEX idx_tasks_user_id     ON tasks(user_id);
--   CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
--   CREATE INDEX idx_tasks_status      ON tasks(status);
--   CREATE INDEX idx_tasks_due_date    ON tasks(due_date);

CREATE TABLE task_audit (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  action     VARCHAR(50) NOT NULL,
  user_id    INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
