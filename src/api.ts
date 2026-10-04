export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    const baseUrl = import.meta.env.PROD ? 'https://poppydesk-be.aisbirnusantara.com' : ''
    response = await fetch(`${baseUrl}/api${path}`, { credentials: 'include', ...options, headers })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0)
  }
  const text = await response.text()
  let result: unknown = null
  if (text) {
    try { result = JSON.parse(text) } catch { result = text }
  }
  if (!response.ok) {
    const body = result as Record<string, unknown> | null
    const message = body && (body.error || body.message)
    throw new ApiError(typeof message === 'string' ? message : `Request failed (${response.status})`, response.status)
  }
  if (result && typeof result === 'object' && !Array.isArray(result) && 'data' in result) {
    return (result as { data: T }).data
  }
  return result as T
}

export const json = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) })
