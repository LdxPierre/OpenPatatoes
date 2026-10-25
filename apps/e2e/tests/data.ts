import type { ProjectsResponse, SessionUser } from '@openpatatoes/shared'

export const user: SessionUser = {
  id: 'u1',
  username: 'marie',
  isAdmin: false,
  opConnected: true,
}

export const projects: ProjectsResponse = {
  projects: [
    { id: 1, identifier: 'potager', name: 'Potager' },
    { id: 2, identifier: 'verger', name: 'Verger' },
  ],
}
