"""User-supplied model outputs, isolated by content and persisted locally."""
import csv
import hashlib
import io
import sqlite3
from functools import lru_cache

import numpy as np
import pandas as pd

from .behavior import FEATURES
from .data_service import DataService

MAX_UPLOAD = 10 * 1024 * 1024
REQUIRED = ['SK_ID_CURR', 'pred_risk_model_a', 'pred_risk_model_b']


class ImportedData(DataService):
    source_kind = 'imported'

    def __init__(self, body, name, scoring):
        self.name, self.scoring = name, scoring
        try:
            text = body.decode('utf-8-sig')
            reader = csv.reader(io.StringIO(text), strict=True)
            headers = next(reader, [])
            if len(headers) != len(set(headers)):
                raise ValueError('CSV có tên cột trùng nhau.')
            if any(len(row) != len(headers) for row in reader if row):
                raise ValueError('Số cột giữa các dòng CSV không khớp tiêu đề.')
            frame = pd.read_csv(io.StringIO(text), dtype={'SK_ID_CURR': str})
        except (UnicodeError, csv.Error, pd.errors.ParserError, pd.errors.EmptyDataError) as error:
            raise ValueError('Không đọc được CSV. Hãy lưu dạng CSV UTF-8, phân cách bằng dấu phẩy.') from error
        missing = set(REQUIRED) - set(frame.columns)
        if missing:
            raise ValueError('Thiếu cột: ' + ', '.join(sorted(missing)))
        if frame.empty:
            raise ValueError('CSV chưa có hồ sơ.')
        ids = frame.SK_ID_CURR
        if ids.isna().any() or not ids.str.fullmatch(r'[1-9][0-9]{0,14}').all() or ids.duplicated().any():
            raise ValueError('SK_ID_CURR phải là số nguyên dương tối đa 15 chữ số, không thiếu hoặc trùng.')
        frame['SK_ID_CURR'] = ids.astype('int64')
        for tag in ['a', 'b']:
            p = pd.to_numeric(frame[f'pred_risk_model_{tag}'], errors='coerce')
            if not (np.isfinite(p) & p.gt(0) & p.lt(1)).all():
                raise ValueError(f'pred_risk_model_{tag} phải là số lớn hơn 0 và nhỏ hơn 1 ở mọi dòng.')
            score = np.clip(scoring['offset'] - scoring['factor'] * np.log(p/(1-p)), 1, 1001)
            grade = 10 - np.digitize(score, scoring['internal_cutoffs'], right=False)
            for column, expected, tolerance in [(f'score_{tag}', score, .1), (f'grade_{tag}', grade, 0)]:
                if column in frame:
                    supplied = pd.to_numeric(frame[column], errors='coerce')
                    if not (np.isfinite(supplied) & (np.abs(supplied-expected) <= tolerance)).all():
                        raise ValueError(f'{column} không khớp xác suất và thang điểm hiện tại.')
            frame[f'pred_risk_model_{tag}'], frame[f'score_{tag}'], frame[f'grade_{tag}'] = p, score, grade
        cohorts = {'rehabilitated', 'unrehabilitated', 'never_bad', 'no_bureau_balance', 'excluded_missing_data', 'no_internal_history'}
        if 'cohort_t2_N12' not in frame:
            frame['cohort_t2_N12'] = 'excluded_missing_data'
        frame['cohort_t2_N12'] = frame.cohort_t2_N12.fillna('excluded_missing_data')
        if not frame.cohort_t2_N12.isin(cohorts).all():
            raise ValueError('cohort_t2_N12 có nhóm không hợp lệ. Xem hướng dẫn nhập dữ liệu.')
        self.frame = frame.sort_values('SK_ID_CURR').set_index('SK_ID_CURR')
        self.frame['score_diff'] = self.frame.score_b-self.frame.score_a
        columns = [c for c in FEATURES if c in frame.columns]
        self.features = self.frame[columns].copy() if columns else None
        for column in columns:
            original = self.features[column]
            values = pd.to_numeric(original, errors='coerce')
            invalid = original.notna() & (~np.isfinite(values) | values.lt(0))
            if 'RATIO' in column:
                invalid |= values.gt(1)
            if invalid.any():
                raise ValueError(f'{column} có giá trị không hợp lệ; tỷ lệ phải trong 0–1, dữ liệu thiếu để trống.')
            self.features[column] = values
        self.shap = None
        self.case_ids = [int(i) for i in self.frame.index[:6]]
        scoring_hash = hashlib.sha256(str(sorted(scoring.items())).encode()).hexdigest()[:12]
        self.dataset_id = 'csv-' + hashlib.sha256(body).hexdigest() + '-' + scoring_hash
        self.source = {'commit': self.dataset_id, 'files': []}
        self.research = {'metrics': [], 'policies': [], 'calibration': [], 'grades': [], 'sources': []}

    def profile(self, identifier):
        profile = super().profile(identifier)
        for item in profile['observations']:
            for evidence in item['evidence']:
                evidence['source'] = self.name + ' · cột ' + evidence['key']
        return profile

    def dataset(self):
        result = super().dataset()
        result['meta'].update(profileMode='imported', notice='Nguồn CSV do người dùng cung cấp. Điểm/hạng quy đổi từ xác suất theo thang hiện tại; chưa kiểm chứng mô hình trên nguồn này. Không có kết quả nghiên cứu hay SHAP đi kèm.')
        return result


class SourceStore:
    def __init__(self, database, original):
        self.database, self.original = database, original
        with sqlite3.connect(database) as db:
            db.execute('CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, name TEXT NOT NULL, body BLOB NOT NULL, count INTEGER NOT NULL)')

    def list(self):
        with sqlite3.connect(self.database) as db:
            rows = db.execute('SELECT id, name, count FROM sources ORDER BY rowid DESC').fetchall()
        return [{'id': 'original', 'name': 'Home Credit · Dữ liệu nghiên cứu', 'count': len(self.original.frame)}] + [dict(id=i, name=n, count=c) for i,n,c in rows]

    def add(self, body, name):
        service = ImportedData(body, name, self.original.scoring)
        identifier = 'csv-' + hashlib.sha256(body).hexdigest()
        with sqlite3.connect(self.database) as db:
            db.execute('INSERT OR IGNORE INTO sources VALUES (?, ?, ?, ?)', (identifier, name, body, len(service.frame)))
        return identifier

    @lru_cache(maxsize=4)
    def get(self, identifier):
        if identifier == 'original':
            return self.original
        with sqlite3.connect(self.database) as db:
            row = db.execute('SELECT name, body FROM sources WHERE id=?', (identifier,)).fetchone()
        if row is None:
            raise KeyError(identifier)
        return ImportedData(row[1], row[0], self.original.scoring)
