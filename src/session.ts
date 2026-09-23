import { reactive, readonly } from 'vue'
import { api } from './api'
import type { User } from './types'

const state = reactive<{ user: User | null; ready: boolean; setupNeeded: boolean }>({ user: null, ready: false, setupNeeded: false })

async function loadSession() {
  try {
    const result = await api<User | { user?: User; setup_required?: boolean }>('/auth/me')
    if ('setup_required' in result && result.setup_required) {
      state.user = null
      state.setupNeeded = true
    } else if ('user' in result) {
      state.user = result.user || null
    } else {
      state.user = result as User
    }
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    state.user = null
    if (status === 401) {
      try {
        const setup = await api<{ setup_required: boolean }>('/setup/status')
        state.setupNeeded = setup.setup_required
      } catch { state.setupNeeded = false }
    } else state.setupNeeded = false
  } finally { state.ready = true }
}

export const session = readonly(state)
export const setUser = (user: User | null) => { state.user = user; state.ready = true; state.setupNeeded = false }
export { loadSession }
