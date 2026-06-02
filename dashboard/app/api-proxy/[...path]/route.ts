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

function buildUpstreamUrl(path: string[], search: string): string {
  const normalizedBase = UPSTREAM_API.endsWith('/') ? UPSTREAM_API.slice(0, -1) : UPSTREAM_API;
  const joinedPath = path.map(encodeURIComponent).join('/');
  return `${normalizedBase}/${joinedPath}${search}`;
}

async function proxy(request: NextRequest, path: string[]) {
  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }

  // Localtunnel blocks browser-looking traffic unless this header is present.
  headers.set('bypass-tunnel-reminder', '1');
  headers.set('user-agent', 'ssg-dashboard-proxy');

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
  };

  const upstream = await fetch(buildUpstreamUrl(path, request.nextUrl.search), init);
  const responseHeaders = new Headers(upstream.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    responseHeaders.delete(header);
  }

  return new Response(upstream.body, {
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
