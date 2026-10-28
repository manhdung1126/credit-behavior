import hashlib
import json
from pathlib import Path
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from main import create_app
from app.behavior import observations

ROOT = Path(__file__).resolve().parents[1]

@pytest.fixture(scope='module')
def client(tmp_path_factory):
    path = tmp_path_factory.mktemp('creditdesk') / 'reviews.sqlite3'
    app = create_app(db_path=path)
    with TestClient(app) as instance:
        yield instance

def test_all_original_data_files_match_git_blob_sha():
    source = json.loads((ROOT/'data/SOURCE.json').read_text())
    assert len(source['files']) == 34
    for item in source['files']:
        body = (ROOT/'data'/item['path']).read_bytes()
        assert len(body) == item['size']
        assert hashlib.sha1(f'blob {len(body)}\0'.encode()+body).hexdigest() == item['sha']

def test_health_and_static_ui(client):
    info = client.get('/api/health').json()
    assert info['customers'] == 307511
    assert info['originalFiles'] == 34
    assert client.get('/').status_code == 200
    assert client.get('/assets/app.js').status_code == 200
    assert 'api/dataset' in client.get('/assets/app.js').text

def test_real_profiles_and_group_shap(client):
    result = client.get('/api/dataset')
    assert result.status_code == 200
    data = result.json()
    assert len(data['profiles']) == 6
    for row in data['profiles']:
        assert row['sourceKind'] == 'research'
        assert row['id'].isdigit()
        assert row['shapStatus'] == 'verified'
        assert row['facts'] == {}  # Not invented when features are absent in repo.
        shap = row['shapGroups']
        assert abs(max(1,min(1001,shap['baseScore']+sum(shap['points'].values())))-row['models']['b']['score']) <= 1
    sample = next(p for p in data['profiles'] if p['id']=='247791')
    assert round(sample['models']['a']['score'],2)==928.38
    assert round(sample['models']['b']['score'],2)==969.56
    assert sample['models']['b']['grade']==1
    assert sample['observations'][0]['id'].startswith('shap_')

def test_search_entire_catalog_and_missing_id(client):
    found = client.get('/api/profiles', params={'q':'247791'}).json()
    assert found['total']==1 and found['items'][0]['id']=='247791'
    assert client.get('/api/profiles/247791').status_code==200
    assert client.get('/api/profiles/999999999').status_code==404
    assert client.get('/api/profiles',params={'limit':1001}).status_code==422
    first = client.get('/api/profiles', params={'limit':25}).json()
    second = client.get('/api/profiles', params={'limit':25, 'offset':25}).json()
    assert first['total'] == second['total'] == 307511
    assert len(second['items']) == 25
    assert not {p['id'] for p in first['items']} & {p['id'] for p in second['items']}
    sample_ids = {p['id'] for p in client.get('/api/dataset').json()['profiles']}
    outside = next(p['id'] for p in second['items'] if p['id'] not in sample_ids)
    assert client.get('/api/profiles/'+outside).status_code == 200
    assert client.get('/api/profiles', params={'offset':-1}).status_code == 422


def test_csv_source_roundtrip_and_review_isolation(client):
    body = b'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b,INS_LATE_RATIO_6M\n247791,0.1,0.08,0.25\n900001,0.05,0.02,\n'
    response = client.post('/api/sources?name=my-output.csv', content=body, headers={'Content-Type':'text/csv'})
    assert response.status_code == 201
    source = response.json()['id']
    params = {'source':source}
    listing = client.get('/api/sources').json()
    assert next(s for s in listing if s['id']==source)['count'] == 2
    data = client.get('/api/dataset', params=params).json()
    assert data['meta']['totalProfiles'] == 2 and data['meta']['profileMode'] == 'imported'
    assert data['research']['metrics'] == []
    profile = client.get('/api/profiles/247791', params=params).json()
    assert profile['sourceKind'] == 'imported'
    assert profile['shapStatus'] == 'unavailable'
    assert profile['facts']['INS_LATE_RATIO_6M'] == .25
    assert profile['observations'][0]['evidence'][0]['source'].startswith('my-output.csv')
    assert client.get('/api/profiles/900001',params=params).json()['facts']['INS_LATE_RATIO_6M'] is None
    note = 'Nhận xét riêng cho hồ sơ trong nguồn CSV nhập vào.'
    before = client.get('/api/reviews').json()
    assert client.put('/api/profiles/247791/review',params=params,json={'decision':'Yêu cầu bổ sung thông tin','note':note}).status_code == 200
    assert client.get('/api/reviews',params=params).json()['247791']['note'] == note
    assert client.get('/api/reviews').json() == before
    assert client.get('/api/profiles',params={**params,'q':'900'}).json()['total'] == 1
    assert client.get('/api/profiles/100002',params=params).status_code == 404
    # Same content reuses its source; a changed file receives separate reviews.
    assert client.post('/api/sources?name=copy.csv',content=body,headers={'Content-Type':'text/csv'}).json()['id'] == source
    other = client.post('/api/sources?name=other.csv',content=body.replace(b'0.25',b'0.2'),headers={'Content-Type':'text/csv'}).json()['id']
    assert client.get('/api/reviews',params={'source':other}).json() == {}


