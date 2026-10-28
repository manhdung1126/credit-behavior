/** Pure calculations. Behavior observations are not causal explanations of a model. */
export const number = (value, digits = 2) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
export const percent = (value, digits = 2) => typeof value === 'number' && Number.isFinite(value) ? number(value * 100, digits) + '%' : '—';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const signed = (value, digits = 2) => (value > 0 ? '+' : '') + number(value, digits);
export const groupLabels = { rehabilitated: 'Phục hồi', unrehabilitated: 'Chưa phục hồi', never_bad: 'Chưa từng xấu đạt ngưỡng', no_bureau_balance: 'Thiếu lịch sử Bureau', excluded_missing_data: 'Thiếu dữ liệu đối chiếu', no_internal_history: 'Thiếu lịch sử nội bộ' };
export const groupNames = { internal_installment_behavior: 'Thanh toán trả góp', internal_pos_cash_behavior: 'Vay POS / tiền mặt', internal_credit_card_behavior: 'Hành vi thẻ tín dụng', internal_previous_app_history: 'Đăng ký vay trước đây', bureau_delinquency_history: 'Lịch sử quá hạn Bureau', bureau_credit_exposure: 'Dư nợ Bureau', ext_source_scores: 'Điểm từ nguồn ngoài', application_financial_ratios: 'Tỷ lệ tài chính', applicant_demographics_stability: 'Thông tin hồ sơ', other_factors: 'Các yếu tố khác' };
export function scoreFromProbability(probability, scoring) {
 if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) throw new Error('Xác suất phải nằm trong (0, 1).');
 return Math.min(scoring.clip_max, Math.max(scoring.clip_min, scoring.offset - scoring.factor * Math.log(probability / (1 - probability))));
}
export function gradeFromScore(score, scoring) {
 if (!Number.isFinite(score)) return null;
 return 10 - scoring.internal_cutoffs.filter(cutoff => score >= cutoff).length;
}
export function behaviorReasons(profile) { return profile.observations || []; }
export function reasonDraft(profile) { return profile.observationDraft || 'Chưa đủ căn cứ để nêu lý do hành vi chi tiết.'; }
export function modelSummary(profile, scoring) {
 const a = profile.models.a, b = profile.models.b;
 const active = b || a;
 return { a, b, active, activeName: b ? 'B' : 'A', delta: b ? b.score - a.score : null, grade: active.grade ?? gradeFromScore(active.score, scoring) };
}
export function validateDataset(data) {
 if (data?.schemaVersion !== 1 || !Array.isArray(data.profiles) || !data.profiles.length) throw new Error('Bộ dữ liệu chưa có hồ sơ hợp lệ.');
 const ids = new Set();
 for (const p of data.profiles) {
  if (!p.id || ids.has(p.id)) throw new Error('Mã hồ sơ bị thiếu hoặc trùng.'); ids.add(p.id);
  if (!['demo', 'research', 'imported'].includes(p.sourceKind)) throw new Error('Nguồn hồ sơ không hợp lệ.');
  for (const tag of ['a', 'b']) { const model = p.models?.[tag]; if (!model && tag === 'b') continue;
   if (!model || !Number.isFinite(model.score) || model.score < 1 || model.score > 1001 || !Number.isFinite(model.probability) || model.probability <= 0 || model.probability >= 1) throw new Error('Điểm hoặc xác suất hồ sơ không hợp lệ.');
   if (model.grade !== gradeFromScore(model.score, data.scoring)) throw new Error('Hạng hồ sơ không khớp ngưỡng phân hạng.');
   if (Math.abs(scoreFromProbability(model.probability, data.scoring)-model.score) > .1) throw new Error('Xác suất và điểm hồ sơ chưa nhất quán.');
  }
  if (p.shapGroups) {
   const base=p.shapGroups.baseScore, values=Object.values(p.shapGroups.points||{});
   const finite=typeof base==='number'&&Number.isFinite(base)&&values.length&&values.every(v=>typeof v==='number'&&Number.isFinite(v));
   const reconstructed=finite?Math.max(data.scoring.clip_min,Math.min(data.scoring.clip_max,base+values.reduce((a,b)=>a+b,0))):null;
   if (!p.models.b||reconstructed===null||Math.abs(reconstructed-p.models.b.score)>1) {p.shapGroups=null;p.shapStatus='stale';}
  }
  for (const [key, value] of Object.entries(p.facts || {})) {
   if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Giá trị hành vi cần là số hoặc null.');
   if (value !== null && (key.includes('LATE_RATIO') || key.includes('UNDERPAID_RATIO')) && (value < 0 || value > 1)) throw new Error('Tỷ lệ hành vi ngoài khoảng 0–1.');
  }
 }
 if (data.meta?.profileMode !== 'imported' && (!data.research?.metrics?.length || !data.research?.policies?.length)) throw new Error('Thiếu kết quả nghiên cứu.');
 return data;
}
export function validateReview(decision, note) {
 if (!['Tiếp tục thẩm định', 'Yêu cầu bổ sung thông tin', 'Chuyển rà soát chuyên sâu'].includes(decision)) return 'Chọn hướng xử lý trước khi lưu.';
 if (typeof note !== 'string' || note.trim().length < 15) return 'Nêu lý do cụ thể cho đề xuất (ít nhất 15 ký tự).';
 return null;
}
