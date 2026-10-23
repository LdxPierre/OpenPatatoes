import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password.js";
import { SESSION_COOKIE } from "../src/auth/plugin.js";
import { loadConfig } from "../src/config.js";
import { opConnections, users } from "../src/db/schema.js";
import { buildTestApp } from "./support/app.js";
import { createTestDatabase, resetDatabase } from "./support/database.js";
import { startFakeOp, type FakeOp } from "./support/fake-op.js";

const alice = { username: "alice", password: "mot-de-passe-alice" };
const bob = { username: "bob", password: "mot-de-passe-bob" };

describe("jeton OP", () => {
  const db = createTestDatabase();
  let op: FakeOp;
  let app: ReturnType<typeof buildTestApp>;

  beforeAll(async () => {
    op = await startFakeOp();
    app = buildTestApp(db, { opBaseUrl: op.url });
  });
  beforeEach(async () => {
    op.reset();
    await resetDatabase(db);
    for (const account of [alice, bob]) {
      await db.insert(users).values({ username: account.username, passwordHash: await hashPassword(account.password) });
    }
  });
  afterAll(async () => {
    await app.close();
    await op.close();
    await db.$client.end();
  });

  async function loginAs(account: { username: string; password: string }): Promise<string> {
    const response = await app.inject({ method: "POST", url: "/api/auth/login", payload: account });
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
    if (!cookie) throw new Error("cookie de session absent");
    return cookie.value;
  }

  function saveToken(session: string, token: unknown) {
    return app.inject({
      method: "PUT",
      url: "/api/profile/op-connection",
      cookies: { [SESSION_COOKIE]: session },
      payload: { token },
    });
  }

  function getConnection(session: string) {
    return app.inject({
      method: "GET",
      url: "/api/profile/op-connection",
      cookies: { [SESSION_COOKIE]: session },
    });
  }

  function deleteConnection(session: string) {
    return app.inject({
      method: "DELETE",
      url: "/api/profile/op-connection",
      cookies: { [SESSION_COOKIE]: session },
    });
  }

  async function storedRows() {
    return db.select().from(opConnections);
  }

  describe("saisie", () => {
    it("accepte un jeton valide et renvoie l'utilisateur OP correspondant", async () => {
      const opAlice = op.addUser({ name: "Alice Martin", token: "tok-alice" });
      const session = await loginAs(alice);

      const response = await saveToken(session, "tok-alice");

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ opUser: { id: opAlice.id, name: "Alice Martin" } });
    });

    it("refuse un jeton qu'OP ne reconnaît pas, avec un message clair, sans rien stocker", async () => {
      const session = await loginAs(alice);

      const response = await saveToken(session, "tok-inconnu");

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        error: "op_token_invalid",
        message: expect.stringContaining("OpenProject a refusé ce jeton"),
      });
      expect(await storedRows()).toEqual([]);
    });

    it("refuse un jeton vide ou absent", async () => {
      const session = await loginAs(alice);

      for (const token of ["", "   ", undefined, 42]) {
        const response = await saveToken(session, token);
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ error: "invalid_request" });
      }
    });

    it("distingue OP indisponible d'un jeton invalide", async () => {
      const session = await loginAs(alice);
      op.interceptNext({ path: "/api/v3/users/me", status: 503 });

      const response = await saveToken(session, "tok-alice");

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: "op_unavailable" });
      expect(await storedRows()).toEqual([]);
    });

    it("rejette une réponse OP non conforme au schéma attendu", async () => {
      const session = await loginAs(alice);
      op.interceptNext({ path: "/api/v3/users/me", status: 200, body: { _type: "User", id: "pas-un-nombre" } });

      const response = await saveToken(session, "tok-alice");

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ error: "op_invalid_response" });
      expect(await storedRows()).toEqual([]);
    });

    it("exige une session", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/api/profile/op-connection",
        payload: { token: "tok-alice" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("stockage chiffré", () => {
    it("ne conserve jamais le jeton en clair en base", async () => {
      const token = `tok-${randomBytes(16).toString("hex")}`;
      op.addUser({ name: "Alice", token });
      const session = await loginAs(alice);

      await saveToken(session, token);

      const rows = await storedRows();
      expect(rows).toHaveLength(1);
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain(token);
      expect(dump).not.toContain(Buffer.from(token).toString("base64"));
      expect(dump).not.toContain(Buffer.from(token).toString("hex"));
    });

    it("relit le jeton stocké à l'identique pour interroger OP", async () => {
      const opAlice = op.addUser({ name: "Alice", token: "tok-alice" });
      const session = await loginAs(alice);
      await saveToken(session, "tok-alice");

      const response = await getConnection(session);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ opUser: { id: opAlice.id, name: "Alice" } });
    });

    it("refuse un jeton altéré en base au lieu de l'envoyer à OP", async () => {
      op.addUser({ name: "Alice", token: "tok-alice" });
      const session = await loginAs(alice);
      await saveToken(session, "tok-alice");
      const [row] = await storedRows();
      if (!row) throw new Error("connexion OP absente");
      const tampered = row.encryptedToken.slice(0, -2) + (row.encryptedToken.endsWith("AA") ? "BB" : "AA");
      await db.update(opConnections).set({ encryptedToken: tampered }).where(eq(opConnections.userId, row.userId));

      const response = await getConnection(session);

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ error: "op_token_unreadable" });
    });

    it("ne déchiffre pas le jeton d'un utilisateur recopié sur un autre", async () => {
      op.addUser({ name: "Alice", token: "tok-alice" });
      const aliceSession = await loginAs(alice);
      const bobSession = await loginAs(bob);
      await saveToken(aliceSession, "tok-alice");
      const [aliceRow] = await storedRows();
      const [bobUser] = await db.select().from(users).where(eq(users.username, bob.username));
      if (!aliceRow || !bobUser) throw new Error("données de test absentes");
      await db.insert(opConnections).values({ userId: bobUser.id, encryptedToken: aliceRow.encryptedToken });

      const response = await getConnection(bobSession);

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({ error: "op_token_unreadable" });
    });
  });

  describe("remplacement et suppression", () => {
    it("indique qu'aucun jeton n'est enregistré", async () => {
      const session = await loginAs(alice);

      const response = await getConnection(session);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: "op_not_connected" });
    });

    it("utilise le nouveau jeton après un remplacement", async () => {
      op.addUser({ name: "Ancien compte", token: "tok-ancien" });
      const nouveau = op.addUser({ name: "Nouveau compte", token: "tok-nouveau" });
      const session = await loginAs(alice);
      await saveToken(session, "tok-ancien");

      const replaced = await saveToken(session, "tok-nouveau");
      const response = await getConnection(session);

      expect(replaced.statusCode).toBe(200);
      expect(response.json()).toEqual({ opUser: { id: nouveau.id, name: "Nouveau compte" } });
      expect(await storedRows()).toHaveLength(1);
    });

    it("conserve l'ancien jeton si le remplaçant est refusé", async () => {
      const ancien = op.addUser({ name: "Ancien compte", token: "tok-ancien" });
      const session = await loginAs(alice);
      await saveToken(session, "tok-ancien");

      const replaced = await saveToken(session, "tok-invalide");
      const response = await getConnection(session);

      expect(replaced.statusCode).toBe(422);
      expect(response.json()).toEqual({ opUser: { id: ancien.id, name: "Ancien compte" } });
    });

    it("n'interroge plus OP après la suppression du jeton", async () => {
      op.addUser({ name: "Alice", token: "tok-alice" });
      const session = await loginAs(alice);
      await saveToken(session, "tok-alice");

      const deleted = await deleteConnection(session);
      const response = await getConnection(session);

      expect(deleted.statusCode).toBe(204);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: "op_not_connected" });
      expect(await storedRows()).toEqual([]);
    });

    it("signale un jeton révoqué dans OP depuis sa saisie", async () => {
      op.addUser({ name: "Alice", token: "tok-alice" });
      const session = await loginAs(alice);
      await saveToken(session, "tok-alice");
      op.interceptNext({ path: "/api/v3/users/me", status: 401 });

      const response = await getConnection(session);

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: "op_token_invalid" });
    });
  });

  describe("isolement entre utilisateurs", () => {
    it("interroge OP avec le jeton de l'utilisateur courant uniquement", async () => {
      const opAlice = op.addUser({ name: "Alice OP", token: "tok-alice" });
      const opBob = op.addUser({ name: "Bob OP", token: "tok-bob" });
      const aliceSession = await loginAs(alice);
      const bobSession = await loginAs(bob);
      await saveToken(aliceSession, "tok-alice");
      await saveToken(bobSession, "tok-bob");

      const aliceView = await getConnection(aliceSession);
      const bobView = await getConnection(bobSession);

      expect(aliceView.json()).toEqual({ opUser: { id: opAlice.id, name: "Alice OP" } });
      expect(bobView.json()).toEqual({ opUser: { id: opBob.id, name: "Bob OP" } });
    });

    it("ne touche pas le jeton des autres utilisateurs lors d'une suppression", async () => {
      const opBob = op.addUser({ name: "Bob OP", token: "tok-bob" });
      op.addUser({ name: "Alice OP", token: "tok-alice" });
      const aliceSession = await loginAs(alice);
      const bobSession = await loginAs(bob);
      await saveToken(aliceSession, "tok-alice");
      await saveToken(bobSession, "tok-bob");

      await deleteConnection(aliceSession);

      expect((await getConnection(aliceSession)).statusCode).toBe(409);
      expect((await getConnection(bobSession)).json()).toEqual({ opUser: { id: opBob.id, name: "Bob OP" } });
    });
  });
});

describe("clé de chiffrement des jetons OP", () => {
  const baseEnv = {
    DATABASE_URL: "postgres://localhost/openpatatoes",
    OP_BASE_URL: "https://op.example.com",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "mot-de-passe-solide",
  };

  it("empêche le démarrage si elle est absente de l'environnement", () => {
    expect(() => loadConfig(baseEnv)).toThrow(/OP_TOKEN_ENCRYPTION_KEY/);
  });

  it("empêche le démarrage si elle ne fait pas 32 octets", () => {
    const shortKey = randomBytes(16).toString("base64");

    expect(() => loadConfig({ ...baseEnv, OP_TOKEN_ENCRYPTION_KEY: shortKey })).toThrow(/OP_TOKEN_ENCRYPTION_KEY/);
  });

  it("est acceptée sous forme de 32 octets encodés en base64", () => {
    const key = randomBytes(32);

    const config = loadConfig({ ...baseEnv, OP_TOKEN_ENCRYPTION_KEY: key.toString("base64") });

    expect(config.OP_TOKEN_ENCRYPTION_KEY.equals(key)).toBe(true);
  });
});
