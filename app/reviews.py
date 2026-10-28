"""One latest reviewer proposal per customer and dataset, stored on the local server."""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

class ReviewStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS reviews (dataset TEXT, profile_id TEXT, payload TEXT NOT NULL, PRIMARY KEY (dataset, profile_id))')

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def all(self, dataset):
        with self.connect() as db:
            rows = db.execute('SELECT profile_id, payload FROM reviews WHERE dataset=?', (dataset,)).fetchall()
        return {identifier: json.loads(payload) for identifier, payload in rows}

    def save(self, dataset, profile, decision, note):
        entry = {'decision': decision, 'note': note, 'time': datetime.now(timezone.utc).isoformat(),
            'profileId': profile['id'], 'sourceKind': profile['sourceKind'], 'models': profile['models'],
            'observations': profile['observations']}
        with self.connect() as db:
            db.execute('INSERT INTO reviews(dataset,profile_id,payload) VALUES (?,?,?) ON CONFLICT(dataset,profile_id) DO UPDATE SET payload=excluded.payload',
                (dataset, profile['id'], json.dumps(entry, ensure_ascii=False, allow_nan=False)))
        return entry
