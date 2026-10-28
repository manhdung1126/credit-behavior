"""Persist each browser's desk without changing another browser's selection."""
import json
import sqlite3


class WorkspaceStore:
    def __init__(self, database):
        self.database = database
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS workspace_views (client TEXT PRIMARY KEY, source TEXT NOT NULL, route TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS workspace_desks (client TEXT, dataset TEXT, payload TEXT NOT NULL, PRIMARY KEY (client, dataset))')

    def connect(self):
        return sqlite3.connect(self.database, timeout=10)

    def view(self, client):
        with self.connect() as db:
            row = db.execute('SELECT source, route FROM workspace_views WHERE client=?', (client,)).fetchone()
        return dict(source=row[0], route=row[1]) if row else dict(source='original', route='catalog')

    def save_view(self, client, source, route):
        with self.connect() as db:
            db.execute('INSERT INTO workspace_views VALUES (?, ?, ?) ON CONFLICT(client) DO UPDATE SET source=excluded.source, route=excluded.route', (client, source, route))
        return dict(source=source, route=route)

    def initial(self, service):
        ids = [str(i) for i in service.case_ids]
        with self.connect() as db:
            reviewed = db.execute('SELECT profile_id FROM reviews WHERE dataset=? ORDER BY rowid', (service.dataset_id,)).fetchall()
        ids.extend(identifier for (identifier,) in reviewed if identifier not in ids and int(identifier) in service.frame.index)
        return {'ids': ids, 'selectedId': ids[0]}

    def desk(self, client, service):
        with self.connect() as db:
            row = db.execute('SELECT payload FROM workspace_desks WHERE client=? AND dataset=?', (client, service.dataset_id)).fetchone()
        state = json.loads(row[0]) if row else self.initial(service)
        return {**state, 'profiles': [service.profile(int(identifier)) for identifier in state['ids']]}

    def open_profile(self, client, service, identifier):
        # Merge under a write lock so simultaneous tabs cannot lose opened IDs.
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT payload FROM workspace_desks WHERE client=? AND dataset=?', (client, service.dataset_id)).fetchone()
            state = json.loads(row[0]) if row else self.initial(service)
            if identifier not in state['ids']:
                state['ids'].append(identifier)
            state['selectedId'] = identifier
            db.execute('INSERT INTO workspace_desks VALUES (?, ?, ?) ON CONFLICT(client,dataset) DO UPDATE SET payload=excluded.payload', (client, service.dataset_id, json.dumps(state)))
        return state
