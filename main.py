"""CreditDesk: python main.py (local server, no external deployment)."""
import argparse
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator, model_validator
from starlette.concurrency import run_in_threadpool

from app.data_service import DataService
from app.reviews import ReviewStore
from app.sources import SourceStore, MAX_UPLOAD
from app.workspaces import WorkspaceStore

ROOT = Path(__file__).resolve().parent

class WorkspaceView(BaseModel):
    source: str = Field(min_length=1, max_length=100)
    route: Literal['catalog', 'appraisal', 'policy', 'research']

class PolicyInput(BaseModel):
    rule: Literal['score', 'risk', 'approval']
    threshold: float = Field(allow_inf_nan=False)
    cohort: str = Field(default='all', max_length=40)

    @model_validator(mode='after')
    def valid_threshold(self):
        lower, upper = (1, 1001) if self.rule == 'score' else (0, 1)
        if not lower <= self.threshold <= upper:
            raise ValueError('Ngưỡng ngoài khoảng cho phép.')
        return self

class ReviewInput(BaseModel):
    decision: Literal['Tiếp tục thẩm định', 'Yêu cầu bổ sung thông tin', 'Chuyển rà soát chuyên sâu']
    note: Annotated[str, Field(min_length=15, max_length=3000)]

    @field_validator('note', mode='before')
    @classmethod
    def strip_note(cls, value):
        return value.strip() if isinstance(value, str) else value

def create_app(data_dir=None, db_path=None):
    data_root = Path(data_dir or os.getenv('CREDITDESK_DATA_DIR', ROOT / 'data')).resolve()
    database = Path(db_path or os.getenv('CREDITDESK_DB_PATH', ROOT / 'runtime/creditdesk.sqlite3')).resolve()

    @asynccontextmanager
    async def lifespan(app):
        app.state.data = DataService(data_root)
        app.state.reviews = ReviewStore(database)
        app.state.sources = SourceStore(database, app.state.data)
        app.state.workspaces = WorkspaceStore(database)
        yield

    app = FastAPI(title='CreditDesk API', version='2.0.0', lifespan=lifespan)
    app.mount('/assets', StaticFiles(directory=ROOT / 'static/assets'), name='assets')

    def selected_data(request, source):
        try: return request.app.state.sources.get(source)
        except KeyError: raise HTTPException(404, 'Không tìm thấy nguồn dữ liệu. Hãy chọn lại nguồn.')

    @app.get('/api/workspace')
    def workspace(request: Request, client: UUID):
        return request.app.state.workspaces.view(str(client))

    @app.put('/api/workspace')
    def save_workspace(request: Request, client: UUID, body: WorkspaceView):
        selected_data(request, body.source)
        return request.app.state.workspaces.save_view(str(client), body.source, body.route)

    @app.get('/api/workspace/desk')
    def desk(request: Request, client: UUID, source: str = 'original'):
        return request.app.state.workspaces.desk(str(client), selected_data(request, source))

    @app.put('/api/workspace/desk/{profile_id}')
    def open_profile(request: Request, profile_id: int, client: UUID, source: str = 'original'):
        service = selected_data(request, source)
        if profile_id not in service.frame.index:
            raise HTTPException(404, 'Không tìm thấy hồ sơ.')
        return request.app.state.workspaces.open_profile(str(client), service, str(profile_id))

    @app.post('/api/policy/simulate')
    def simulate_policy(request: Request, body: PolicyInput, source: str = 'original'):
        try: return selected_data(request, source).simulate_policy(body.rule, body.threshold, body.cohort)
        except ValueError as error: raise HTTPException(422, str(error))

    @app.get('/api/sources')
    def sources(request: Request):
        return request.app.state.sources.list()

    @app.post('/api/sources', status_code=201)
    async def import_source(request: Request, name: str = Query(..., min_length=1, max_length=120)):
        if request.headers.get('content-type', '').split(';')[0] != 'text/csv':
            raise HTTPException(415, 'Chọn tệp CSV UTF-8 để nhập.')
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_UPLOAD: raise HTTPException(413, 'CSV vượt quá 10 MB. Hãy chia nhỏ tệp.')
        try: identifier = await run_in_threadpool(request.app.state.sources.add, bytes(body), Path(name).name)
        except ValueError as error: raise HTTPException(422, str(error))
        return {'id': identifier}

    @app.get('/', include_in_schema=False)
    def home(): return FileResponse(ROOT / 'static/index.html')

    @app.get('/api/health')
    def health(request: Request):
        service = request.app.state.data
        return {'status': 'ok', 'customers': len(service.frame), 'originalFiles': len(service.source['files']),
            'commit': service.source['commit'], 'featuresAvailable': service.features is not None}

    @app.get('/api/dataset')
    def dataset(request: Request, source: str = 'original'): return selected_data(request, source).dataset()

    @app.get('/api/profiles')
    def profiles(request: Request, q: str = Query('', max_length=32), cohort: str = Query('all', max_length=40), limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), source: str = 'original'):
        return selected_data(request, source).search(q, cohort, limit, offset)

    @app.get('/api/profiles/{profile_id}')
    def profile(profile_id: int, request: Request, source: str = 'original'):
        try: return selected_data(request, source).profile(profile_id)
        except KeyError: raise HTTPException(404, 'Không tìm thấy hồ sơ.')

    @app.get('/api/reviews')
    def reviews(request: Request, source: str = 'original'):
        return request.app.state.reviews.all(selected_data(request, source).dataset_id)

    @app.put('/api/profiles/{profile_id}/review')
    def save_review(profile_id: int, body: ReviewInput, request: Request, source: str = 'original'):
        service = selected_data(request, source)
        try: selected = service.profile(profile_id)
        except KeyError: raise HTTPException(404, 'Không tìm thấy hồ sơ.')
        return request.app.state.reviews.save(service.dataset_id, selected, body.decision, body.note)

    @app.get('/api/source/{path:path}')
    def source(path: str, request: Request):
        try: actual = request.app.state.data.source_path(path)
        except KeyError: raise HTTPException(404, 'Tệp không có trong danh mục dữ liệu nguồn.')
        return FileResponse(actual, filename=actual.name)

    @app.get('/data/sources/{filename}', include_in_schema=False)
    def source_alias(filename: str, request: Request):
        allowed = [item['path'] for item in request.app.state.data.source['files'] if Path(item['path']).name == filename]
        if len(allowed) != 1: raise HTTPException(404, 'Không tìm thấy tệp nguồn.')
        return FileResponse(request.app.state.data.root / allowed[0], filename=filename)

    return app

app = create_app()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--reload', action='store_true')
    args = parser.parse_args()
    import uvicorn
    uvicorn.run('main:app', host=args.host, port=args.port, reload=args.reload)
