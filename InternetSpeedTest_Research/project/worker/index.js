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
      const chunkSize = 64 * 1024; // 64KB chunks
      const chunk = new Uint8Array(chunkSize);
      for (let i = 0; i < chunkSize; i++) {
        chunk[i] = Math.floor(Math.random() * 256);
      }

      const stream = new ReadableStream({
        pull(controller) {
          if (bytesSent >= totalSize) {
            controller.close();
            return;
          }
          const remaining = totalSize - bytesSent;
          if (remaining < chunkSize) {
            controller.enqueue(chunk.slice(0, remaining));
            bytesSent += remaining;
          } else {
            controller.enqueue(chunk);
            bytesSent += chunkSize;
          }
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

      return new Response(JSON.stringify({ status: 'ok', bytesReceived }), {
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
