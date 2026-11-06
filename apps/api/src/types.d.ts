import 'fastify';
import type { AuthContext } from './services/auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Gesetzt, wenn ein gültiges Session-Cookie vorliegt. */
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    /** Nur für den Login: dort gibt es noch kein CSRF-Token. */
    skipCsrf?: boolean;
  }
}
