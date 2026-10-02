import json
import os
import webbrowser
from pathlib import Path
from urllib.parse import urlencode


access_path = os.environ.get("ROUTERPRO_ACCESS")
if not access_path:
    raise SystemExit("Set ROUTERPRO_ACCESS to a private access.json outside the repository")
access = json.loads(Path(access_path).read_text())
query = urlencode({
    "hostname": "192.168.31.1",
    "port": "9090",
    "secret": access["controller_secret"],
})
webbrowser.open("http://192.168.31.1:9090/ui/?" + query)
