import type { JwtPayload } from '../core/auth/jwt';

declare global {
  namespace Express {
    interface UserPayload {
      id: string;
      role: string;
      tokenPayload: JwtPayload;
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};