@pytest.mark.parametrize('body', [
    'SK_ID_CURR\n1\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b\n1,0,0.1\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b\n1,NaN,0.1\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b\n1,0.2,0.1\n1,0.2,0.1\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b\n../secret,0.2,0.1\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b,score_b\n1,0.2,0.1,999\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b,INS_LATE_RATIO_6M\n1,0.2,0.1,1.1\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b,cohort_t2_N12\n1,0.2,0.1,unknown\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b\n1,0.2,0.1,extra\n',
    'SK_ID_CURR,pred_risk_model_a,pred_risk_model_a,pred_risk_model_b\n1,0.2,0.2,0.1\n',
])
def test_bad_import_leaves_existing_sources_intact(client, body):
    before = client.get('/api/sources').json()
    assert client.post('/api/sources?name=bad.csv',content=body.encode(),headers={'Content-Type':'text/csv'}).status_code == 422
    assert client.get('/api/sources').json() == before


def test_source_boundaries(client):
    assert client.get('/api/dataset?source=missing').status_code == 404
    assert client.post('/api/sources?name=bad.csv',json={}).status_code == 415
    assert client.post('/api/sources?name=big.csv',content=b'x'*(10*1024*1024+1),headers={'Content-Type':'text/csv'}).status_code == 413


def test_sources_survive_restart(tmp_path):
    db = tmp_path/'reviews.sqlite3'
    with TestClient(create_app(db_path=db)) as instance:
        source = instance.post('/api/sources?name=persist.csv',content=b'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b\n123,0.1,0.2\n',headers={'Content-Type':'text/csv'}).json()['id']
    with TestClient(create_app(db_path=db)) as instance:
        assert any(s['id']==source for s in instance.get('/api/sources').json())
        assert instance.get('/api/profiles/123',params={'source':source}).status_code == 200

def test_original_research_numbers_and_source_download(client):
    data = client.get('/api/dataset').json()
    row = next(r for r in data['research']['metrics'] if r['group']=='full_population')
    assert round(row['auc_b'],4)==.7888
    policy = next(r for r in data['research']['policies'] if r['cohort']=='cohort_t2_N12' and r['policy_mode'].startswith('mode2_'))
    assert round(policy['delta_approval']*100,2)==3.48
    assert policy['delta_approval_ci95_low']>0
    response = client.get('/api/source/scoring_params.json')
    assert response.content==(ROOT/'data/scoring_params.json').read_bytes()
    assert client.get('/api/source/not-allowed.txt').status_code==404
    assert client.get('/data/sources/policy_evaluation.csv').status_code==200

def test_review_requires_reason_and_persists_on_server(client):
    url='/api/profiles/247791/review'
    assert client.put(url,json={'decision':'Tiếp tục thẩm định','note':'ngắn'}).status_code==422
    assert client.put(url,json={'decision':'Tự động duyệt','note':'Không phải hành động được phép trong MVP.'}).status_code==422
    note='Nhóm trả góp có đóng góp dương; cần đối chiếu thêm hồ sơ gốc trước khi tiếp tục thẩm định.'
    response=client.put(url,json={'decision':'Tiếp tục thẩm định','note':note})
    assert response.status_code==200
    saved=client.get('/api/reviews').json()['247791']
    assert saved['note']==note and saved['sourceKind']=='research'
    assert saved['models']['b']['score']==client.get('/api/profiles/247791').json()['models']['b']['score']
    assert client.put('/api/profiles/999999999/review',json={'decision':'Tiếp tục thẩm định','note':note}).status_code==404

def test_no_fabricated_behavior_without_features_or_shap():
    result=observations({},None)
    assert result[0]['tone']=='missing'
    assert result[0]['evidence']==[]

def test_feature_values_explain_concrete_behavior():
    result=observations({'INS_LATE_RATIO_6M':.25,'INS_LATE_RATIO':.1,'INS_DPD_MAX_6M':18,'INS_UNDERPAID_RATIO_6M':.125},None)
    assert 'tăng' in result[0]['title']
    assert '25,0%' in result[0]['text'] and '18 ngày' in result[0]['text']
    assert result[0]['evidence'][0]['key']=='INS_LATE_RATIO_6M'
    assert result[1]['tone']=='attention'


