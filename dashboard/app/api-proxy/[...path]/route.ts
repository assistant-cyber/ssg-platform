import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPSTREAM_API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

// Headers to strip when streaming the body. The root cause of the original
// "empty 200" bug was that Node's fetch transparently decompresses gzip /
// brotli / zstd, so when we pass upstream.body (a ReadableStream of decoded
// bytes) into a new Response we must NOT forward content-encoding — the
// browser would try to gunzip already-decoded bytes and the body would
// appear empty. content-length is also stripped so Vercel re-derives it
// from the actual streamed bytes.
const STREAMED_BODY_HEADERS = new Set([
  'content-encoding',
  'content-length',
]);

// Large body threshold (bytes). Below this, buffering is cheap and avoids
// streaming glitches. Above this, streaming keeps the function fast — a 488KB
// project payload was taking 30–60s end-to-end through the Vercel function
// while buffered, and ~1s when streamed.
const STREAM_THRESHOLD_BYTES = 64 * 1024;

function buildUpstreamUrl(path: string[], search: string): string {
  const normalizedBase = UPSTREAM_API.endsWith('/') ? UPSTREAM_API.slice(0, -1) : UPSTREAM_API;
  const joinedPath = path.map(encodeURIComponent).join('/');
  return `${normalizedBase}/${joinedPath}${search}`;
}

function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return true; // unparseable URL → treat as misconfigured
  }
}

async function proxy(request: NextRequest, path: string[]) {
  // Fail fast if the env var wasn't set on the serverless host. Without this
  // guard the proxy silently fetches http://localhost:8000 inside Vercel's
  // runtime, gets ECONNREFUSED, and returns an empty 200 that surfaces to the
  // browser as an opaque "HTTP 500".
  if (isLoopbackUrl(UPSTREAM_API) && process.env.VERCEL === '1') {
    console.error(
      '[api-proxy] NEXT_PUBLIC_API_URL is unset or points at a loopback address on Vercel. ' +
        'Set it to the public backend URL (e.g. https://ssg-platform-production.up.railway.app).'
    );
    return new Response(
      JSON.stringify({
        detail:
          'API proxy is misconfigured: NEXT_PUBLIC_API_URL is not set on this deployment.',
      }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }

  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }

  // Localtunnel-specific header — only relevant when upstream is a tunnel.
  // Safe to keep unconditionally, but skipping it on direct HTTPS avoids
  // confusing cache/CDN behaviour.
  if (UPSTREAM_API.includes('loca.lt')) {
    headers.set('bypass-tunnel-reminder', '1');
  }
  headers.set('user-agent', 'ssg-dashboard-proxy');

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
  };

  const upstreamUrl = buildUpstreamUrl(path, request.nextUrl.search);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api-proxy] upstream fetch failed for ${upstreamUrl}: ${message}`);
    return new Response(
      JSON.stringify({
        detail: `Upstream API unreachable: ${message}`,
        upstream: UPSTREAM_API,
      }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }

  const responseHeaders = new Headers(upstream.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    responseHeaders.delete(header);
  }

  // Decide stream vs. buffer based on body size. The dashboard's project
  // detail endpoint returns ~488KB (726 photo metadata rows). Buffering that
  // through the Vercel serverless function was pushing responses out to 30–60s.
  // Streaming is the default; small bodies are buffered for the safety of
  // known-good behaviour (error mapping, response inspection).
  const contentLength = Number(upstream.headers.get('content-length') ?? '0');
  const shouldStream = !upstream.body
    ? false
    : contentLength === 0
      ? true // unknown size, stream to be safe
      : contentLength > STREAM_THRESHOLD_BYTES;

  if (shouldStream && upstream.body) {
    for (const header of STREAMED_BODY_HEADERS) {
      responseHeaders.delete(header);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  // Small-body path: buffer and forward. content-length is preserved
  // (Next sets it from the arrayBuffer).
  const upstreamBody = await upstream.arrayBuffer();
  return new Response(upstreamBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}
