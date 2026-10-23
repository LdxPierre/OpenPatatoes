import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/app.js'
import { createTestDatabase, resetDatabase } from './support/database.js'

describe('gET /api/health', () => {
  const db = createTestDatabase()
  const app = buildTestApp(db)

  beforeEach(() => resetDatabase(db))
  afterAll(async () => {
    await app.close()
    await db.$client.end()
  })

  it('répond que le serveur et la base sont disponibles', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok', database: 'ok' })
  })
})
