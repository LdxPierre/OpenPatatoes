import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { ensureAdminAccount } from "../src/auth/admin.js";
import { SESSION_COOKIE } from "../src/auth/plugin.js";
import { sessions, users } from "../src/db/schema.js";
import { createTestDatabase, resetDatabase } from "./support/database.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const admin = { username: "admin", password: "mot-de-passe-solide" };

describe("authentification", () => {
  const db = createTestDatabase();
  const app = buildApp({ db, cookie: { secure: true } });

  beforeEach(async () => {
    await resetDatabase(db);
    await ensureAdminAccount(db, admin);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(async () => {
    await app.close();
    await db.$client.end();
  });

  function login(credentials: { username: string; password: string }) {
    return app.inject({ method: "POST", url: "/api/auth/login", payload: credentials });
  }

  async function loginAsAdmin(): Promise<string> {
    const response = await login(admin);
    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
    if (!cookie) throw new Error("cookie de session absent");
    return cookie.value;
  }

  function me(token?: string) {
    return app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: token ? { [SESSION_COOKIE]: token } : {},
    });
  }

  describe("compte administrateur", () => {
    it("existe dès le premier démarrage et peut se connecter", async () => {
      const response = await login(admin);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        user: { id: expect.any(String), username: "admin", isAdmin: true },
      });
    });

    it("n'est ni dupliqué ni modifié par un redémarrage", async () => {
      await ensureAdminAccount(db, { username: "admin", password: "autre-mot-de-passe" });

      expect(await db.select().from(users)).toHaveLength(1);
      expect((await login(admin)).statusCode).toBe(200);
    });

    it("a un mot de passe haché en Argon2id", async () => {
      const [user] = await db.select().from(users).where(eq(users.username, "admin"));

      expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user?.passwordHash).not.toContain(admin.password);
    });
  });

  describe("connexion", () => {
    it("renvoie un cookie de session httpOnly", async () => {
      const response = await login(admin);
      const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);

      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
      expect(cookie?.maxAge).toBe(7 * 24 * 60 * 60);
    });

    it("refuse un mot de passe incorrect", async () => {
      const response = await login({ username: "admin", password: "mauvais-mot-de-passe" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "invalid_credentials" });
      expect(response.cookies).toHaveLength(0);
    });

    it("refuse un identifiant inconnu avec la même erreur", async () => {
      const response = await login({ username: "inconnu", password: admin.password });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "invalid_credentials" });
    });

    it("refuse une requête mal formée", async () => {
      const response = await login({ username: "admin" } as never);

      expect(response.statusCode).toBe(400);
    });
  });

  describe("routes privées", () => {
    it("refusent une requête sans session", async () => {
      const response = await me();

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthenticated" });
    });

    it("refusent un jeton de session inconnu", async () => {
      expect((await me("jeton-invente")).statusCode).toBe(401);
    });

    it("acceptent une requête avec une session valide", async () => {
      const token = await loginAsAdmin();

      const response = await me(token);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ user: { username: "admin", isAdmin: true } });
    });
  });

  describe("expiration glissante", () => {
    it("refuse une session inactive pendant 7 jours", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const token = await loginAsAdmin();

      vi.setSystemTime(Date.now() + 7 * DAY_MS);

      expect((await me(token)).statusCode).toBe(401);
      expect(await db.select().from(sessions)).toHaveLength(0);
    });

    it("prolonge la session à chaque activité", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const token = await loginAsAdmin();

      vi.setSystemTime(Date.now() + 6 * DAY_MS);
      const response = await me(token);
      expect(response.statusCode).toBe(200);
      expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.maxAge).toBe(7 * 24 * 60 * 60);

      vi.setSystemTime(Date.now() + 6 * DAY_MS);
      expect((await me(token)).statusCode).toBe(200);

      vi.setSystemTime(Date.now() + 7 * DAY_MS);
      expect((await me(token)).statusCode).toBe(401);
    });
  });

  describe("déconnexion", () => {
    it("révoque la session côté serveur", async () => {
      const token = await loginAsAdmin();

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        cookies: { [SESSION_COOKIE]: token },
      });

      expect(response.statusCode).toBe(204);
      expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe("");
      expect(await db.select().from(sessions)).toHaveLength(0);
      expect((await me(token)).statusCode).toBe(401);
    });

    it("ne révoque que la session concernée", async () => {
      const first = await loginAsAdmin();
      const second = await loginAsAdmin();

      await app.inject({ method: "POST", url: "/api/auth/logout", cookies: { [SESSION_COOKIE]: first } });

      expect((await me(first)).statusCode).toBe(401);
      expect((await me(second)).statusCode).toBe(200);
    });
  });
});
