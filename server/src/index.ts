import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import usersRouter from './routes/users';
import tasksRouter from './routes/tasks';

const app = express();
const PORT = 3001;

// BUG-007 (High / Security): Wildcard origin combined with credentials: true is
// invalid per the CORS spec and silently broken in most browsers. Even when
// "working", allowing all origins is dangerously permissive for an auth'd API.
app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(express.json());

app.use('/api/users', usersRouter);
app.use('/api/tasks', tasksRouter);

// BUG-006 (High / Security): Global error handler sends the raw stack trace to
// the client. In production this leaks internal file paths, library versions,
// and business logic to an attacker.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: err.message,
    stack: err.stack,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
