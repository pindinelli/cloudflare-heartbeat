export function requireEnv(env: object, keys: readonly string[]): void {
    const values = env as Record<string, unknown>
    const missing = keys.filter(
        (key) => typeof values[key] !== 'string' || (values[key] as string).trim() === '',
    )
    if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`)
    }
}