def test_workspace_survives_restart_and_keeps_datasets_separate(tmp_path):
    database = tmp_path/'persistent.sqlite3'
    owner, other_browser = str(uuid4()), str(uuid4())
    with TestClient(create_app(db_path=database)) as instance:
        params = {'client':owner}
        initial = instance.get('/api/workspace/desk',params=params).json()
        assert len(initial['profiles']) == 6
        assert '100002' not in initial['ids']
        for identifier in ['100002','100003','100002']:
            assert instance.put('/api/workspace/desk/'+identifier,params=params).status_code == 200
        state = instance.get('/api/workspace/desk',params=params).json()
        assert len(state['profiles']) == 8 and state['selectedId'] == '100002'
        assert state['ids'].count('100002') == 1
        note = 'Đề xuất đã lưu cho hồ sơ ngoài sáu trường hợp ban đầu.'
        assert instance.put('/api/profiles/100002/review',json={'decision':'Yêu cầu bổ sung thông tin','note':note}).status_code == 200
        assert instance.put('/api/workspace',params=params,json={'source':'original','route':'appraisal'}).status_code == 200
        source = instance.post('/api/sources?name=desk.csv',content=b'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b\n100002,0.1,0.2\n900001,0.2,0.1\n',headers={'Content-Type':'text/csv'}).json()['id']
        assert instance.put('/api/workspace/desk/900001',params={**params,'source':source}).status_code == 200
        assert instance.put('/api/workspace',params=params,json={'source':source,'route':'appraisal'}).status_code == 200
        assert instance.get('/api/workspace/desk',params={**params,'source':source}).json()['selectedId'] == '900001'
        assert instance.get('/api/workspace/desk',params={'client':other_browser}).json()['selectedId'] == initial['selectedId']
    with TestClient(create_app(db_path=database)) as instance:
        view = instance.get('/api/workspace',params=params).json()
        assert view == {'source':source,'route':'appraisal'}
        assert instance.get('/api/workspace/desk',params={**params,'source':view['source']}).json()['selectedId'] == '900001'
        restored = instance.get('/api/workspace/desk',params=params).json()
        assert restored['ids'] == state['ids'] and restored['selectedId'] == '100002'
        assert instance.get('/api/reviews').json()['100002']['note'] == note
        assert instance.get('/api/reviews',params={'source':source}).json() == {}
        assert instance.get('/api/workspace',params={'client':other_browser}).json() == {'source':'original','route':'catalog'}


def test_concurrent_opened_profiles_are_merged(client):
    params = {'client':str(uuid4())}
    ids = ['100002','100003','100004','100006']
    with ThreadPoolExecutor(max_workers=4) as executor:
        responses = list(executor.map(lambda i: client.put('/api/workspace/desk/'+i,params=params), ids))
    assert all(r.status_code == 200 for r in responses)
    state = client.get('/api/workspace/desk',params=params).json()
    assert set(ids).issubset(state['ids'])
    assert len(set(state['ids'])) == len(state['ids'])


def test_invalid_workspace_never_changes_saved_state(client):
    params = {'client':str(uuid4())}
    assert client.put('/api/workspace/desk/100002',params=params).status_code == 200
    before = client.get('/api/workspace/desk',params=params).json()
    assert client.put('/api/workspace/desk/999999999',params=params).status_code == 404
    assert client.get('/api/workspace/desk',params=params).json() == before
    assert client.put('/api/workspace',params=params,json={'source':'missing','route':'appraisal'}).status_code == 404
    assert client.put('/api/workspace',params=params,json={'source':'original','route':'unknown'}).status_code == 422
    assert client.get('/api/workspace/desk',params={'client':'invalid'}).status_code == 422


