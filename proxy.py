from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import urllib.error
import json

class ProxyHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/chat':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            req = urllib.request.Request(
                'http://thaillm.or.th/api/v1/chat/completions',
                data=post_data,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer LnSX7myqMIUoBUc6wEd3z9wknZ5qJa2j',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                method='POST'
            )
            
            try:
                with urllib.request.urlopen(req) as response:
                    res_body = response.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(res_body)
            except urllib.error.URLError as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    port = 8000
    print(f"Starting server at http://localhost:{port}")
    print("Please open http://localhost:8000 in your browser.")
    HTTPServer(('', port), ProxyHandler).serve_forever()
