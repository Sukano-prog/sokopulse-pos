#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 10000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def log_message(self, format, *args):
        # Suppress most logs for cleaner output
        pass

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"🚀 SokoPulse POS Server running on port {PORT}")
    print(f"📂 Serving from: {DIRECTORY}")
    print("Press Ctrl+C to stop")
    httpd.serve_forever()
