import type { FastifyReply, FastifyRequest, onRequestHookHandler } from "fastify";
import type { Database } from "../db/client.js";
import { SESSION_DURATION_MS, validateSession, type SessionUser } from "./sessions.js";

export const SESSION_COOKIE = "openpatatoes_session";

declare module "fastify" {
  interface FastifyRequest {
    /** Utilisateur de la session courante ; renseigné uniquement sur les routes privées. */
    user: SessionUser | null;
  }
}

export interface SessionCookieOptions {
  secure: boolean;
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  { secure }: SessionCookieOptions,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply, { secure }: SessionCookieOptions): void {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/" });
}

/** Hook des routes privées : refuse la requête sans session valide et prolonge la session sinon. */
export function requireSession(db: Database, cookie: SessionCookieOptions): onRequestHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? await validateSession(db, token) : null;
    if (!token || !session) {
      if (token) clearSessionCookie(reply, cookie);
      return reply.code(401).send({ error: "unauthenticated" });
    }
    request.user = session.user;
    setSessionCookie(reply, token, session.expiresAt, cookie);
  };
}

/** Utilisateur de la session, sur une route protégée par `requireSession`. */
export function currentUserId(request: FastifyRequest): string {
  if (!request.user) throw new Error("Route privée appelée sans utilisateur");
  return request.user.id;
}
