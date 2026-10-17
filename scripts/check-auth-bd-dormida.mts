// Check sin BD: npx tsx scripts/check-auth-bd-dormida.mts
// Con una URL inalcanzable, Prisma falla de verdad en cada consulta (BD "dormida").
import assert from 'node:assert/strict'
process.env.DATABASE_URL = 'mysql://u:p@127.0.0.1:1/x?connect_timeout=1'
const { authOptions, conReintentos, estaAutorizado } = await import('../src/lib/auth')

let esperas = 0
const orig = globalThis.setTimeout
// @ts-expect-error acelera esperas y las cuenta
globalThis.setTimeout = (f: () => void) => { esperas++; return orig(f, 0) }

await assert.rejects(estaAutorizado('a@b.c'))
assert.equal(esperas, 3, 'reintenta 4 veces (3 esperas)')
const r = await authOptions.callbacks!.signIn!({ user: { email: 'a@b.c' } } as never)
assert.equal(r, '/?error=bd_dormida')

let n = 0
assert.equal(await conReintentos(async () => { if (++n < 3) throw new Error('x'); return 'ok' }), 'ok')
const t = await authOptions.callbacks!.jwt!({ token: {}, user: { email: 'a@b.c' } } as never)
assert.equal(t.rol ?? null, null, 'jwt no concede ADMIN ante error')
console.log('OK')
process.exit(0)
