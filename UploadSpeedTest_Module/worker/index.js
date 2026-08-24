export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Content-Length',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    };

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const path = url.pathname;

    // GET /ping
    if (request.method === 'GET' && path === '/ping') {
      return new Response(JSON.stringify({ ts: Date.now() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // POST /upload — read & discard body as fast as possible
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
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
