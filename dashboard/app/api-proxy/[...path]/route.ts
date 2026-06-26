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

// Headers that don't make sense to forward when we've buffered the upstream
// body. Node's fetch transparently decompresses gzip/brotli/zstd responses,
// so the bytes in the arrayBuffer are already decoded — forwarding the
// content-encoding header alongside them would cause the browser to fail
// decoding and produce an empty body. content-length is recomputed by Next
// from the arrayBuffer.
const BUFFERED_BODY_HEADERS = new Set([
  'content-encoding',
  'content-length',
]);

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

  // Buffer the upstream body. Two reasons we can't pass upstream.body
  // (a ReadableStream) directly into a Response here:
  //   1. Earlier versions stripped content-length while still forwarding a
  //      stream, and Vercel's edge couldn't always re-derive it, producing
  //      empty 200 responses.
  //   2. Node's fetch transparently decompresses gzip/brotli/zstd, so the
  //      bytes we get back are already decoded — but the upstream headers
  //      still carry content-encoding: gzip. Forwarding that header with
  //      decoded bytes causes the browser to fail gunzipping and the page
  //      sees an empty body.
  const upstreamBody = await upstream.arrayBuffer();
  const responseHeaders = new Headers(upstream.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    responseHeaders.delete(header);
  }
  for (const header of BUFFERED_BODY_HEADERS) {
    responseHeaders.delete(header);
  }

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
