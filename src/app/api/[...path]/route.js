import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4000';

async function handler(req, { params }) {
  try {
    const resolvedParams = await params;
    const path = (resolvedParams.path || []).join('/');
    const url = new URL(req.url);
    const targetUrl = `${BACKEND_URL}/api/${path}${url.search}`;

    const headers = new Headers();
    req.headers.forEach((val, key) => {
      if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
        headers.set(key, val);
      }
    });

    const options = {
      method: req.method,
      headers,
      redirect: 'manual'
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      const bodyBuffer = await req.arrayBuffer();
      if (bodyBuffer.byteLength > 0) {
        options.body = bodyBuffer;
      }
    }

    const backendRes = await fetch(targetUrl, options);
    const resBody = await backendRes.arrayBuffer();

    const responseHeaders = new Headers();
    backendRes.headers.forEach((val, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        responseHeaders.set(key, val);
      }
    });

    return new NextResponse(resBody, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    console.error('[API Proxy Error]', err);
    return NextResponse.json({ error: 'Backend gateway proxy error: ' + err.message }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export const dynamic = 'force-dynamic';
