import os
import json
import urllib.request
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

def load_env(path='.env'):
    env = {}
    if not os.path.exists(path):
        return env
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            env[key.strip()] = value.strip()
    return env

ENV = load_env()

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/config':
            payload = json.dumps({
                'apiKey': ENV.get('OPENAI_API_KEY', '')
            }).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        elif self.path.startswith('/api/fetch?'):
            qs = urllib.parse.parse_qs(self.path[len('/api/fetch?'):])
            target = qs.get('url', [''])[0]
            if not target:
                self.send_response(400)
                self.end_headers()
                return
            try:
                req = urllib.request.Request(target, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                })
                res = urllib.request.urlopen(req, timeout=15)
                raw = res.read()
                # Detect encoding from HTTP header first
                charset = 'utf-8'
                ct = res.headers.get('Content-Type', '')
                if 'euc-kr' in ct.lower() or 'euckr' in ct.lower():
                    charset = 'euc-kr'
                elif 'ms949' in ct.lower() or 'cp949' in ct.lower():
                    charset = 'ms949'
                else:
                    # Fallback: check <meta charset> in raw bytes
                    raw_peek = raw[:2000].decode('ascii', errors='ignore').lower()
                    if 'euc-kr' in raw_peek or 'euckr' in raw_peek:
                        charset = 'euc-kr'
                    elif 'ms949' in raw_peek or 'ks_c_5601' in raw_peek:
                        charset = 'ms949'
                    else:
                        # Try UTF-8, fallback to EUC-KR
                        try:
                            raw.decode('utf-8')
                            charset = 'utf-8'
                        except UnicodeDecodeError:
                            charset = 'euc-kr'
                html_str = raw.decode(charset, errors='ignore')
                payload = html_str.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except Exception as e:
                err = json.dumps({'error': str(e)}).encode('utf-8')
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(err)

        else:
            super().do_GET()

    def end_headers(self):
        # JS/CSS 파일은 캐시 방지
        if self.path.endswith(('.js', '.css', '.html')):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        if '/api/' in args[0]:
            super().log_message(format, *args)

if __name__ == '__main__':
    port = 8080
    server = HTTPServer(('', port), Handler)
    key_loaded = bool(ENV.get('OPENAI_API_KEY'))
    print(f'Server running: http://localhost:{port}')
    print(f'API 키: {"[OK] .env에서 로드됨" if key_loaded else "[--] .env 없음 (UI에서 입력 필요)"}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped')
