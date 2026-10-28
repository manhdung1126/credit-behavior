import { number, percent } from './core.js';
const W = 680, H = 284, L = 54, R = 20, T = 20, B = 43;

export function calibrationChart(rows) {
 const points = rows.filter(r => r.model === 'model_b').sort((a,b) => a.decile-b.decile);
 if (!points.length) return '<p class="empty-state">Chưa có số liệu calibration.</p>';
 const max = Math.ceil(Math.max(...points.flatMap(p => [p.pred_risk_mean, p.obs_ci95_high])) * 10) / 10;
 const x = v => L + v / max * (W-L-R), y = v => H-B - v / max * (H-T-B);
 const ticks = Array.from({length:5}, (_, i) => max * i / 4);
 const grid = ticks.map(v => `<path d="M${L},${y(v)}H${W-R}" class="chart-grid"/><text x="${L-10}" y="${y(v)+4}" text-anchor="end">${number(v*100,0)}%</text><text x="${x(v)}" y="${H-B+22}" text-anchor="middle">${number(v*100,0)}%</text>`).join('');
 const polyline = points.map(p => `${x(p.pred_risk_mean)},${y(p.observed_bad_rate)}`).join(' ');
 return `<svg viewBox="0 0 ${W} ${H}" class="data-chart" role="img" aria-labelledby="calibration-title calibration-desc"><title id="calibration-title">Calibration mô hình B</title><desc id="calibration-desc">Trục ngang: rủi ro dự đoán. Trục dọc: tỷ lệ khó khăn thanh toán quan sát. Mỗi điểm là một decile, thanh đứng là khoảng tin cậy 95%.</desc><text x="${L}" y="11" class="axis-caption">Tỷ lệ quan sát</text>${grid}<path d="M${L},${H-B}L${W-R},${T}" class="chart-ideal"/><polyline points="${polyline}" class="chart-line"/>${points.map(p => `<g><title>Decile ${p.decile}: dự đoán ${percent(p.pred_risk_mean)}, quan sát ${percent(p.observed_bad_rate)}; CI [${percent(p.obs_ci95_low)}; ${percent(p.obs_ci95_high)}]</title><path d="M${x(p.pred_risk_mean)},${y(p.obs_ci95_low)}V${y(p.obs_ci95_high)}" class="chart-ci"/><circle cx="${x(p.pred_risk_mean)}" cy="${y(p.observed_bad_rate)}" r="4" class="chart-point"/></g>`).join('')}<text x="${(L+W-R)/2}" y="${H-2}" text-anchor="middle" class="axis-caption">Rủi ro dự đoán trung bình</text></svg>`;
}

export function gradesChart(rows) {
 if (!rows.length) return '<p class="empty-state">Chưa có bảng hạng.</p>';
 const max = Math.ceil(Math.max(...rows.map(r => r.bad_rate)) * 20) / 20;
 const y = v => H-B - v / max * (H-T-B), width = (W-L-R)/10;
 const grid = [0, .1, .2, .3].filter(v => v <= max).map(v => `<path d="M${L},${y(v)}H${W-R}" class="chart-grid"/><text x="${L-10}" y="${y(v)+4}" text-anchor="end">${number(v*100,0)}%</text>`).join('');
 return `<svg viewBox="0 0 ${W} ${H}" class="data-chart" role="img" aria-labelledby="grades-title grades-desc"><title id="grades-title">Tỷ lệ khó khăn thanh toán theo 10 hạng B</title><desc id="grades-desc">Hạng 1 tốt nhất, tỷ lệ khoảng 0,83%; hạng 10 khoảng 30,41%. Trục tỷ lệ bắt đầu từ 0.</desc><text x="${L}" y="11" class="axis-caption">Tỷ lệ khó khăn thanh toán</text>${grid}${rows.map((r,i) => `<g><title>Hạng ${r.grade}: ${percent(r.bad_rate)}; ${number(r.n_customers,0)} khách hàng</title><rect x="${L+i*width+10}" y="${y(r.bad_rate)}" width="${width-20}" height="${H-B-y(r.bad_rate)}" rx="3" fill="${i<5?'#aa8b45':'#6f7379'}"/><text x="${L+i*width+width/2}" y="${H-B+22}" text-anchor="middle">${r.grade}</text></g>`).join('')}<text x="${(L+W-R)/2}" y="${H-2}" text-anchor="middle" class="axis-caption">Hạng tín dụng · 1 tốt nhất</text></svg>`;
}
