#!/usr/bin/env python3
"""
🔍 Debug Memory Issue
Monitor what the frontend is actually sending to the backend
"""

import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

class DebugHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/chat/youtube':
            # Read the request body
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                
                print("=" * 60)
                print(f"📥 FRONTEND REQUEST at {time.strftime('%H:%M:%S')}")
                print("=" * 60)
                print(f"Question: {data.get('question', 'N/A')}")
                print(f"Video ID: {data.get('videoId', 'N/A')}")
                print(f"Session ID: {data.get('sessionId', 'N/A')}")
                print(f"Conversation History: {len(data.get('conversationHistory', []))} messages")
                
                if data.get('conversationHistory'):
                    print("\n💬 Conversation History:")
                    for i, msg in enumerate(data.get('conversationHistory', [])):
                        print(f"  {i+1}. {msg.get('role', 'unknown')}: {msg.get('content', '')[:50]}...")
                
                print("\n🔍 Full Request Body:")
                print(json.dumps(data, indent=2))
                print("=" * 60)
                
                # Send a simple response
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                response = {
                    "success": True,
                    "response": f"Debug: Received request with sessionId={data.get('sessionId', 'NONE')}",
                    "metadata": {
                        "sessionId": data.get('sessionId'),
                        "memoryUsed": bool(data.get('sessionId')),
                        "historyLength": len(data.get('conversationHistory', []))
                    }
                }
                
                self.wfile.write(json.dumps(response).encode())
                
            except Exception as e:
                print(f"❌ Error parsing request: {e}")
                self.send_response(500)
                self.end_headers()
        
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == "__main__":
    print("🔍 Starting Debug Server on http://localhost:3001")
    print("📝 Change NEXT_PUBLIC_TRANSCRIPT_SERVICE_URL to http://localhost:3001 to debug")
    print("👀 Watching for frontend requests...")
    print()
    
    server = HTTPServer(('localhost', 3001), DebugHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Debug server stopped")
        server.shutdown() 