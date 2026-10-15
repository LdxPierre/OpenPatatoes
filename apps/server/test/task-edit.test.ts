import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password.js";
import { SESSION_COOKIE } from "../src/auth/plugin.js";
import { users } from "../src/db/schema.js";
import { buildTestApp, connectAs } from "./support/app.js";
import { createTestDatabase, resetDatabase } from "./support/database.js";
import { startFakeOp, type FakeOp, type FakeUser, type FakeWorkPackage } from "./support/fake-op.js";

const alice = { username: "alice", password: "mot-de-passe-alice" };

describe("édition du temps et de l'assigné d'une tâche", () => {
  const db = createTestDatabase();
  let op: FakeOp;
  let app: ReturnType<typeof buildTestApp>;
  let opAlice: FakeUser;
  let opBob: FakeUser;
  let task: FakeWorkPackage;
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
    opBob = op.addUser({ name: "Bob OP", token: "tok-bob" });
    op.addProject({ id: 1, identifier: "alpha", name: "Alpha", memberIds: [opAlice.id, opBob.id] });
    task = op.addWorkPackage({ id: 10, projectId: 1, subject: "Tâche", estimatedTime: "PT8H", remainingTime: "PT4H" });
    session = await connectAs(app, alice, "tok-alice");
  });
  afterAll(async () => {
    await app.close();
    await op.close();
    await db.$client.end();
  });

  function patchTask(taskId: number | string, payload: object) {
    return app.inject({
      method: "PATCH",
      url: `/api/tasks/${taskId}`,
      cookies: { [SESSION_COOKIE]: session },
      payload,
    });
  }

  function getTask(taskId: number) {
    return app.inject({ method: "GET", url: `/api/tasks/${taskId}`, cookies: { [SESSION_COOKIE]: session } });
  }

  it("enregistre le temps estimé et le temps restant, et renvoie la tâche à jour", async () => {
    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 2.5, remainingHours: 0.75 });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      task: {
        id: 10,
        subject: "Tâche",
        lockVersion: 1,
        estimatedHours: 2.5,
        remainingHours: 0.75,
        assignee: null,
        parent: null,
      },
    });
  });

  it.each([
    [2.5, "PT2.5H"],
    [8, "PT8H"],
    [0, "PT0H"],
    [1 / 3, "PT0.3333333333333333H"],
    [0.0000001, "PT0.0000001H"],
  ])("convertit %d heures décimales en durée ISO 8601 %s à l'écriture", async (hours, duration) => {
    const response = await patchTask(10, { lockVersion: 0, estimatedHours: hours, remainingHours: hours });

    expect(response.statusCode).toBe(200);
    expect(task.estimatedTime).toBe(duration);
    expect(task.remainingTime).toBe(duration);
    // Relue, la durée redonne exactement la valeur saisie.
    expect(response.json().task).toMatchObject({ estimatedHours: hours, remainingHours: hours });
  });

  it("ne modifie que les champs envoyés", async () => {
    const response = await patchTask(10, { lockVersion: 0, remainingHours: 1 });

    expect(response.statusCode).toBe(200);
    expect(task.estimatedTime).toBe("PT8H");
    expect(task.remainingTime).toBe("PT1H");
  });

  it("efface un temps mis à null", async () => {
    const response = await patchTask(10, { lockVersion: 0, estimatedHours: null });

    expect(response.statusCode).toBe(200);
    expect(task.estimatedTime).toBeNull();
    expect(response.json().task.estimatedHours).toBeNull();
  });

  it("assigne la tâche à un membre du projet", async () => {
    const response = await patchTask(10, { lockVersion: 0, assigneeId: opBob.id });

    expect(response.statusCode).toBe(200);
    expect(task.assigneeId).toBe(opBob.id);
    expect(response.json().task.assignee).toEqual({ id: opBob.id, name: "Bob OP" });
  });

  it("retire l'assigné de la tâche", async () => {
    task.assigneeId = opAlice.id;

    const response = await patchTask(10, { lockVersion: 0, assigneeId: null });

    expect(response.statusCode).toBe(200);
    expect(task.assigneeId).toBeNull();
    expect(response.json().task.assignee).toBeNull();
  });

  it("renvoie le refus d'OP avec son message, sans rien modifier", async () => {
    const outsider = op.addUser({ name: "Externe", token: "tok-externe" });

    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 3, assigneeId: outsider.id });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "op_rejected",
      message: "OpenProject a refusé la modification : Assignee is not set to one of the allowed values.",
    });
    const reloaded = await getTask(10);
    expect(reloaded.json().task).toMatchObject({ lockVersion: 0, estimatedHours: 8, assignee: null });
  });

  it("restitue chaque message quand OP refuse plusieurs champs", async () => {
    op.interceptNext({
      method: "PATCH",
      path: "/api/v3/work_packages/10",
      status: 422,
      body: {
        _type: "Error",
        errorIdentifier: "urn:openproject-org:api:v3:errors:MultipleErrors",
        message: "Multiple field constraints have been violated.",
        _embedded: {
          errors: [
            { _type: "Error", message: "Work must be greater than or equal to 0." },
            { _type: "Error", message: "Remaining work must be less than or equal to Work." },
          ],
        },
      },
    });

    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 1, remainingHours: 2 });

    expect(response.statusCode).toBe(422);
    expect(response.json().message).toBe(
      "OpenProject a refusé la modification : Work must be greater than or equal to 0. Remaining work must be less than or equal to Work.",
    );
  });

  it.each([
    ["sans lockVersion", { estimatedHours: 2 }],
    ["sans champ modifié", { lockVersion: 0 }],
    ["avec un temps négatif", { lockVersion: 0, estimatedHours: -1 }],
    ["avec un temps non numérique", { lockVersion: 0, remainingHours: "2h" }],
    ["avec un assigné invalide", { lockVersion: 0, assigneeId: 0 }],
    ["avec un champ inconnu", { lockVersion: 0, subject: "Renommée" }],
  ])("refuse une modification %s", async (_case, payload) => {
    const response = await patchTask(10, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_request" });
    expect(task.lockVersion).toBe(0);
  });

  it("traite une tâche masquée par OP comme introuvable ou inaccessible", async () => {
    op.addProject({ id: 2, identifier: "beta", name: "Beta", memberIds: [] });
    op.addWorkPackage({ id: 20, projectId: 2, subject: "Ailleurs" });

    const response = await patchTask(20, { lockVersion: 0, estimatedHours: 1 });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain("introuvable ou inaccessible");
  });

  it("affiche un refus de permission d'OP comme un message clair", async () => {
    op.interceptNext({ method: "PATCH", path: "/api/v3/work_packages/10", status: 403 });

    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 1 });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "op_forbidden" });
  });

  it("distingue OP indisponible d'un refus", async () => {
    op.interceptNext({ method: "PATCH", path: "/api/v3/work_packages/10", status: 503 });

    const response = await patchTask(10, { lockVersion: 0, estimatedHours: 1 });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "op_unavailable" });
  });

  it("exige une session", async () => {
    const response = await app.inject({ method: "PATCH", url: "/api/tasks/10", payload: { lockVersion: 0 } });

    expect(response.statusCode).toBe(401);
  });

  describe("assignés possibles", () => {
    function getAssignees(taskId: number) {
      return app.inject({
        method: "GET",
        url: `/api/tasks/${taskId}/assignees`,
        cookies: { [SESSION_COOKIE]: session },
      });
    }

    it("liste les utilisateurs qu'OP accepte comme assignés de la tâche", async () => {
      op.addUser({ name: "Externe", token: "tok-externe" });

      const response = await getAssignees(10);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        assignees: [
          { id: opAlice.id, name: "Alice OP" },
          { id: opBob.id, name: "Bob OP" },
        ],
      });
    });

    it("ignore les groupes et utilisateurs fictifs, assignables dans OP mais pas ici", async () => {
      op.interceptNext({
        path: "/api/v3/work_packages/10/available_assignees",
        status: 200,
        body: {
          _type: "Collection",
          _embedded: {
            elements: [
              { _type: "User", id: opAlice.id, name: "Alice OP" },
              { _type: "Group", id: 50, name: "Équipe" },
              { _type: "PlaceholderUser", id: 51, name: "À recruter" },
            ],
          },
          _links: {},
        },
      });

      const response = await getAssignees(10);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ assignees: [{ id: opAlice.id, name: "Alice OP" }] });
    });

    it("traite une tâche masquée par OP comme introuvable ou inaccessible", async () => {
      const response = await getAssignees(99);

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toContain("introuvable ou inaccessible");
    });
  });
});
