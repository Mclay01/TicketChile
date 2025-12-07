import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  sub: string; // userId
  role: string;
}

const EXPIRES_IN = '1d';

export function signAccessToken(user: { id: string; role: string }) {
  const payload: JwtPayload = {
    sub: user.id,
    role: user.role
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: EXPIRES_IN
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  // jwt.verify puede devolver string | object
  if (typeof decoded === 'string' || !('sub' in decoded)) {
    throw new Error('Invalid token payload');
  }

  return decoded as JwtPayload;
}
