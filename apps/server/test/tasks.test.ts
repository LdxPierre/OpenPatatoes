import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password.js";
import { SESSION_COOKIE } from "../src/auth/plugin.js";
import { users } from "../src/db/schema.js";
import { buildTestApp, connectAs } from "./support/app.js";
import { createTestDatabase, resetDatabase } from "./support/database.js";
import { FAKE_STATUSES, startFakeOp, type FakeOp, type FakeUser } from "./support/fake-op.js";

const alice = { username: "alice", password: "mot-de-passe-alice" };

interface TaskNode {
  id: number;
  subject: string;
  status: { id: number; name: string };
  assignee: { id: number; name: string } | null;
  children: TaskNode[];
}

/** Arbre réduit aux identifiants, pour comparer des structures sans le détail des lignes. */
type IdTree = [id: number, children: IdTree[]];
const idTree = (nodes: TaskNode[]): IdTree[] => nodes.map((node) => [node.id, idTree(node.children)]);

describe("arbre des tâches d'un projet", () => {
  const db = createTestDatabase();
  let op: FakeOp;
  let app: ReturnType<typeof buildTestApp>;
  let opAlice: FakeUser;
  let session: string;

  beforeAll(async () => {
    op = await startFakeOp();
    app = buildTestApp(db, { opBaseUrl: op.url });
  });
  beforeEach(async () => {
    op.reset();
    await resetDatabase(db);
    await db.insert(users).values({ username: alice.username, passwordHash: await hashPassword(alice.password) });
    opAlice = op.addUser({ name: "Alice OP", token: "tok-alice" });
    op.addProject({ id: 1, identifier: "alpha", name: "Alpha", memberIds: [opAlice.id] });
    session = await connectAs(app, alice, "tok-alice");
  });
  afterAll(async () => {
    await app.close();
    await op.close();
    await db.$client.end();
  });


  function getTasks(projectId: number | string = 1) {
    return app.inject({ method: "GET", url: `/api/projects/${projectId}/tasks`, cookies: { [SESSION_COOKIE]: session } });
  }

  it("construit l'arbre parent/enfant depuis la liste plate d'OP, racines en premier niveau", async () => {
    op.addWorkPackage({ id: 10, projectId: 1, subject: "Racine A" });
    op.addWorkPackage({ id: 11, projectId: 1, subject: "Enfant A1", parentId: 10 });
    op.addWorkPackage({ id: 12, projectId: 1, subject: "Petit-enfant A1a", parentId: 11 });
    op.addWorkPackage({ id: 20, projectId: 1, subject: "Racine B" });
    op.addWorkPackage({ id: 13, projectId: 1, subject: "Enfant A2", parentId: 10 });

    const response = await getTasks();

    expect(response.statusCode).toBe(200);
    expect(idTree(response.json().tasks)).toEqual([
      [10, [[11, [[12, []]]], [13, []]]],
      [20, []],
    ]);
  });

  it("affiche pour chaque tâche son titre, son état et son assigné", async () => {
    op.addWorkPackage({
      id: 10,
      projectId: 1,
      subject: "Assignée",
      statusId: FAKE_STATUSES.inProgress.id,
      assigneeId: opAlice.id,
    });
    op.addWorkPackage({ id: 11, projectId: 1, subject: "Sans assigné", parentId: 10 });

    const response = await getTasks();

    expect(response.json()).toEqual({
      tasks: [
        {
          id: 10,
          subject: "Assignée",
          status: { id: FAKE_STATUSES.inProgress.id, name: "In progress" },
          assignee: { id: opAlice.id, name: "Alice OP" },
          children: [
            {
              id: 11,
              subject: "Sans assigné",
              status: { id: FAKE_STATUSES.new.id, name: "New" },
              assignee: null,
              children: [],
            },
          ],
        },
      ],
    });
  });

  it("inclut les tâches fermées, qu'OP masque par défaut", async () => {
    op.addWorkPackage({ id: 10, projectId: 1, subject: "Fermée", statusId: FAKE_STATUSES.closed.id });
    op.addWorkPackage({ id: 11, projectId: 1, subject: "Ouverte sous une fermée", parentId: 10 });

    const response = await getTasks();

    expect(idTree(response.json().tasks)).toEqual([[10, [[11, []]]]]);
  });

  it("conserve l'ordre d'OP pour les racines et les enfants", async () => {
    op.addWorkPackage({ id: 30, projectId: 1, subject: "C" });
    op.addWorkPackage({ id: 10, projectId: 1, subject: "A" });
    op.addWorkPackage({ id: 32, projectId: 1, subject: "C2", parentId: 30 });
    op.addWorkPackage({ id: 31, projectId: 1, subject: "C1", parentId: 30 });
    op.addWorkPackage({ id: 20, projectId: 1, subject: "B" });

    const response = await getTasks();

    expect(idTree(response.json().tasks)).toEqual([
      [30, [[32, []], [31, []]]],
      [10, []],
      [20, []],
    ]);
  });

  it("place à la racine une tâche dont le parent est absent de la réponse", async () => {
    // Parent dans un autre projet, ou invisible avec ce jeton.
    op.addProject({ id: 2, identifier: "beta", name: "Beta", memberIds: [] });
    op.addWorkPackage({ id: 99, projectId: 2, subject: "Parent ailleurs" });
    op.addWorkPackage({ id: 10, projectId: 1, subject: "Orpheline", parentId: 99 });
    op.addWorkPackage({ id: 11, projectId: 1, subject: "Enfant de l'orpheline", parentId: 10 });

    const response = await getTasks();

    expect(response.statusCode).toBe(200);
    expect(idTree(response.json().tasks)).toEqual([[10, [[11, []]]]]);
  });

  it("ne perd aucune tâche si OP renvoie une boucle de parents", async () => {
    op.addWorkPackage({ id: 10, projectId: 1, subject: "A", parentId: 11 });
    op.addWorkPackage({ id: 11, projectId: 1, subject: "B", parentId: 10 });
    op.addWorkPackage({ id: 12, projectId: 1, subject: "C", parentId: 11 });

    const response = await getTasks();

    expect(response.statusCode).toBe(200);
    expect(idTree(response.json().tasks)).toEqual([[10, [[11, [[12, []]]]]]]);
  });

  it("suit toutes les pages d'OP et tient plusieurs milliers de tâches", async () => {
    const roots = 500;
    const childrenPerRoot = 5;
    let id = 1;
    for (let root = 0; root < roots; root++) {
      const rootId = id++;
      op.addWorkPackage({ id: rootId, projectId: 1, subject: `Racine ${rootId}` });
      for (let child = 0; child < childrenPerRoot; child++) {
        op.addWorkPackage({ id: id++, projectId: 1, subject: `Enfant ${id}`, parentId: rootId });
      }
    }

    const response = await getTasks();

    expect(response.statusCode).toBe(200);
    const tasks: TaskNode[] = response.json().tasks;
    expect(tasks).toHaveLength(roots);
    expect(tasks.flatMap((task) => [task, ...task.children])).toHaveLength(roots * (1 + childrenPerRoot));
    expect(tasks.every((task) => task.children.length === childrenPerRoot)).toBe(true);
  });

  it("renvoie un arbre vide pour un projet sans tâche", async () => {
    const response = await getTasks();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tasks: [] });
  });

  it("traite un projet masqué par OP comme introuvable ou inaccessible", async () => {
    op.addProject({ id: 2, identifier: "beta", name: "Beta", memberIds: [] });

    const response = await getTasks(2);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "op_not_found",
      message: expect.stringContaining("introuvable ou inaccessible"),
    });
  });

  it("affiche un refus d'accès d'OP comme un message clair", async () => {
    op.interceptNext({ path: "/api/v3/projects/1/work_packages", status: 403 });

    const response = await getTasks();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "op_forbidden",
      message: expect.stringContaining("refuse l'accès à ce projet"),
    });
  });

  it("distingue OP indisponible d'un refus d'accès", async () => {
    op.interceptNext({ path: "/api/v3/projects/1/work_packages", status: 503 });

    const response = await getTasks();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "op_unavailable" });
  });

  it("rejette une réponse OP non conforme au schéma attendu", async () => {
    op.interceptNext({
      path: "/api/v3/projects/1/work_packages",
      status: 200,
      body: { _type: "Collection", _embedded: { elements: [{ _type: "WorkPackage", id: 1 }] }, _links: {} },
    });

    const response = await getTasks();

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: "op_invalid_response" });
  });

  it("refuse un identifiant de projet invalide", async () => {
    const response = await getTasks("abc");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_request" });
  });

  it("exige une session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/projects/1/tasks" });

    expect(response.statusCode).toBe(401);
  });
});