def test_custom_policy_uses_whole_selected_dataset(client):
    source = client.post('/api/sources?name=policy.csv',content=b'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b,cohort_t2_N12\n801,0.01,0.02,rehabilitated\n802,0.05,0.1,never_bad\n803,0.2,0.04,rehabilitated\n',headers={'Content-Type':'text/csv'}).json()['id']
    params = {'source':source}
    result = client.post('/api/policy/simulate',params=params,json={'rule':'risk','threshold':.05}).json()
    assert result['total'] == 3
    assert result['models']['a']['eligibleCount'] == result['models']['b']['eligibleCount'] == 2
    assert result['models']['a']['excludedCount'] == 1
    assert result['models']['a']['meanPredictedRisk'] == pytest.approx(.03)
    assert result['models']['b']['meanPredictedRisk'] == pytest.approx(.03)
    filtered = client.post('/api/policy/simulate',params=params,json={'rule':'risk','threshold':.05,'cohort':'rehabilitated'}).json()
    assert filtered['total'] == 2
    assert filtered['models']['a']['eligibleCount'] == 1 and filtered['models']['b']['eligibleCount'] == 2
    assert filtered['deltaCount'] == 1 and filtered['deltaRate'] == .5
    empty = client.post('/api/policy/simulate',params=params,json={'rule':'risk','threshold':0}).json()
    assert empty['models']['a']['eligibleCount'] == 0 and empty['models']['a']['meanPredictedRisk'] is None
    all_rows = client.post('/api/policy/simulate',params=params,json={'rule':'score','threshold':1}).json()
    assert all_rows['models']['a']['eligibleCount'] == all_rows['models']['b']['eligibleCount'] == 3
    cutoff = client.get('/api/profiles/802',params=params).json()['models']['a']['score']
    boundary = client.post('/api/policy/simulate',params=params,json={'rule':'score','threshold':cutoff}).json()
    assert boundary['models']['a']['eligibleCount'] == 2
    original = client.post('/api/policy/simulate',json={'rule':'score','threshold':700}).json()
    assert original['total'] == 307511
    expected = int(client.app.state.data.frame.score_b.ge(700).sum())
    assert original['models']['b']['eligibleCount'] == expected


@pytest.mark.parametrize('body', [
    {'rule':'risk','threshold':-0.01}, {'rule':'risk','threshold':1.01},
    {'rule':'score','threshold':0}, {'rule':'score','threshold':1002},
    {'rule':'unknown','threshold':700}, {'rule':'score','threshold':700,'cohort':'missing'},
    {'rule':'risk','threshold':'NaN'}, {'rule':'risk','threshold':'Infinity'},
])
def test_invalid_policy_is_rejected(client, body):
    assert client.post('/api/policy/simulate',json=body).status_code == 422


def test_approval_target_selects_lowest_risks_with_exact_quota(client):
    body = b'SK_ID_CURR,pred_risk_model_a,pred_risk_model_b,cohort_t2_N12\n803,0.1,0.05,rehabilitated\n801,0.1,0.15,rehabilitated\n804,0.1,0.05,never_bad\n802,0.2,0.15,never_bad\n'
    source = client.post('/api/sources?name=approval.csv',content=body,headers={'Content-Type':'text/csv'}).json()['id']
    def simulate(rate, cohort='all'):
        response = client.post('/api/policy/simulate',params={'source':source},json={'rule':'approval','threshold':rate,'cohort':cohort})
        assert response.status_code == 200
        return response.json()
    result = simulate(.5)
    assert result['total'] == 4
    assert result['models']['a']['eligibleCount'] == result['models']['b']['eligibleCount'] == 2
    assert result['models']['a']['meanPredictedRisk'] == pytest.approx(.1)
    assert result['models']['b']['meanPredictedRisk'] == pytest.approx(.05)
    assert result['models']['a']['cutoffRisk'] == .1
    assert result['models']['a']['tieBreakUsed'] is True
    assert result['models']['b']['tieBreakUsed'] is False
    assert result['deltaCount'] == 0 and result['deltaRate'] == 0
    assert simulate(.5) == result
    filtered = simulate(.5,'rehabilitated')
    assert filtered['total'] == 2 and filtered['models']['b']['eligibleCount'] == 1
    assert filtered['models']['b']['meanPredictedRisk'] == .05
    empty = simulate(0)
    for model in empty['models'].values():
        assert model['eligibleCount'] == 0 and model['excludedCount'] == 4
        assert model['meanPredictedRisk'] is None and model['cutoffRisk'] is None and model['cutoffScore'] is None
    assert simulate(.125)['models']['a']['eligibleCount'] == 0
    assert simulate(1)['models']['b']['eligibleCount'] == 4
    for rate in [-.01,1.01]:
        assert client.post('/api/policy/simulate',params={'source':source},json={'rule':'approval','threshold':rate}).status_code == 422


def test_approval_target_rounds_decimal_percent_without_float_loss(client):
    body = ('SK_ID_CURR,pred_risk_model_a,pred_risk_model_b\n' + ''.join(f'{i},0.1,0.2\n' for i in range(5000,5100))).encode()
    source = client.post('/api/sources?name=rounding.csv',content=body,headers={'Content-Type':'text/csv'}).json()['id']
    result = client.post('/api/policy/simulate',params={'source':source},json={'rule':'approval','threshold':.29}).json()
    assert result['total'] == 100
    assert result['models']['a']['eligibleCount'] == result['models']['b']['eligibleCount'] == 29
    assert result['models']['a']['eligibleRate'] == .29
    original = client.post('/api/policy/simulate',json={'rule':'approval','threshold':.5}).json()
    assert original['total'] == 307511
    assert original['models']['a']['eligibleCount'] == original['models']['b']['eligibleCount'] == 153755
