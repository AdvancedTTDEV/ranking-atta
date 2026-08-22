import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// La app es same-origin: no exponemos cabeceras CORS. Al responder a los
// preflight OPTIONS sin cabeceras Access-Control-*, los navegadores bloquean
// cualquier request cross-origin hacia la API.
export function middleware(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
