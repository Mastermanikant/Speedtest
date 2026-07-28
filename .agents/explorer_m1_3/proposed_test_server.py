"""
Standalone Local Python HTTP Server for Speed Test & Static Files
Serves static assets and provides mock speed test endpoints (/ping, /download, /upload, /cdn-cgi/trace, /__down, /__up).
"""

import os
import sys
import json
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

PORT = 8000
# Root directory of the project (d:\Speed test)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Pre-allocated 1MB buffer of dummy data for streaming downloads
DUMMY_CHUNK = b'X' * (1024 * 1024)

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle incoming requests concurrently using thread pool/mix-in."""
    daemon_threads = True

class SpeedTestRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Mute high-frequency speed test log noise
        if len(args) > 0 and any(ep in str(args[0]) for ep in ["/download", "/upload", "/__down", "/__up"]):
            return
        super().log_message(format, *args)

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Content-Length')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. Latency / Ping Endpoints
        if path in ['/ping', '/api/ping', '/cdn-cgi/trace']:
            body = b"pong\nip=127.0.0.1\nloc=LOCAL\n"
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(body)
            return

        # 2. Download Endpoints (Streams dummy binary data)
        if path in ['/download', '/api/download', '/__down']:
            size_param = query.get('bytes', query.get('size', ['5000000']))[0]
            try:
                total_bytes = int(size_param)
            except ValueError:
                total_bytes = 5000000

            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(total_bytes))
            self._send_cors_headers()
            self.end_headers()

            bytes_sent = 0
            chunk_size = len(DUMMY_CHUNK)
            try:
                while bytes_sent < total_bytes:
                    to_send = min(chunk_size, total_bytes - bytes_sent)
                    if to_send == chunk_size:
                        self.wfile.write(DUMMY_CHUNK)
                    else:
                        self.wfile.write(DUMMY_CHUNK[:to_send])
                    bytes_sent += to_send
            except (ConnectionResetError, BrokenPipeError):
                pass
            return

        # 3. Static File Serving
        rel_path = path.lstrip('/')
        if not rel_path or rel_path == '/':
            rel_path = 'index.html'

        file_path = os.path.normpath(os.path.join(BASE_DIR, rel_path))

        # Security check: path traversal prevention
        if not file_path.startswith(BASE_DIR):
            self.send_error(403, "Forbidden")
            return

        if os.path.exists(file_path) and os.path.isfile(file_path):
            ext = os.path.splitext(file_path)[1].lower()
            mime_types = {
                '.html': 'text/html; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.json': 'application/json; charset=utf-8',
                '.png': 'image/png',
                '.ico': 'image/x-icon',
                '.svg': 'image/svg+xml'
            }
            content_type = mime_types.get(ext, 'application/octet-stream')

            with open(file_path, 'rb') as f:
                content = f.read()

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'text/plain')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(b"404 Not Found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Upload Endpoints (Reads payload & responds 200 OK)
        if path in ['/upload', '/api/upload', '/__up']:
            content_length = int(self.headers.get('Content-Length', 0))
            bytes_read = 0
            chunk_size = 65536

            try:
                while bytes_read < content_length:
                    to_read = min(chunk_size, content_length - bytes_read)
                    data = self.rfile.read(to_read)
                    if not data:
                        break
                    bytes_read += len(data)
            except Exception:
                pass

            response_body = json.dumps({"status": "ok", "bytesReceived": bytes_read}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_body)))
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(response_body)
            return

        self.send_response(404)
        self._send_cors_headers()
        self.end_headers()

def run_server(port=PORT):
    server_address = ('', port)
    httpd = ThreadedHTTPServer(server_address, SpeedTestRequestHandler)
    print(f"🚀 Speed Test Server running at http://127.0.0.1:{port}")
    print(f"📁 Serving static files from: {BASE_DIR}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
