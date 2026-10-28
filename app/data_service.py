"""Read the original repository files directly; never use stale demo scorecards."""
import hashlib
import json
import math
from decimal import Decimal
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

from .behavior import FEATURES, finite, observations, draft_observations

class DataService:
    source_kind = 'research'
    def __init__(self, root: Path):
        self.root = root
        self.source = json.loads((root / 'SOURCE.json').read_text())
        self.scoring = json.loads((root / 'scoring_params.json').read_text())
        oof = pd.read_csv(root / 'oof_predictions.csv')
        scores = pd.read_csv(root / 'scored_customers.csv')
        cohorts = pd.read_csv(root / 'frozen_cohort_labels_N12.csv')
        for name, frame in [('OOF', oof), ('score', scores), ('cohort', cohorts)]:
            if frame.SK_ID_CURR.isna().any() or frame.SK_ID_CURR.duplicated().any():
                raise ValueError(f'{name}: thiếu hoặc trùng mã khách hàng.')
        ids = set(oof.SK_ID_CURR)
        if ids != set(scores.SK_ID_CURR) or ids != set(cohorts.SK_ID_CURR):
            raise ValueError('Các file gốc không có cùng danh sách khách hàng.')
        self.frame = (oof[['SK_ID_CURR', 'pred_risk_model_a', 'pred_risk_model_b']]
            .merge(scores[['SK_ID_CURR', 'score_a', 'score_b', 'grade_a', 'grade_b']], on='SK_ID_CURR', validate='one_to_one')
            .merge(cohorts[['SK_ID_CURR', 'cohort_t2_N12']], on='SK_ID_CURR', validate='one_to_one')
            .sort_values('SK_ID_CURR').set_index('SK_ID_CURR'))
        self.frame['score_diff'] = self.frame.score_b - self.frame.score_a
        self.frame['cohort_t2_N12'] = self.frame['cohort_t2_N12'].fillna('excluded_missing_data')
        for tag in ['a', 'b']:
            p, score = self.frame[f'pred_risk_model_{tag}'].to_numpy(), self.frame[f'score_{tag}'].to_numpy()
            if not np.all(np.isfinite(p) & (p > 0) & (p < 1) & np.isfinite(score)):
                raise ValueError('Xác suất hoặc điểm không hợp lệ trong dữ liệu gốc.')
            rebuilt = np.clip(self.scoring['offset'] - self.scoring['factor'] * np.log(p/(1-p)), 1, 1001)
            grades = 10 - np.digitize(score, self.scoring['internal_cutoffs'], right=False)
            if np.max(np.abs(rebuilt-score)) > .1 or not np.array_equal(grades, self.frame[f'grade_{tag}'].to_numpy()):
                raise ValueError('Điểm/xác suất/hạng không khớp. Cần chạy lại Part 1–2 trên cùng đầu vào.')
        shap_path = root / 'shap_points_by_group.parquet'
        self.shap = pd.read_parquet(shap_path).set_index('SK_ID_CURR') if shap_path.exists() else None
        if self.shap is not None and self.shap.index.duplicated().any():
            raise ValueError('SHAP trùng mã khách hàng.')
        feature_path = root / 'features_model_b.parquet'
        self.features = None
        if feature_path.exists():
            available = set(pq.ParquetFile(feature_path).schema.names)
            wanted = ['SK_ID_CURR'] + [name for name in FEATURES if name in available]
            self.features = pd.read_parquet(feature_path, columns=wanted).set_index('SK_ID_CURR')
            if self.features.index.duplicated().any(): raise ValueError('Bảng đặc trưng trùng mã khách hàng.')
        self.research = {
            'metrics': self.rows('eval_results/metrics_auc_bootstrap.csv'),
            'policies': self.rows('eval_results/policy_evaluation.csv'),
            'calibration': self.rows('calibration_deciles_ab.csv'),
            'grades': self.rows('eval_results/grade_table_10_b.csv'),
            'bootstrapReplicates': 1000,
            'sources': [{'path': item['path'], 'sha': item['sha'], 'url': '/api/source/' + item['path']} for item in self.source['files'] if item['path'] in ['eval_results/metrics_auc_bootstrap.csv', 'eval_results/policy_evaluation.csv', 'calibration_deciles_ab.csv', 'eval_results/grade_table_10_b.csv', 'scoring_params.json']],
        }
        self.case_ids = self.sample_ids()
        extra = '' if self.features is None else str(feature_path.stat().st_mtime_ns)
        self.dataset_id = self.source['commit'] + '-' + hashlib.sha256(extra.encode()).hexdigest()[:8]

    def rows(self, path):
        frame = pd.read_csv(self.root / path)
        return json.loads(frame.to_json(orient='records', double_precision=15))

    def sample_ids(self):
        frame = self.frame
        # Prefer records with SHAP so the demonstration can explain actual model output.
        pool = frame.loc[frame.index.intersection(self.shap.index)] if self.shap is not None else frame
        rehab = pool.cohort_t2_N12.eq('rehabilitated')
        groups = [pool.loc[rehab & pool.score_diff.ge(40)].sort_values('score_b', ascending=False),
                  pool.loc[rehab & pool.score_diff.abs().le(5)],
                  pool.loc[rehab & pool.score_diff.lt(0)].sort_values('score_diff'),
                  pool.loc[pool.cohort_t2_N12.eq('unrehabilitated')].sort_values('score_b'),
                  pool.loc[pool.cohort_t2_N12.eq('never_bad')].sort_values('score_b', ascending=False)]
        ids = []
        for group in groups:
            candidate = next((int(i) for i in group.index if int(i) not in ids), None)
            if candidate is not None: ids.append(candidate)
        for i in pool.index:
            if len(ids) >= 6: break
            if int(i) not in ids: ids.append(int(i))
        return ids

    def _shap(self, identifier, row):
        if self.shap is None or identifier not in self.shap.index: return None, 'unavailable'
        sr = self.shap.loc[identifier]
        points = {col.removeprefix('pts_'): finite(sr[col]) for col in self.shap.columns if col.startswith('pts_')}
        base = finite(sr.get('base_score'))
        valid = base is not None and points and all(value is not None for value in points.values())
        if valid:
            rebuilt = min(1001, max(1, base + sum(points.values())))
            valid = (abs(rebuilt-row.score_b) <= 1 and finite(sr.get('score_a')) is not None
                and finite(sr.get('score_b')) is not None and abs(float(sr.score_a)-row.score_a) <= 1e-6
                and abs(float(sr.score_b)-row.score_b) <= 1e-6 and sr.get('cohort_t2_N12') == row.cohort_t2_N12)
        return ({'baseScore': base, 'points': points}, 'verified') if valid else (None, 'stale')

    @staticmethod
    def label(row):
        if row.cohort_t2_N12 == 'rehabilitated':
            return 'Phục hồi · ' + ('Điểm tăng' if row.score_diff >= 5 else 'Điểm giảm' if row.score_diff < -5 else 'Điểm gần như không đổi')
        return {'unrehabilitated': 'Chưa phục hồi', 'never_bad': 'Chưa từng xấu đạt ngưỡng', 'no_bureau_balance': 'Không có lịch sử Bureau theo tháng', 'excluded_missing_data': 'Thiếu dữ liệu đối chiếu'}.get(row.cohort_t2_N12, row.cohort_t2_N12)

    def profile(self, identifier: int):
        if identifier not in self.frame.index: raise KeyError(identifier)
        row = self.frame.loc[identifier]
        facts = {key: finite(self.features.loc[identifier, key]) for key in self.features.columns if key in FEATURES} if self.features is not None and identifier in self.features.index else {}
        has_facts = any(value is not None for value in facts.values())
        shap, status = self._shap(identifier, row)
        items = observations(facts, shap)
        return {'id': str(identifier), 'sourceKind': self.source_kind, 'cohort': row.cohort_t2_N12,
            'caseLabel': self.label(row), 'models': {tag: {'score': float(row[f'score_{tag}']), 'probability': float(row[f'pred_risk_model_{tag}']), 'grade': int(row[f'grade_{tag}'])} for tag in ['a','b']},
            'facts': facts, 'factSource': getattr(self, 'name', 'features_model_b.parquet') if has_facts else 'Chưa có giá trị đặc trưng',
            'shapGroups': shap, 'shapStatus': status, 'targetActual': None,
            'observations': items, 'observationDraft': draft_observations(items),
            'basisLabel': 'Giá trị đặc trưng' if has_facts else 'SHAP theo nhóm' if shap else 'Cần bổ sung dữ liệu'}

    def dataset(self):
        return {'schemaVersion': 1, 'meta': {'datasetId': self.dataset_id, 'totalProfiles': len(self.frame), 'cohorts': sorted(self.frame.cohort_t2_N12.unique().tolist()), 'generatedAt': self.source['commit'], 'profileMode': 'research',
            'notice': 'Đọc trực tiếp các file nguyên bản từ repo. Repo chưa chứa dữ liệu Home Credit thô, bảng đặc trưng lớn hoặc mô hình đã huấn luyện; không chấm hồ sơ mới.'},
            'scoring': self.scoring, 'profiles': [self.profile(i) for i in self.case_ids], 'research': self.research}

    def search(self, query='', cohort='all', limit=25, offset=0):
        frame = self.frame
        if query: frame = frame.loc[frame.index.astype(str).str.contains(query, regex=False)]
        if cohort != 'all': frame = frame.loc[frame.cohort_t2_N12.eq(cohort)]
        count = len(frame)
        return {'total': count, 'items': [{'id': str(i), 'cohort': row.cohort_t2_N12, 'caseLabel': self.label(row),
            'score': float(row.score_b), 'delta': float(row.score_diff)} for i,row in frame.iloc[offset:offset+limit].iterrows()]}

    def source_path(self, path):
        if path not in {item['path'] for item in self.source['files']}: raise KeyError(path)
        return self.root / path

    def simulate_policy(self, rule, threshold, cohort='all'):
        frame = self.frame
        if cohort != 'all':
            if cohort not in set(frame.cohort_t2_N12):
                raise ValueError('Nhóm khách hàng không có trong bộ dữ liệu.')
            frame = frame.loc[frame.cohort_t2_N12.eq(cohort)]
        total = len(frame)
        models = {}
        for tag in ['a', 'b']:
            probability = f'pred_risk_model_{tag}'
            tie_break = False
            if rule == 'approval':
                count = int(Decimal(str(threshold)) * total)
                ranked = frame.sort_values([probability, 'SK_ID_CURR'])
                eligible = frame.index.isin(ranked.index[:count])
                if 0 < count < total:
                    tie_break = bool(ranked.iloc[count-1][probability] == ranked.iloc[count][probability])
            else:
                eligible = frame[f'score_{tag}'].ge(threshold) if rule == 'score' else frame[probability].le(threshold)
            count = int(eligible.sum())
            models[tag] = {'eligibleCount': count, 'excludedCount': total-count,
                'eligibleRate': count/total if total else 0,
                'meanPredictedRisk': float(frame.loc[eligible, probability].mean()) if count else None,
                'cutoffScore': float(frame.loc[eligible, f'score_{tag}'].min()) if count else None,
                'cutoffRisk': float(frame.loc[eligible, probability].max()) if count else None,
                'tieBreakUsed': tie_break}
        return {'rule': rule, 'threshold': threshold, 'cohort': cohort, 'total': total,
            'models': models, 'deltaCount': models['b']['eligibleCount']-models['a']['eligibleCount'],
            'deltaRate': models['b']['eligibleRate']-models['a']['eligibleRate']}
