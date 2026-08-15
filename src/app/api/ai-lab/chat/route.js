import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const renderBackendUrl = process.env.BACKEND_URL || 'https://hello-trader.onrender.com';
    
    console.log(`[Vercel API Route] Forwarding /api/ai-lab/chat query="${body.userQuery}" to ${renderBackendUrl}`);

    const response = await fetch(`${renderBackendUrl}/api/ai-lab/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-LAB-REQUEST-ID': 'vercel_' + Date.now()
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Vercel API Route Error]:', error);
    return NextResponse.json({
      success: false,
      error: 'Backend Connection Failure',
      message: error.message
    }, { status: 502 });
  }
}
