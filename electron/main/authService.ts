import { app } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'

export type UserRole = 'creator' | 'user'

export interface AuthUser {
  username: string
  displayName: string
  role: UserRole
}

export interface AuthSession {
  loggedIn: boolean
  user: AuthUser | null
}

interface StoredSession {
  username: string
  role: UserRole
  displayName: string
}

interface BuiltInUser {
  username: string
  password: string
  displayName: string
  role: UserRole
}

const BUILT_IN_USERS: BuiltInUser[] = [
  { username: 'admin', password: '1024', displayName: '创作者', role: 'creator' },
  { username: 'test', password: '123456', displayName: '用户', role: 'user' }
]

let currentSession: AuthSession = { loggedIn: false, user: null }

function getSessionFilePath(): string {
  return join(app.getPath('userData'), 'session.json')
}

async function ensureUserDataDir(): Promise<void> {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

async function saveSession(user: AuthUser): Promise<void> {
  await ensureUserDataDir()
  const payload: StoredSession = {
    username: user.username,
    role: user.role,
    displayName: user.displayName
  }
  await writeFile(getSessionFilePath(), JSON.stringify(payload, null, 2), 'utf8')
}

async function clearStoredSession(): Promise<void> {
  const filePath = getSessionFilePath()
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
}

function findUser(username: string, password: string): AuthUser | null {
  const normalized = username.trim().toLowerCase()
  const match = BUILT_IN_USERS.find(
    (u) => u.username === normalized && u.password === password
  )
  if (!match) return null
  return {
    username: match.username,
    displayName: match.displayName,
    role: match.role
  }
}

export function getCurrentSession(): AuthSession {
  return currentSession
}

export function requireCreator(): AuthUser {
  if (!currentSession.loggedIn || !currentSession.user) {
    throw new Error('请先登录')
  }
  if (currentSession.user.role !== 'creator') {
    throw new Error('仅创作者可执行此操作')
  }
  return currentSession.user
}

export async function ensureAuthenticatedCreator(): Promise<AuthUser> {
  if (!currentSession.loggedIn) {
    await restoreSession()
  }
  return requireCreator()
}

export async function restoreSession(): Promise<AuthSession> {
  const filePath = getSessionFilePath()
  if (!existsSync(filePath)) {
    currentSession = { loggedIn: false, user: null }
    return currentSession
  }

  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw) as StoredSession
    const builtIn = BUILT_IN_USERS.find((u) => u.username === data.username)
    if (!builtIn) {
      await clearStoredSession()
      currentSession = { loggedIn: false, user: null }
      return currentSession
    }

    currentSession = {
      loggedIn: true,
      user: {
        username: builtIn.username,
        displayName: data.displayName || builtIn.displayName,
        role: builtIn.role
      }
    }
    return currentSession
  } catch {
    currentSession = { loggedIn: false, user: null }
    return currentSession
  }
}

export async function login(username: string, password: string): Promise<{
  success: boolean
  session: AuthSession
  message?: string
}> {
  const user = findUser(username, password)
  if (!user) {
    return {
      success: false,
      session: { loggedIn: false, user: null },
      message: '账号或密码错误'
    }
  }

  currentSession = { loggedIn: true, user }
  await saveSession(user)
  return { success: true, session: currentSession }
}

export async function logout(): Promise<AuthSession> {
  currentSession = { loggedIn: false, user: null }
  await clearStoredSession()
  return currentSession
}
