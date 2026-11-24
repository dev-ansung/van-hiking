import io, json, os, sys, urllib.request, urllib.error, uuid
sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response
API = "https://api.cloudflare.com/client/v4"
ACCOUNT_ID = "6a61ba2ae8edd10e314785eb1f7734a9"
script = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "index.js"), "rb").read()
boundary = uuid.uuid4().hex
buf = io.BytesIO()
meta = json.dumps({"main_module": "worker.js", "compatibility_date": "2026-11-22",
                   "bindings": [{"type": "d1", "name": "DB", "id": "6255b8d0-18e8-42ef-b494-783df13ab0ca"}]})
buf.write(f"--{boundary}\r\n".encode())
buf.write(b'Content-Disposition: form-data; name="metadata"\r\n\r\n')
buf.write(meta.encode()); buf.write(b"\r\n")
buf.write(f"--{boundary}\r\n".encode())
buf.write(b'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n')
buf.write(b"Content-Type: application/javascript+module\r\n\r\n")
buf.write(script); buf.write(b"\r\n")
buf.write(f"--{boundary}--\r\n".encode())
req = urllib.request.Request(API + f"/accounts/{ACCOUNT_ID}/workers/scripts/vanhiking-api",
    data=buf.getvalue(), method="PUT",
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
add_surrogate_to_request(req, "custom.cloudflare", allowed_hosts=("api.cloudflare.com",))
try:
    r = read_json_response(urllib.request.urlopen(req, timeout=120))
    print("success:", r.get("success"), "| id:", r.get("result", {}).get("id"), "| etag:", r.get("result", {}).get("etag"))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:500])
