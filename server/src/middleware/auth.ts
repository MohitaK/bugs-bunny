import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// BUG-002 (Critical / Security): JWT secret hardcoded in source.
// Anyone with repo access can forge tokens for any user.
const JWT_SECRET = 'supersecret123';

// BUG-022 (Medium / TypeScript): `req` typed as `any` to avoid properly
// extending the Express Request interface. Loses all type safety downstream.
export function authenticate(req: any, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function generateToken(userId: number, email: string): string {
  // BUG-002 (Critical / Security): Token is issued with no expiry.
  // A stolen token is valid forever.
  return jwt.sign({ userId, email }, JWT_SECRET);
}
