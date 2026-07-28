export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Full CORS & Cache-Control Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Content-Length',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    };

    // 1. OPTIONS Preflight Request Handling
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Normalize Path (/ping and /api/ping)
    const path = url.pathname.replace(/^\/api/, '');

    // 2. GET /ping -> Measure latency
    if (request.method === 'GET' && path === '/ping') {
      return new Response('pong', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          ...corsHeaders
        }
      });
    }

    // 3. GET /download -> Stream uncompressible binary data
    if (request.method === 'GET' && path === '/download') {
      const sizeParam = url.searchParams.get('bytes') || url.searchParams.get('size');
      const totalSize = sizeParam ? parseInt(sizeParam, 10) : 25000000; // Default 25MB

      let bytesSent = 0;
      const chunkSize = 65536; // 64KB max for crypto.getRandomValues

      const stream = new ReadableStream({
        pull(controller) {
          if (bytesSent >= totalSize) {
            controller.close();
            return;
          }
          const remaining = totalSize - bytesSent;
          const currentChunkSize = Math.min(chunkSize, remaining);
          const chunk = new Uint8Array(currentChunkSize);
          crypto.getRandomValues(chunk);
          controller.enqueue(chunk);
          bytesSent += currentChunkSize;
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': totalSize.toString(),
          ...corsHeaders
        }
      });
    }

    // 4. POST /upload -> Read & discard incoming stream
    if (request.method === 'POST' && path === '/upload') {
      const uploadStart = Date.now();
      let bytesReceived = 0;
      if (request.body) {
        const reader = request.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) bytesReceived += value.length;
          }
        } finally {
          reader.releaseLock();
        }
      }
      const durationMs = Date.now() - uploadStart;

      return new Response(JSON.stringify({ status: 'ok', bytesReceived, durationMs }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // Default 404 Route
    return new Response('Route Not Found', { status: 404, headers: corsHeaders });
  }
};
