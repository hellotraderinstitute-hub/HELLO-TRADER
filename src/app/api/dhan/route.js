import { NextResponse } from 'next/server';

export async function GET(request) {
  const accessToken = request.headers.get('access-token');
  if (!accessToken) {
    return NextResponse.json(
      { errorCode: 'MISSING_TOKEN', errorMessage: 'access-token is required in request headers' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch('https://api.dhan.co/v2/fundlimit', {
      headers: {
        'Content-Type': 'application/json',
        'access-token': accessToken,
      }
    });

    const rawText = await res.text();
    let bodyData;
    try {
      bodyData = JSON.parse(rawText);
    } catch (e) {
      bodyData = { rawResponse: rawText };
    }

    // Capture standard headers
    const responseHeaders = {
      'Content-Type': 'application/json',
    };
    
    // Mirror standard API response
    return new NextResponse(JSON.stringify(bodyData), {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      { errorCode: 'PROXY_ERROR', errorMessage: err.message, stack: err.stack },
      { status: 500 }
    );
  }
}
