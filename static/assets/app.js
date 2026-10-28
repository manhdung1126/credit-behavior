import { number, percent, signed, gradeFromScore, escapeHtml as esc, groupLabels, groupNames, behaviorReasons, reasonDraft, modelSummary, validateDataset, validateReview } from './core.js?v=9';
import { calibrationChart, gradesChart } from './charts.js?v=9';

const paths = {
 arrow:'M4 12h16m-6-6 6 6-6 6', chevron:'m9 6 6 6-6 6', search:'M21 21l-5-5M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0', check:'m5 12 4 4L19 6', plus:'M12 5v14M5 12h14', info:'M12 11v6m0-10h.01', trend:'m3 17 6-6 4 4 8-10m-6 0h6v6', download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', clock:'M12 7v5l3 2', file:'M14 2H6v20h12V6Zm0 0v5h5M8 12h8M8 16h6',
};
function icon(name,size=18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${['info','clock'].includes(name)?'<circle cx="12" cy="12" r="9"/>':''}<path d="${paths[name]||paths.info}"/></svg>`; }
const app=document.getElementById('app'), dialog=document.getElementById('dialog');
let dataset, selectedId, route='appraisal', policyMode='fixed', researchGroup='full', chartMode='calibration', reviews={}, drafts={}, toastTimer;
let lastDialogFocus=null, activeSource='original', sources=[], searchOffset=0, searchQuery='', searchGroup='all', searchVersion=0, sourceVersion=0, searchTimer;
const sourceDrafts={};
let catalogMode='all';
let workspaceClient, viewWrites=Promise.resolve(), policyVersion=0, selectionVersion=0;
let customPolicy={rule:'score',threshold:700,cohort:'all'}, customResult=null;
const workspacePath=path=>path+'?client='+encodeURIComponent(workspaceClient);
function writeWorkspace(path,options,source=activeSource) {
 const target=workspacePath(path)+'&source='+encodeURIComponent(source);
 viewWrites=viewWrites.catch(()=>{}).then(()=>api(target,options));
 return viewWrites;
}
function rememberView(source,nextRoute) { return writeWorkspace('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,route:nextRoute})},source); }
const sourceName=(source)=>source?.id==='original'?'Home Credit':source?.name||'Bộ dữ liệu';
const dataName=()=>sourceName(sources.find(s=>s.id===activeSource));
const selected=()=>dataset.profiles.find(p=>p.id===selectedId);

function toast(message) { const el=document.getElementById('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3500); }
function captureDraft() { const note=document.getElementById('review-note'), decision=document.getElementById('review-decision'); if(note&&decision) drafts[selectedId]={note:note.value,decision:decision.value}; }
async function api(path, options={}) { if(!path.startsWith('/api/sources')&&!/[?&]source=/.test(path))path+=(path.includes('?')?'&':'?')+'source='+encodeURIComponent(activeSource); const response=await fetch(path, options); const body=await response.json(); if(!response.ok)throw new Error(typeof body.detail==='string'?body.detail:'Máy chủ chưa xử lý được yêu cầu.'); return body; }
function openDialog(title,content) { lastDialogFocus=document.activeElement; if(dialog.open)dialog.close(); document.getElementById('dialog-title').textContent=title; document.getElementById('dialog-content').innerHTML=content; dialog.showModal(); }
function closeDialog() { dialog.close(); lastDialogFocus?.focus(); }
async function go(next, capture=true) {
 if(capture)captureDraft();const source=activeSource,nextRoute=['catalog','appraisal','policy','research'].includes(next)?next:'appraisal';
 await rememberView(source,nextRoute);if(source!==activeSource)return;
 route=nextRoute;document.querySelectorAll('[data-route]').forEach(el=>{const active=el.dataset.route===route;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 document.getElementById('workspace-section').textContent={catalog:'Danh sách hồ sơ',appraisal:'Thẩm định',policy:'Mô phỏng chính sách',research:'Báo cáo mô hình'}[route];render();window.scrollTo({top:0,behavior:'smooth'});
}
function render() { if(!dataset)return; app.innerHTML=route==='catalog'?catalogView():route==='appraisal'?appraisal():route==='policy'?policyView():researchView(); if(route==='catalog')renderProfileList(); document.title=`CreditDesk · ${{catalog:'Danh sách hồ sơ',appraisal:'Thẩm định hồ sơ',policy:'Mô phỏng chính sách',research:'Báo cáo mô hình'}[route]}`; }

function profileTag(p) { return `<span class="badge ${p.cohort==='unrehabilitated'?'badge-amber':''}">${esc(groupLabels[p.cohort]||p.cohort)}${p.cohort==='rehabilitated'?' theo Bureau':''}</span>`; }
function appraisal() {
 const p=selected(), m=modelSummary(p,dataset.scoring), reasons=behaviorReasons(p), index=dataset.profiles.indexOf(p);
 return `<div class="page-heading"><div><h1>Thẩm định hồ sơ</h1><p class="subtitle">Đối chiếu thông tin và ghi nhận đề xuất xử lý.</p></div><button class="button button-outline" data-action="choose-profile">${icon('file',15)} Tra hồ sơ khác</button></div>
 <div class="profile-toolbar"><div class="profile-title"><h2>${esc(p.id)}</h2>${profileTag(p)}<span class="source-chip">${dataset.profiles.length} hồ sơ trong bàn</span></div><div class="profile-pager"><button class="icon-button" data-action="previous" aria-label="Hồ sơ đã mở trước" ${index===0?'disabled':''}><span class="rotate">${icon('chevron',16)}</span></button><span><select id="desk-profile" aria-label="Chuyển hồ sơ trong bàn">${dataset.profiles.map(profile=>`<option value="${esc(profile.id)}" ${profile.id===p.id?'selected':''}>${esc(profile.id)}</option>`).join('')}</select></span><button class="icon-button" data-action="next" aria-label="Hồ sơ đã mở tiếp theo" ${index===dataset.profiles.length-1?'disabled':''}>${icon('chevron',16)}</button><button class="icon-button more" data-action="profile-info" aria-label="Thông tin và lịch sử hồ sơ">···</button></div></div>
 <div class="appraisal-layout"><div class="assessment-column">
  <section class="panel score-panel" aria-label="Kết quả mô hình"><div class="score-layout"><div><p class="field-label">Điểm tín dụng <span>· Mô hình ${m.activeName}</span></p><p class="credit-score">${number(m.active.score)}<small>/ 1.001</small></p><p class="quiet">Điểm cao hơn, rủi ro dự đoán thấp hơn</p></div><div class="risk-block"><p class="field-label">Rủi ro dự đoán</p><p class="risk-value">${percent(m.active.probability)}</p><p class="quiet"><b>Hạng ${m.grade} / 10</b> · Hạng 1 tốt nhất</p></div></div>
   <div class="comparison-strip">${m.b?`<span>So với A <strong>${number(m.a.score)}</strong></span><span class="change ${m.delta<0?'change-down':''}">${m.delta>0?'+':''}${number(m.delta)} điểm khi thêm hành vi</span>`:'<span>Chỉ có mô hình nền A</span><span>Cần bổ sung lịch sử nội bộ</span>'}</div>
   <details class="panel-details"><summary>Đối chiếu hai mô hình <span>+</span></summary><div class="details-body"><div class="table-scroll"><table class="compact-table"><thead><tr><th></th><th>A · Mô hình nền</th><th>B · Có hành vi</th></tr></thead><tbody><tr><th>Điểm</th><td>${number(m.a.score)}</td><td>${m.b?number(m.b.score):'Chưa có'}</td></tr><tr><th>Rủi ro</th><td>${percent(m.a.probability)}</td><td>${m.b?percent(m.b.probability):'—'}</td></tr><tr><th>Hạng</th><td>${m.a.grade}</td><td>${m.b?m.b.grade:'—'}</td></tr></tbody></table></div><p class="help-text">A: hồ sơ và lịch sử tín dụng bên ngoài. B: bổ sung hành vi tín dụng nội bộ. Rủi ro là xác suất gặp khó khăn thanh toán theo mô hình.</p>${shapDetails(p)}</div></details>
  </section>
  <section class="panel behavior-panel" aria-labelledby="behavior-title"><div class="section-heading"><div><h2 id="behavior-title">Căn cứ đánh giá</h2><p class="section-subtitle">${p.shapGroups?'Đóng góp của nhóm thông tin vào điểm tín dụng':'Chỉ tiêu hành vi trong hồ sơ'}</p></div><button class="icon-button" data-action="reason-scope" aria-label="Phạm vi giải thích hành vi">${icon('info',17)}</button></div><div class="reason-list">${reasons.slice(0,3).map(reasonItem).join('')}</div>${reasons.length>3?`<details class="panel-details"><summary>Xem thêm ${reasons.length-3} tín hiệu <span>+</span></summary><div class="details-body reason-list">${reasons.slice(3).map(reasonItem).join('')}</div></details>`:''}</section>
 </div><aside class="panel review-panel" aria-label="Ghi nhận thẩm định">${reviewForm(p)}</aside></div>`;
}
function reasonItem(r) {
 const isGroup=r.id.startsWith('shap_'),title=isGroup?r.title.replace(' điểm B',' điểm'):r.title;
 const text=isGroup?'Đóng góp của nhóm thông tin vào điểm tín dụng.':r.tone==='missing'?'Chưa có chỉ tiêu chi tiết cho hồ sơ này.':r.text;
 return `<article class="reason-item"><span class="reason-symbol ${r.tone}">${icon(r.tone==='positive'?'check':r.tone==='attention'?'info':r.tone==='missing'?'info':'trend',16)}</span><div><h3>${esc(title)}</h3>${isGroup?'':`<p>${esc(text)}</p>`}${r.evidence.length?`<button class="text-button evidence-button" data-action="evidence" data-reason="${esc(r.id)}">Xem chi tiết ${icon('chevron',12)}</button>`:''}</div></article>`;
}
function shapDetails(p) {
 if (!p.shapGroups) return `<p class="model-scope">Chưa có phân tích đóng góp cho hồ sơ này.</p>`;
 const items=Object.entries(p.shapGroups.points).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])), max=Math.max(...items.map(([,v])=>Math.abs(v)),1);
 return `<h3 class="subheading">Đóng góp nhóm thông tin vào điểm B</h3><div class="shap-legend"><span>← Giảm điểm</span><span>Tăng điểm →</span></div>${items.map(([key,value])=>`<div class="shap-row"><span>${esc(groupNames[key]||key)}</span><div class="shap-track"><div class="shap-half left">${value<0?`<i class="shap-bar down" style="width:${Math.abs(value)/max*95}%"></i>`:''}</div><div class="shap-half">${value>=0?`<i class="shap-bar" style="width:${value/max*95}%"></i>`:''}</div></div><b>${signed(value)}</b></div>`).join('')}<p class="help-text">Điểm nền ${number(p.shapGroups.baseScore)} + tổng đóng góp, sau chặn biên = ${number(p.models.b.score)}. </p>`;
}
function reviewForm(p) {
 const draft=drafts[p.id]||reviews[p.id]||{decision:'',note:''},saved=reviews[p.id];
 return `<div class="review-heading"><span class="review-icon">${icon('file',19)}</span><h2>Đề xuất xử lý</h2></div><p class="section-subtitle">Chuyên viên ghi nhận hướng xử lý và lý do.</p><form id="review-form" novalidate><label for="review-decision">Hướng xử lý</label><select id="review-decision" name="decision" aria-describedby="review-error"><option value="">Chọn đề xuất…</option>${['Tiếp tục thẩm định','Yêu cầu bổ sung thông tin','Chuyển rà soát chuyên sâu'].map(v=>`<option ${draft.decision===v?'selected':''}>${esc(v)}</option>`).join('')}</select><div class="note-label"><label for="review-note">Lý do đề xuất</label><span>Bắt buộc</span></div><textarea id="review-note" name="note" rows="5" maxlength="3000" aria-describedby="review-error" placeholder="Nêu tín hiệu hành vi, thông tin cần đối chiếu hoặc bổ sung…">${esc(draft.note)}</textarea><button type="button" class="text-button draft-button" data-action="draft-reasons">${icon('plus',12)} Dùng tóm tắt hành vi</button><p class="field-error" id="review-error" role="alert"></p><button type="submit" class="button button-primary save-button">Lưu đề xuất ${icon('arrow',15)}</button></form><div class="review-footer">${saved?`<button class="saved-state" data-action="profile-info">${icon('check',13)} Đã ghi nhận · Xem chi tiết</button>`:'<span>Chưa có nhận xét được lưu.</span>'}<button class="text-button" data-action="export-review">Xuất biên bản ${icon('download',12)}</button></div>`;
}
async function saveReview() {
 captureDraft();const draft=drafts[selectedId],error=validateReview(draft.decision,draft.note);
 if(error){document.getElementById('review-error').textContent=error;document.getElementById(draft.decision?'review-note':'review-decision').focus();return;}
 const source=activeSource,id=selectedId,button=document.querySelector('.save-button');button.disabled=true;
 try{
  const entry=await api('/api/profiles/'+encodeURIComponent(id)+'/review',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:draft.decision,note:draft.note.trim()})});
  if(source!==activeSource){toast('Đã lưu đề xuất vào nguồn trước đó.');return;}
  reviews[id]=entry;drafts[id]={decision:entry.decision,note:entry.note};
  if(selectedId===id&&route==='appraisal')document.querySelector('.review-panel').innerHTML=reviewForm(selected());
  toast('Đã lưu đề xuất cho '+id+'.');
 }catch(error){const el=document.getElementById('review-error');if(el)el.textContent=error.message;else toast(error.message);}
 finally{if(button.isConnected)button.disabled=false;}
}

function chooseProfile() { return go('catalog'); }
function setCatalogScope(mode) {
 searchQuery=document.getElementById('profile-search').value.trim();searchGroup=document.getElementById('cohort-filter').value;clearTimeout(searchTimer);searchOffset=0;catalogMode=mode;render();
}
function catalogView() {
 return `<div class="page-heading"><div><h1>Danh sách hồ sơ</h1><p class="subtitle">Tra cứu và xử lý hồ sơ tín dụng.</p></div><button class="button button-outline" data-action="open-import">${icon('plus',16)} Nhập dữ liệu</button></div>
 <section class="panel source-panel" aria-label="Bộ dữ liệu"><div class="source-selector"><label for="data-source">Bộ dữ liệu</label><select id="data-source">${sources.map(s=>`<option value="${esc(s.id)}" ${s.id===activeSource?'selected':''}>${esc(sourceName(s))}</option>`).join('')}</select><span class="source-total">${number(dataset.meta.totalProfiles,0)} hồ sơ</span></div>
 <details id="import-details" class="import-details"><summary>Nhập bộ dữ liệu</summary><form id="import-form"><label for="source-file">Chọn tệp CSV</label><input id="source-file" type="file" accept=".csv,text/csv" required aria-describedby="import-help"><p id="import-help" class="help-text">CSV UTF-8, tối đa 10 MB. Sử dụng tệp mẫu để chuẩn bị dữ liệu.</p><div class="import-actions"><button class="button button-primary" type="submit">Nhập và sử dụng</button><a class="text-button" href="/assets/profile-template.csv" download>${icon('download',14)} Tải tệp mẫu</a></div><p id="import-error" class="field-error" role="alert"></p></form><details class="dialog-details"><summary>Hướng dẫn định dạng</summary><p class="help-text">Ba cột bắt buộc: SK_ID_CURR (mã hồ sơ), pred_risk_model_a và pred_risk_model_b (xác suất dự đoán trong khoảng 0–1, không gồm hai đầu mút). Các cột bổ sung: cohort_t2_N12 và chỉ tiêu hành vi. Dữ liệu chưa có để trống.</p></details></details></section>
 <section class="panel catalog-panel" aria-label="Tra cứu hồ sơ"><div class="catalog-heading"><div><h2>Hồ sơ tín dụng <span class="count-badge">${number(catalogMode==='desk'?dataset.profiles.length:dataset.meta.totalProfiles,0)}</span></h2></div><span>${number(Object.keys(reviews).length,0)} hồ sơ đã ghi nhận</span></div><div class="view-tabs" role="group" aria-label="Phạm vi danh sách"><button data-action="catalog-all" class="${catalogMode==='all'?'active':''}" aria-pressed="${catalogMode==='all'}">Tất cả hồ sơ</button><button data-action="catalog-desk" class="${catalogMode==='desk'?'active':''}" aria-pressed="${catalogMode==='desk'}">Trong bàn thẩm định <span>${dataset.profiles.length}</span></button></div><form id="search-form" class="catalog-filters"><div class="search-field"><label for="profile-search">Mã hồ sơ</label><div class="search-input">${icon('search',17)}<input type="search" id="profile-search" maxlength="32" value="${esc(searchQuery)}" placeholder="Tìm theo mã hồ sơ…"></div></div><div><label for="cohort-filter">Phân nhóm khách hàng</label><select id="cohort-filter"><option value="all">Tất cả nhóm</option>${dataset.meta.cohorts.map(g=>`<option value="${esc(g)}" ${g===searchGroup?'selected':''}>${esc(groupLabels[g]||g)}</option>`).join('')}</select></div><button type="submit" class="button button-primary">Tra cứu ${icon('arrow',15)}</button></form><div id="profile-list" aria-live="polite"></div><div class="catalog-pagination"><p id="search-count" role="status"></p><div><button class="button button-outline" data-action="search-previous" disabled>Trang trước</button><button class="button button-outline" data-action="search-next" disabled>Trang sau</button></div></div></section>`;
}
async function renderProfileList() {
 const target=document.getElementById('profile-list');if(!target)return;
 const version=++searchVersion,source=activeSource;
 searchQuery=document.getElementById('profile-search').value.trim();searchGroup=document.getElementById('cohort-filter').value;
 target.innerHTML='<p class="empty-state">Đang tìm hồ sơ…</p>';
 document.querySelectorAll('[data-action^="search-"]').forEach(b=>b.disabled=true);
 try{
  let result;
  if(catalogMode==='desk'){const rows=dataset.profiles.filter(p=>p.id.includes(searchQuery)&&(searchGroup==='all'||p.cohort===searchGroup));result={total:rows.length,items:rows.slice(searchOffset,searchOffset+25).map(p=>({id:p.id,cohort:p.cohort,score:p.models.b.score,delta:p.models.b.score-p.models.a.score}))};}
  else result=await api('/api/profiles?'+new URLSearchParams({q:searchQuery,cohort:searchGroup,offset:searchOffset,limit:25}));
  if(version!==searchVersion||source!==activeSource||!target.isConnected)return;
  target.innerHTML=result.items.length?`<div class="table-scroll"><table class="compact-table catalog-table"><thead><tr><th>Mã hồ sơ</th><th>Phân nhóm</th><th>Điểm tín dụng</th><th>Hạng</th><th>So với mô hình nền</th><th>Ghi nhận</th><th></th></tr></thead><tbody>${result.items.map(p=>`<tr class="${p.id===selectedId?'selected-row':''}"><th><span class="record-id">${esc(p.id)}</span></th><td><span class="cohort-label ${p.cohort==='unrehabilitated'?'attention':''}">${esc(groupLabels[p.cohort]||p.cohort)}</span></td><td class="table-score">${number(p.score)}</td><td><span class="grade-label">${gradeFromScore(p.score,dataset.scoring)} / 10</span></td><td class="${p.delta>=0?'positive-text':'negative-text'}">${signed(p.delta)}</td><td><span class="review-status ${reviews[p.id]?'complete':''}">${reviews[p.id]?'Đã ghi nhận':'Chưa ghi nhận'}</span></td><td><button class="text-button" data-action="select-profile" data-id="${esc(p.id)}" aria-label="Mở hồ sơ ${esc(p.id)}">Mở hồ sơ ${icon('arrow',13)}</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty-state">Không có hồ sơ phù hợp. Thử mã khác hoặc chọn tất cả nhóm.</p>';
  document.getElementById('search-count').textContent=result.total?`${number(searchOffset+1,0)}–${number(searchOffset+result.items.length,0)} / ${number(result.total,0)} hồ sơ`:'0 hồ sơ';
  document.querySelector('[data-action="search-previous"]').disabled=searchOffset===0;
  document.querySelector('[data-action="search-next"]').disabled=searchOffset+25>=result.total;
 }catch(error){if(version===searchVersion&&target.isConnected)target.innerHTML=`<p class="field-error">${esc(error.message)}</p><button class="button button-outline" data-action="search-retry">Thử lại</button>`;}
}
async function selectProfile(id) {
 captureDraft();const source=activeSource,version=++selectionVersion;let profile=dataset.profiles.find(p=>p.id===id);
 if(!profile){profile=await api('/api/profiles/'+encodeURIComponent(id));if(source!==activeSource||version!==selectionVersion)return;validateDataset({...dataset,profiles:[profile]});}
 await writeWorkspace('/api/workspace/desk/'+encodeURIComponent(id),{method:'PUT'},source);if(source!==activeSource||version!==selectionVersion)return;
 if(!dataset.profiles.some(p=>p.id===id))dataset.profiles.push(profile);
 selectedId=id;if(dialog.open)closeDialog();await go('appraisal',false);
}
async function loadSource(id, nextRoute='catalog') {
 const version=++sourceVersion;++selectionVersion;
 const query='?source='+encodeURIComponent(id),deskQuery=query+'&client='+encodeURIComponent(workspaceClient);
 const [response,reviewResponse,deskResponse]=await Promise.all([fetch('/api/dataset'+query),fetch('/api/reviews'+query),fetch('/api/workspace/desk'+deskQuery)]);
 if(!response.ok||!reviewResponse.ok||!deskResponse.ok)throw new Error('Không mở được nguồn. Hãy chọn lại hoặc nhập lại tệp.');
 const next=await response.json(),nextReviews=await reviewResponse.json(),desk=await deskResponse.json();if(version!==sourceVersion)return;
 next.profiles=desk.profiles;validateDataset(next);
 captureDraft();sourceDrafts[activeSource]=drafts;activeSource=id;dataset=next;reviews=nextReviews;drafts=sourceDrafts[id]||{};selectedId=desk.selectedId;
 customResult=null;++policyVersion;customPolicy.cohort='all';
 searchOffset=0;searchQuery='';searchGroup='all';++searchVersion;
 document.getElementById('environment-label').textContent=dataName();
 
 await go(nextRoute,false);
}
async function importSource(form) {
 const file=document.getElementById('source-file').files[0],error=document.getElementById('import-error');
 if(!file){error.textContent='Chọn tệp CSV trước khi nhập.';return;}
 if(file.size>10*1024*1024){error.textContent='CSV vượt quá 10 MB. Hãy chia nhỏ tệp.';return;}
 const button=form.querySelector('button');button.disabled=true;button.textContent='Đang kiểm tra và nhập…';error.textContent='';
 try{const result=await api('/api/sources?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'text/csv'},body:file});sources=await api('/api/sources');await loadSource(result.id);toast('Đã nhập nguồn CSV. Bạn có thể tra tất cả hồ sơ trong tệp.');}
 catch(problem){if(error.isConnected)error.textContent=problem.message;else toast(problem.message);}
 finally{if(button.isConnected){button.disabled=false;button.textContent='Nhập và sử dụng';}}
}

function showEvidence(id) {
 const reason=behaviorReasons(selected()).find(r=>r.id===id);if(!reason)return;
 openDialog('Chi tiết yếu tố đánh giá',`<p class="dialog-lead">${esc(reason.title.replace(' điểm B',' điểm'))}</p><div class="evidence-grid">${reason.evidence.map(e=>`<article><h3>${esc(e.label)}</h3><div class="evidence-value">${e.unit==='points'?signed(e.value)+' điểm':e.key.includes('RATIO')||e.key.includes('UTILIZATION')?percent(e.value,1):number(e.value,e.key.includes('DPD')?0:2)}</div><p>${e.unit==='points'?'Đóng góp vào điểm tín dụng':esc(e.window)}</p></article>`).join('')}</div><div class="info-row"><span>Bộ dữ liệu</span><strong>${esc(dataName())}</strong></div>`);
}
function profileInfo() {
 captureDraft();const p=selected(),r=reviews[p.id];
 openDialog('Hồ sơ '+p.id,`<div class="info-row"><span>Bộ dữ liệu</span><strong>${esc(dataName())}</strong></div><div class="info-row"><span>Phân nhóm</span><strong>${esc(groupLabels[p.cohort]||p.cohort)}</strong></div><h3 class="subheading">Ghi nhận gần nhất</h3>${r?`<div class="history-entry"><strong>${esc(r.decision)}</strong><p>${esc(r.note)}</p><small>${new Date(r.time).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small></div>`:'<p class="help-text">Chưa có ghi nhận.</p>'}<div class="dialog-actions"><button class="button button-outline" data-action="export-review">${icon('download',14)} Xuất biên bản</button></div>`);
}
function exportReview() { captureDraft();const p=selected(),data={application:'CreditDesk',schemaVersion:1,exportedAt:new Date().toISOString(),notice:'Biên bản hỗ trợ thẩm định; không phải quyết định cấp tín dụng.',profile:p,draft:drafts[p.id]||null,savedReview:reviews[p.id]||null};downloadJson(data,`CreditDesk-${p.id}.json`);toast('Đã xuất biên bản '+p.id+'.'); }
function downloadJson(data,filename) {const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1200);}

function policyView() {
 return `<div class="page-heading"><div><h1>Mô phỏng chính sách</h1><p class="subtitle">Thiết lập điều kiện và đối chiếu kết quả giữa hai mô hình.</p></div><span class="source-chip">${esc(dataName())}</span></div><div class="segmented policy-switch" role="group" aria-label="Chọn chính sách">${[['fixed','Giữ tỷ lệ duyệt 50%'],['risk','Giữ rủi ro quan sát'],['custom','Tự thiết lập']].map(([mode,label])=>`<button data-action="policy-${mode}" class="${policyMode===mode?'active':''}" aria-pressed="${policyMode===mode}">${label}</button>`).join('')}</div>${policyMode==='custom'?customPolicyView():presetPolicyView()}`;
}
function customPolicyView() {
 const score=customPolicy.rule==='score',approval=customPolicy.rule==='approval';
 const hint=approval?'Mỗi mô hình chọn các hồ sơ có rủi ro dự đoán thấp nhất theo tỷ lệ mục tiêu.':score?'Chọn hồ sơ có điểm lớn hơn hoặc bằng ngưỡng.':'Chọn hồ sơ có rủi ro dự đoán nhỏ hơn hoặc bằng ngưỡng.';
 return `<div class="policy-workspace"><section class="panel custom-policy-panel"><h2>Thiết lập điều kiện</h2><form id="policy-form" class="policy-form"><div><label for="policy-rule">Tiêu chí</label><select id="policy-rule"><option value="score" ${score?'selected':''}>Điểm tín dụng tối thiểu</option><option value="risk" ${customPolicy.rule==='risk'?'selected':''}>Rủi ro dự đoán tối đa</option><option value="approval" ${approval?'selected':''}>Tỷ lệ duyệt mục tiêu</option></select></div><div><label for="policy-threshold">${approval?'Tỷ lệ duyệt (%)':score?'Điểm tối thiểu':'Rủi ro tối đa (%)'}</label><input type="number" id="policy-threshold" value="${customPolicy.threshold}" min="${score?1:0}" max="${score?1001:100}" step="${score?1:.01}" required></div><div><label for="policy-cohort">Phạm vi khách hàng</label><select id="policy-cohort"><option value="all">Toàn bộ hồ sơ</option>${dataset.meta.cohorts.map(c=>`<option value="${esc(c)}" ${customPolicy.cohort===c?'selected':''}>${esc(groupLabels[c]||c)}</option>`).join('')}</select></div><button class="button button-primary" type="submit">Chạy mô phỏng ${icon('arrow',15)}</button></form><p class="help-text">${hint}</p><p id="policy-error" class="field-error" role="alert"></p></section><div id="custom-policy-result" aria-live="polite">${customResult?customPolicyResults(customResult):'<section class="panel policy-empty"><h2>Kết quả mô phỏng</h2><p>Chọn điều kiện ở bên cạnh rồi chạy mô phỏng để đối chiếu A và B.</p></section>'}</div></div>`;
}
function customPolicyResults(result) {
 const a=result.models.a,b=result.models.b,approval=result.rule==='approval';
 const label=approval?'Tỷ lệ duyệt mục tiêu '+percent(result.threshold):result.rule==='score'?'Điểm tối thiểu '+number(result.threshold,0):'Rủi ro tối đa '+percent(result.threshold);
 const rows=[['Số hồ sơ được chọn',number(a.eligibleCount,0),number(b.eligibleCount,0)],['Tỷ lệ trên phạm vi đã chọn',percent(a.eligibleRate),percent(b.eligibleRate)],['Không được chọn',number(a.excludedCount,0),number(b.excludedCount,0)],['Rủi ro dự đoán bình quân',percent(a.meanPredictedRisk),percent(b.meanPredictedRisk)]];
 if(approval)rows.push(['Rủi ro tại mốc chọn',percent(a.cutoffRisk),percent(b.cutoffRisk)],['Điểm thấp nhất trong nhóm chọn',number(a.cutoffScore),number(b.cutoffScore)]);
 const delta=approval?(a.meanPredictedRisk===null||b.meanPredictedRisk===null?'Không có hồ sơ được chọn':signed((b.meanPredictedRisk-a.meanPredictedRisk)*100)+' điểm phần trăm'):signed(result.deltaCount,0)+' hồ sơ';
 return `<section class="panel policy-result-panel"><div class="result-heading"><h2>Kết quả mô phỏng</h2><span class="result-count">${number(result.total,0)} hồ sơ</span></div><p class="result-condition">${label}</p><p class="section-subtitle">${esc(result.cohort==='all'?'Toàn bộ hồ sơ':groupLabels[result.cohort]||result.cohort)} · ${esc(dataName())}</p><div class="table-scroll"><table class="policy-comparison"><thead><tr><th>Chỉ tiêu</th><th><span class="model-tag">A</span> Mô hình nền</th><th><span class="model-tag model-tag-b">B</span> Có hành vi</th></tr></thead><tbody>${rows.map(([title,av,bv],i)=>`<tr class="${i===0?'comparison-primary':''}"><th scope="row">${title}</th><td>${av}</td><td>${bv}</td></tr>`).join('')}</tbody></table></div><div class="result-delta"><strong>${delta}</strong><span>${approval?'Chênh lệch rủi ro dự đoán bình quân B − A.':'Chênh lệch số hồ sơ B − A ('+signed(result.deltaRate*100)+' điểm phần trăm).'}</span></div>${approval?`<p class="result-note">Số hồ sơ làm tròn xuống theo tỷ lệ mục tiêu.${a.tieBreakUsed||b.tieBreakUsed?' Hồ sơ đồng mức tại mốc chọn được xếp theo mã tăng dần.':''}</p>`:''}<p class="result-note">Mô phỏng theo dữ liệu đang chọn; chưa áp dụng phê duyệt.</p></section>`;
}
function readPolicyControls() {
 customPolicy={rule:document.getElementById('policy-rule').value,threshold:Number(document.getElementById('policy-threshold').value),cohort:document.getElementById('policy-cohort').value};
 customResult=null;++policyVersion;
 const target=document.getElementById('custom-policy-result');if(target)target.innerHTML='<section class="panel policy-empty"><h2>Kết quả mô phỏng</h2><p>Điều kiện đã thay đổi. Chạy lại để cập nhật kết quả.</p></section>';
}
async function simulatePolicy(form) {
 readPolicyControls();const version=policyVersion,source=activeSource,button=form.querySelector('button'),error=document.getElementById('policy-error');
 button.disabled=true;button.textContent='Đang tính kết quả…';error.textContent='';
 try{
  const result=await api('/api/policy/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rule:customPolicy.rule,threshold:customPolicy.rule==='score'?customPolicy.threshold:customPolicy.threshold/100,cohort:customPolicy.cohort})});
  if(version!==policyVersion||source!==activeSource)return;customResult=result;const target=document.getElementById('custom-policy-result');if(target)target.innerHTML=customPolicyResults(result);
 }catch(problem){if(version===policyVersion&&error.isConnected)error.textContent=problem.message;}
 finally{if(button.isConnected){button.disabled=false;button.innerHTML='Chạy mô phỏng '+icon('arrow',15);}}
}
function presetPolicyView() {
 const risk=policyMode==='risk',row=dataset.research.policies.find(r=>r.cohort==='cohort_t2_N12'&&(risk?r.policy_mode.startsWith('mode2_'):r.policy_mode==='mode1_fixed_system_approval_50pct'));
 if(!row)return '<div class="empty-state"><p>Bộ dữ liệu này chưa có chính sách mẫu. Chọn Tự thiết lập để mô phỏng trên dữ liệu đang dùng.</p></div>';
 return `<article class="panel policy-panel"><div class="section-heading"><div><h2>Tỷ lệ duyệt nhóm phục hồi</h2><p class="section-subtitle">${risk?'Hai mô hình có cùng tỷ lệ khó khăn thanh toán quan sát trong tập duyệt toàn hệ thống: khoảng 2,52%.':'Hai mô hình cùng duyệt 50% hồ sơ trên toàn hệ thống.'}</p></div></div><div class="policy-pair">${[['A',row.rehab_approval_a],['B',row.rehab_approval_b]].map(([tag,v])=>`<div><p class="field-label">Mô hình ${tag} · ${tag==='A'?'Nền':'Bổ sung hành vi'}</p><p class="policy-value ${tag==='B'?'primary-text':''}">${percent(v)}</p><div class="policy-track" role="img" aria-label="Tỷ lệ duyệt ${tag}: ${percent(v)}, thang 0 đến 100%"><i style="width:${v*100}%" class="${tag==='B'?'model-b':''}"></i></div></div>`).join('')}</div><div class="policy-takeaway ${risk?'':'neutral'}">${icon(risk?'trend':'info',20)}<div><h3>${signed(row.delta_approval*100)} điểm phần trăm</h3><p>${risk?'Tương đương khoảng 35 hồ sơ duyệt thêm trên 1.000 hồ sơ phục hồi tương tự trong mô phỏng.':'Chưa đủ bằng chứng thống kê để kết luận có thay đổi.'}</p><span>CI 95%: [${number(row.delta_approval_ci95_low*100)}; ${number(row.delta_approval_ci95_high*100)}] điểm phần trăm</span></div></div><details class="panel-details"><summary>Điều kiện & giới hạn của mô phỏng <span>+</span></summary><div class="details-body"><p>Ngưỡng rủi ro xét duyệt A: ${percent(row.system_cutoff_risk_a)}; B: ${percent(row.system_cutoff_risk_b)}. Các ngưỡng được chọn theo từng điều kiện toàn hệ thống.</p><p>Tỷ lệ khó khăn thanh toán quan sát trong riêng tập duyệt nhóm phục hồi: A ${percent(row.rehab_bad_rate_a)}, B ${percent(row.rehab_bad_rate_b)}. Đây là nhóm con; không phải tỷ lệ toàn hệ thống dùng để đặt điều kiện.</p><p>Chênh lệch tỷ lệ khó khăn thanh toán trong nhóm phục hồi chưa có đủ bằng chứng thống kê. Mô phỏng trên dữ liệu lịch sử chưa chứng minh hiệu quả triển khai thật.</p><a class="source-link" href="data/sources/policy_evaluation.csv" download>Tải kết quả mô phỏng ${icon('download',12)}</a></div></details></article>`;
}
function researchView() {
 const row=dataset.research.metrics.find(r=>researchGroup==='full'?r.group==='full_population':r.config==='t2_N12'&&r.group==='rehabilitated');
 if(!row)return '<div class="empty-state"><h1>Hiệu suất mô hình</h1><p>Bộ dữ liệu đang dùng chưa có báo cáo hiệu suất mô hình.</p></div>';
 const tableRows=[['ROC-AUC','auc','delta_auc'],['Average Precision','pr_auc','delta_pr_auc']];
 return `<div class="page-heading"><div><h1>Hiệu suất mô hình</h1><p class="subtitle">So sánh A/B trên cùng khách hàng, bằng dự đoán ngoài mẫu.</p></div><div class="segmented" role="group" aria-label="Nhóm đánh giá"><button data-action="research-full" class="${researchGroup==='full'?'active':''}" aria-pressed="${researchGroup==='full'}">Toàn mẫu</button><button data-action="research-rehab" class="${researchGroup==='rehab'?'active':''}" aria-pressed="${researchGroup==='rehab'}">Nhóm phục hồi</button></div></div><article class="panel research-panel"><div class="section-heading"><h2>Khả năng phân biệt rủi ro</h2><span class="source-chip">${number(row.n_customers,0)} hồ sơ</span></div><div class="table-scroll"><table class="metric-table"><thead><tr><th>Chỉ số</th><th>Mô hình A</th><th>Mô hình B</th><th>Chênh lệch B − A</th></tr></thead><tbody>${tableRows.map(([label,key,delta])=>`<tr><th>${label}</th><td>${number(row[key+'_a'],4)}</td><td class="primary-text">${number(row[key+'_b'],4)}</td><td><strong class="primary-text">${signed(row[delta],4)}</strong><small>CI 95% [${number(row[delta+'_ci95_low'],4)}; ${number(row[delta+'_ci95_high'],4)}]</small></td></tr>`).join('')}</tbody></table></div><p class="evidence-conclusion">${icon('check',16)} ${row.delta_auc_ci95_low>0&&row.delta_pr_auc_ci95_low>0?'Cả AUC và AP đều có bằng chứng cải thiện trong nhóm này.':'Cần đọc khoảng tin cậy trước khi kết luận mức cải thiện.'}</p><details class="panel-details"><summary>Chỉ số & phương pháp kiểm định <span>+</span></summary><div class="details-body"><p><strong>ROC-AUC:</strong> khả năng xếp khách hàng gặp khó khăn thanh toán vào mức rủi ro cao hơn khách hàng còn lại.</p><p><strong>Average Precision (AP):</strong> chất lượng nhận diện nhóm rủi ro; tỷ lệ khó khăn thanh toán thực tế trong nhóm đang chọn là ${percent(row.observed_bad_rate)}. </p><p>Kiểm định ghép cặp ${number(dataset.research.bootstrapReplicates,0)} lần, trên cùng các hồ sơ. Khoảng tin cậy chứa 0 không chứng minh hai phương án tương đương.</p><a href="data/sources/metrics_auc_bootstrap.csv" class="source-link" download>Tải số liệu hiệu suất ${icon('download',12)}</a></div></details></article><article class="panel chart-panel"><div class="section-heading"><div><h2>${chartMode==='calibration'?'Xác suất có sát tỷ lệ quan sát?':'Các hạng có phân tách rủi ro?'}</h2><p class="section-subtitle">${chartMode==='calibration'?'Mô hình B · Toàn mẫu · 10 nhóm theo xác suất dự đoán':'Mô hình B · Toàn mẫu · 10 hạng tín dụng'}</p></div><div class="segmented small" role="group" aria-label="Biểu đồ kiểm chứng"><button data-action="chart-calibration" class="${chartMode==='calibration'?'active':''}" aria-pressed="${chartMode==='calibration'}">Calibration</button><button data-action="chart-grades" class="${chartMode==='grades'?'active':''}" aria-pressed="${chartMode==='grades'}">10 hạng</button></div></div><div class="chart-wrap">${chartMode==='calibration'?calibrationChart(dataset.research.calibration):gradesChart(dataset.research.grades)}</div><p class="chart-caption">${chartMode==='calibration'?'<span class="legend-stroke"></span> Kết quả B <span class="legend-dashed"></span> Dự đoán = quan sát · Thanh đứng: CI 95%':'Tỷ lệ khó khăn thanh toán quan sát theo hạng. Hạng 1 tốt nhất; hạng 10 thấp nhất.'}</p><details class="panel-details"><summary>Xem bảng số liệu <span>+</span></summary><div class="details-body table-scroll">${chartMode==='calibration'?calibrationTable():gradeTable()}</div></details></article><p class="research-limit"></p>`;
}
function calibrationTable() { return `<table class="compact-table"><thead><tr><th>Nhóm B</th><th>Dự đoán</th><th>Quan sát</th><th>CI quan sát 95%</th></tr></thead><tbody>${dataset.research.calibration.filter(r=>r.model==='model_b').map(r=>`<tr><td>${r.decile}</td><td>${percent(r.pred_risk_mean)}</td><td>${percent(r.observed_bad_rate)}</td><td>[${percent(r.obs_ci95_low)}; ${percent(r.obs_ci95_high)}]</td></tr>`).join('')}</tbody></table><a href="data/sources/calibration_deciles_ab.csv" class="source-link" download>Tải calibration_deciles_ab.csv ${icon('download',12)}</a>`; }
function gradeTable() { return `<table class="compact-table"><thead><tr><th>Hạng B</th><th>Khoảng điểm</th><th>Số hồ sơ</th><th>Tỷ lệ quan sát</th></tr></thead><tbody>${dataset.research.grades.map(r=>`<tr><td>${r.grade}</td><td>${number(r.score_min)} – ${number(r.score_max)}</td><td>${number(r.n_customers,0)}</td><td>${percent(r.bad_rate)}</td></tr>`).join('')}</tbody></table><a href="data/sources/grade_table_10_b.csv" class="source-link" download>Tải grade_table_10_b.csv ${icon('download',12)}</a><p class="help-text">Hạng 1 là hạng tốt nhất.</p>`; }
function about() {openDialog('Bộ dữ liệu đang dùng',`<div class="info-row"><span>Bộ dữ liệu</span><strong>${esc(dataName())}</strong></div><div class="info-row"><span>Số hồ sơ</span><strong>${number(dataset.meta.totalProfiles,0)}</strong></div><div class="dialog-actions"><button class="button button-primary" data-action="change-source">Đổi bộ dữ liệu ${icon('arrow',14)}</button></div>`);}

document.addEventListener('click',async event=>{
 const routeButton=event.target.closest('[data-route]');if(routeButton){try{await go(routeButton.dataset.route);}catch(error){toast('Chưa lưu được bàn làm việc. '+error.message);}return;}
 const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
 const action=button.dataset.action;
 if(action==='close-dialog'){closeDialog();return;}
 if(!dataset)return;
 const actions={
  'catalog-all':()=>setCatalogScope('all'), 'catalog-desk':()=>setCatalogScope('desk'),
  'open-import':()=>{const details=document.getElementById('import-details');details.open=true;document.getElementById('source-file').focus();},
  'change-source':async()=>{closeDialog();await go('catalog');document.getElementById('data-source').focus();},
  'search-previous':()=>{searchOffset=Math.max(0,searchOffset-25);return renderProfileList();},
  'search-next':()=>{searchOffset+=25;return renderProfileList();}, 'search-retry':renderProfileList,
  about, 'choose-profile':chooseProfile, 'profile-info':profileInfo, 'export-review':exportReview,
  previous:()=>{const i=dataset.profiles.indexOf(selected());if(i>0)return selectProfile(dataset.profiles[i-1].id);},
  next:()=>{const i=dataset.profiles.indexOf(selected());if(i<dataset.profiles.length-1)return selectProfile(dataset.profiles[i+1].id);},
  'select-profile':()=>selectProfile(button.dataset.id), evidence:()=>showEvidence(button.dataset.reason),
  'draft-reasons':()=>{const input=document.getElementById('review-note');if(input.value.trim()){openDialog('Thay nhận xét?',`<p class="dialog-lead">Thay nội dung nhận xét hiện tại bằng tóm tắt các tín hiệu hành vi đang hiển thị?</p><div class="dialog-actions"><button class="button button-outline" data-action="close-dialog">Giữ nhận xét</button><button class="button button-primary" data-action="confirm-draft">Dùng tóm tắt</button></div>`);}else applyDraft();},
  'confirm-draft':()=>{closeDialog();applyDraft();},
  'reason-scope':()=>openDialog('Yếu tố đánh giá',`<div class="dialog-copy"><p>Các chỉ tiêu hành vi và đóng góp nhóm thông tin của hồ sơ đang xem.</p><div class="info-row"><span>Bộ dữ liệu</span><strong>${esc(dataName())}</strong></div></div>`),
  'policy-custom':()=>{policyMode='custom';render();},
  'policy-fixed':()=>{policyMode='fixed';render();}, 'policy-risk':()=>{policyMode='risk';render();},
  'research-full':()=>{researchGroup='full';render();}, 'research-rehab':()=>{researchGroup='rehab';render();},
  'chart-calibration':()=>{chartMode='calibration';render();}, 'chart-grades':()=>{chartMode='grades';render();}
 };
 try { await actions[action]?.(); } catch(error) { toast(error.message); }
 if(document.activeElement===document.body&&!dialog.open)document.querySelector(`[data-action="${action}"]`)?.focus({preventScroll:true});
});
function applyDraft(){const input=document.getElementById('review-note');input.value=reasonDraft(selected());input.removeAttribute('aria-invalid');document.getElementById('review-error').textContent='';captureDraft();input.focus();}
document.addEventListener('input',event=>{if(event.target.id==='policy-threshold')readPolicyControls();if(event.target.id==='profile-search'){searchOffset=0;++searchVersion;clearTimeout(searchTimer);searchTimer=setTimeout(renderProfileList,220);}if(['review-note','review-decision'].includes(event.target.id)){captureDraft();event.target.removeAttribute('aria-invalid');const error=document.getElementById('review-error');if(error)error.textContent='';}});
document.addEventListener('change',event=>{if(event.target.id==='desk-profile'){const input=event.target;input.disabled=true;selectProfile(input.value).catch(error=>{if(input.isConnected)input.value=selectedId;toast(error.message);}).finally(()=>{if(input.isConnected)input.disabled=false;});}if(event.target.id==='policy-rule'){customPolicy.rule=event.target.value;customPolicy.threshold=event.target.value==='score'?700:event.target.value==='approval'?50:5;customResult=null;++policyVersion;render();}if(['policy-threshold','policy-cohort'].includes(event.target.id))readPolicyControls();if(event.target.id==='cohort-filter'){searchOffset=0;renderProfileList();}if(event.target.id==='data-source'){const input=event.target;input.disabled=true;loadSource(input.value).catch(error=>{toast(error.message);input.value=activeSource;}).finally(()=>input.disabled=false);}if(event.target.id==='review-decision')captureDraft();});
document.addEventListener('submit',async event=>{if(event.target.id==='policy-form'){event.preventDefault();await simulatePolicy(event.target);}if(event.target.id==='search-form'){event.preventDefault();clearTimeout(searchTimer);searchOffset=0;await renderProfileList();}if(event.target.id==='import-form'){event.preventDefault();await importSource(event.target);}if(event.target.id==='review-form'){event.preventDefault();await saveReview();}});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
document.querySelector('.brand').addEventListener('click',async event=>{event.preventDefault();try{await go('catalog');}catch(error){toast(error.message);}});
try{
 workspaceClient=localStorage.getItem('creditdesk-workspace-id');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceClient||'')){workspaceClient=crypto.randomUUID();localStorage.setItem('creditdesk-workspace-id',workspaceClient);}
 sources=await api('/api/sources');const view=await api(workspacePath('/api/workspace'));await loadSource(view.source,view.route);
 document.getElementById('loading').remove();
}catch(error){document.getElementById('loading').innerHTML=`<h1>Chưa mở được CreditDesk</h1><p>${esc(error.message)}</p><p>Tải lại trang hoặc liên hệ người quản lý dữ liệu để kiểm tra kết nối.</p>`;}
