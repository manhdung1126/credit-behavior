"""Factual behavior observations and group SHAP, without invented feature values."""
import math

FEATURES = {
    'INS_LATE_RATIO': ('Tỷ lệ trả chậm toàn kỳ', 'installments_payments.csv', 'Toàn lịch sử quan sát'),
    'INS_LATE_RATIO_6M': ('Tỷ lệ trả chậm 6 tháng', 'installments_payments.csv', 'Ngày thanh toán ≥ −180'),
    'INS_DPD_MAX_6M': ('Số ngày chậm tối đa 6 tháng', 'installments_payments.csv', 'Ngày thanh toán ≥ −180'),
    'INS_UNDERPAID_RATIO_6M': ('Tỷ lệ trả thiếu 6 tháng', 'installments_payments.csv', 'Ngày thanh toán ≥ −180'),
    'CC_UTILIZATION_MEAN': ('Sử dụng hạn mức thẻ toàn kỳ', 'credit_card_balance.csv', 'Toàn lịch sử quan sát'),
    'CC_UTILIZATION_MEAN_6M': ('Sử dụng hạn mức thẻ 6 tháng', 'credit_card_balance.csv', 'MONTHS_BALANCE ≥ −6'),
    'POS_DPD_MAX_12M': ('Số ngày chậm POS tối đa 12 tháng', 'POS_CASH_balance.csv', 'MONTHS_BALANCE ≥ −12'),
    'B_AMT_CREDIT_SUM_OVERDUE_SUM': ('Tổng dư nợ quá hạn Bureau', 'bureau.csv', 'Thời điểm trích xuất'),
}
GROUPS = {
    'internal_installment_behavior': 'Thanh toán trả góp',
    'internal_pos_cash_behavior': 'Vay POS / tiền mặt',
    'internal_credit_card_behavior': 'Hành vi thẻ tín dụng',
    'internal_previous_app_history': 'Đăng ký vay trước đây',
    'bureau_delinquency_history': 'Lịch sử quá hạn Bureau',
    'bureau_credit_exposure': 'Dư nợ Bureau',
    'ext_source_scores': 'Điểm từ nguồn ngoài',
    'application_financial_ratios': 'Tỷ lệ tài chính',
    'applicant_demographics_stability': 'Thông tin hồ sơ',
    'other_factors': 'Các yếu tố khác',
}

def num(value, digits=1):
    return f'{value:.{digits}f}'.replace('.', ',')

def finite(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None

def evidence(key, value):
    label, source, window = FEATURES[key]
    return {'key': key, 'value': value, 'label': label, 'source': source, 'window': window}

def observations(facts, shap):
    result = []
    def get(key): return finite(facts.get(key))
    late, all_late, dpd = get('INS_LATE_RATIO_6M'), get('INS_LATE_RATIO'), get('INS_DPD_MAX_6M')
    if late is not None:
        title = ('Không ghi nhận trả chậm trong 6 tháng' if late == 0 else
                 'Tỷ lệ trả chậm gần đây giảm' if all_late is not None and late < all_late else
                 'Tỷ lệ trả chậm gần đây tăng' if all_late is not None and late > all_late else
                 'Còn bản ghi trả chậm trong 6 tháng')
        text = f'{num(late*100)}% bản ghi trả góp có chậm trả trong 6 tháng'
        if all_late is not None: text += f', so với {num(all_late*100)}% toàn kỳ'
        text += '.'
        if dpd is not None: text += f' Chậm tối đa {num(dpd, 0)} ngày.'
        keys = ['INS_LATE_RATIO_6M'] + (['INS_LATE_RATIO'] if all_late is not None else []) + (['INS_DPD_MAX_6M'] if dpd is not None else [])
        result.append({'id': 'late', 'tone': 'positive' if late == 0 or all_late is not None and late < all_late else 'attention', 'title': title, 'text': text, 'evidence': [evidence(k, get(k)) for k in keys]})
    underpaid = get('INS_UNDERPAID_RATIO_6M')
    if underpaid is not None:
        result.append({'id': 'underpaid', 'tone': 'positive' if underpaid == 0 else 'attention', 'title': 'Không ghi nhận trả thiếu trong 6 tháng' if underpaid == 0 else 'Có bản ghi trả thiếu trong 6 tháng', 'text': f'{num(underpaid*100)}% bản ghi có khoản thanh toán thấp hơn số tiền phải trả.', 'evidence': [evidence('INS_UNDERPAID_RATIO_6M', underpaid)]})
    util, all_util = get('CC_UTILIZATION_MEAN_6M'), get('CC_UTILIZATION_MEAN')
    if util is not None:
        result.append({'id': 'utilization', 'tone': 'attention' if all_util is not None and util > all_util else 'neutral', 'title': 'Sử dụng hạn mức thẻ gần đây tăng' if all_util is not None and util > all_util else 'Sử dụng hạn mức thẻ gần đây', 'text': f'Bình quân 6 tháng: {num(util*100)}% hạn mức' + (f'; toàn kỳ: {num(all_util*100)}%.' if all_util is not None else '.'), 'evidence': [evidence('CC_UTILIZATION_MEAN_6M', util)] + ([evidence('CC_UTILIZATION_MEAN', all_util)] if all_util is not None else [])})
    pos = get('POS_DPD_MAX_12M')
    if pos is not None:
        result.append({'id': 'pos', 'tone': 'positive' if pos == 0 else 'attention', 'title': 'POS / tiền mặt chưa ghi nhận quá hạn' if pos == 0 else 'Có quá hạn POS / tiền mặt', 'text': f'Số ngày chậm tối đa trong các bản ghi 12 tháng: {num(pos, 0)} ngày.', 'evidence': [evidence('POS_DPD_MAX_12M', pos)]})
    # Group SHAP is an actual model explanation, never a fabricated repayment fact.
    if not result and shap:
        groups = sorted(shap['points'].items(), key=lambda pair: (not pair[0].startswith('internal_'), -abs(pair[1])))
        for key, value in groups:
            if abs(value) < .01: continue
            label = GROUPS.get(key, key)
            result.append({'id': 'shap_' + key, 'tone': 'positive' if value > 0 else 'attention',
                'title': f'{label}: {"+" if value > 0 else ""}{num(value, 2)} điểm B',
                'text': 'Đóng góp SHAP của nhóm thông tin so với điểm nền mô hình B. Chưa có giá trị chi tiết để kết luận riêng tỷ lệ trả chậm hoặc mức dùng hạn mức.',
                'evidence': [{'key': 'pts_' + key, 'value': value, 'unit': 'points', 'label': 'Đóng góp nhóm ' + label.lower(), 'source': 'shap_points_by_group.parquet', 'window': 'Giải thích điểm B, không phải chênh lệch B − A'}]})
    if not result:
        result.append({'id': 'missing', 'tone': 'missing', 'title': 'Chưa đủ căn cứ hành vi chi tiết', 'text': 'Nguồn hiện tại chưa có giá trị đặc trưng hoặc SHAP hợp lệ cho hồ sơ này. Không thể suy ra tỷ lệ trả chậm từ điểm tín dụng.', 'evidence': []})
    return result

def draft_observations(items):
    rows = [f"{row['title']}. {row['text']}" for row in items[:3]]
    return ' '.join(rows) + ' Cần đối chiếu hồ sơ gốc trước khi đưa ra đề xuất xử lý.'
