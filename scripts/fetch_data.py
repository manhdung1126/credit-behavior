"""Download the unmodified research files pinned in data/SOURCE.json."""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'

def download(item, source):
    path = DATA / item['path']
    if path.is_file():
        body = path.read_bytes()
        digest = hashlib.sha1(f'blob {len(body)}\0'.encode() + body).hexdigest()
        if digest == item['sha']: return item['path'], 'verified'
    path.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://raw.githubusercontent.com/{source['repository']}/{source['commit']}/{quote(item['path'])}"
    request = Request(url, headers={'User-Agent': 'CreditDesk-data-fetcher/1.0'})
    with urlopen(request, timeout=90) as response:
        body = response.read()
    digest = hashlib.sha1(f'blob {len(body)}\0'.encode() + body).hexdigest()
    if len(body) != item['size'] or digest != item['sha']:
        raise ValueError(f"Checksum mismatch: {item['path']}")
    temporary = path.with_name(path.name + '.part')
    temporary.write_bytes(body)
    temporary.replace(path)
    return item['path'], 'downloaded'

if __name__ == '__main__':
    source = json.loads((DATA / 'SOURCE.json').read_text())
    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks = [pool.submit(download, item, source) for item in source['files']]
        for task in as_completed(tasks):
            name, status = task.result()
            print(f'{status}: {name}', flush=True)
    print(f"Complete: {len(source['files'])} original data files; commit {source['commit']}")
