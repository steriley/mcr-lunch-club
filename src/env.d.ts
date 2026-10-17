interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role?: string | null;
}

interface AuthSession {
  user: SessionUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
  };
}

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
      session: AuthSession | null;
    }
  }
}

export {};
