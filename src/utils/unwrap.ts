/**
 * Helpers for unwrapping API responses where the server's shape varies across
 * endpoints (some return `{ items, total, page, limit }`, some return
 * `{ data: ... }`, some return the raw value directly).
 *
 * Use in `useQuery` / page loaders so you don't have to spell out the same
 * `res.data?.data ?? res.data?.items ?? res.data ?? []` boilerplate everywhere.
 */

/**
 * Unwrap a list-shaped response into an array.
 * Tries common keys: `items`, `data`, plus role-named buckets the legacy
 * controllers used (`users`, `clients`, `lawyers`, `admins`, etc.).
 */
export function unwrapList<T = any>(
  axiosResponseData: any,
  ...candidateKeys: string[]
): T[] {
  const root = axiosResponseData
  if (root == null) return []
  if (Array.isArray(root)) return root as T[]

  // Caller-supplied keys win first (e.g. `unwrapList(res.data, 'updates')`)
  for (const key of candidateKeys) {
    const v = root[key]
    if (Array.isArray(v)) return v as T[]
  }

  // Fallbacks — most server-side list controllers use `items`, but the chat
  // and a few legacy controllers return `{ chats: [...] }` or `{ messages: [...] }`.
  // Adding them here keeps callers from having to repeat the candidate key.
  if (Array.isArray(root.items)) return root.items as T[]
  if (Array.isArray(root.data)) return root.data as T[]
  if (Array.isArray(root.chats)) return root.chats as T[]
  if (Array.isArray(root.messages)) return root.messages as T[]
  if (root.data && Array.isArray(root.data.items)) return root.data.items as T[]
  return []
}

/**
 * Unwrap a single-object response (e.g. `{ summary: {...} }`,
 * `{ config: {...} }`, `{ data: {...} }`).
 */
export function unwrapObject<T = any>(
  axiosResponseData: any,
  ...candidateKeys: string[]
): T | null {
  const root = axiosResponseData
  if (root == null) return null

  for (const key of candidateKeys) {
    if (root[key] != null) return root[key] as T
  }

  if (root.data != null && typeof root.data === 'object') return root.data as T
  return root as T
}
