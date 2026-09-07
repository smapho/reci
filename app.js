const $ = id => document.getElementById(id);
let selected = null, busy = false, previewUrl = '', timer;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => `¥${Number(n || 0).toLocaleString('ja-JP')}`;
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => $('toast').hidden = true, 7000); }
function lock(value) { busy = value; for (const id of ['choose','camera','manual','save','add']) $(id).disabled = value; $('ocr').disabled = value || !selected; }
async function api(method = 'GET', body, path = '/api/receipts') {
  const response = await fetch(path, { method, headers: { 'Content-Type':'application/json', 'x-app-password':localStorage.getItem('reci.password') || '' }, body: body ? JSON.stringify(body) : undefined });
  const raw = await response.text();
  let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = {error:`APIエラー (${response.status})`}; }
  if (!response.ok) throw new Error(data.error || '通信に失敗しました'); return data;
}
async function setFile(file) {
  if (busy || !file) return;
  if (!file.type.startsWith('image/') || file.size > 20*1024*1024) return toast('20MB以下の画像を選んでください。');
  const url = URL.createObjectURL(file);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = url;
  selected = file;
  // Show the camera result immediately. Image decoding is deferred until OCR/save.
  $('preview').src = url;
  $('preview').hidden = false;
  $('fileName').textContent = file.name;
  $('ocr').disabled = false;
  $('progress').textContent = '画像を読み込みました。Geminiで読み取りを開始します…';
  // Start analysis automatically after a camera/photo selection.
  setTimeout(() => $('ocr').click(), 0);
}
function addItem(item = {}) {
  const row = document.createElement('div'); row.className = 'item-row';
  row.innerHTML = `<input aria-label="商品名" placeholder="商品名" value="${escape(item.name)}"><input aria-label="数量" type="number" min="0.001" step="any" value="${escape(item.quantity ?? 1)}" required><input aria-label="金額" type="number" step="1" placeholder="金額" value="${escape(item.amount ?? '')}" required><button type="button" aria-label="明細を削除">×</button>`;
  row.querySelector('button').onclick = () => { if (!busy) row.remove(); }; $('items').append(row);
}
function parse(text) {
  const lines = text.normalize('NFKC').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const date = text.normalize('NFKC').match(/(20\d{2})[年/.-]\s*(\d{1,2})[月/.-]\s*(\d{1,2})/);
  $('date').value = date ? `${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}` : '';
  $('merchant').value = lines.find(s => !/\d|レシート|領収|電話|TEL/i.test(s)) || '';
  const totalLine = lines.find(s => /^(合\s*計|総合計|お支払|TOTAL)/i.test(s));
  $('total').value = totalLine?.match(/[-\d][\d,]*(?=\s*円?\s*$)/)?.[0].replaceAll(',','') || '';
  $('notes').value = text; $('items').replaceChildren();
  for (const line of lines) { if (/合計|小計|税|預|釣|電話|TEL|支払/i.test(line)) continue; const m = line.match(/^(.+?)\s+[¥￥]?(-?\d[\d,]*)円?\s*$/); if (m) addItem({name:m[1],amount:Number(m[2].replaceAll(',',''))}); }
}
$('ocr').onclick = async () => {
  if (!selected || busy) return; lock(true); $('progress').textContent = '読み取りを準備しています…';
  try { $('progress').textContent = 'Geminiでレシートを解析しています…'; const {result:r} = await api('POST', {image:await imagePayload()}, '/api/analyze'); $('merchant').value=r.merchant_name||''; $('date').value=r.purchase_date||''; $('total').value=r.total_amount??''; $('notes').value=r.notes||''; $('items').replaceChildren(); (r.items||[]).forEach(addItem); if (!(r.items||[]).length) addItem(); $('review').hidden=false; $('review').scrollIntoView({behavior:'smooth'}); toast('Geminiの読み取りが完了しました。内容を確認してください。'); }
  catch (error) { toast(error.message || 'Geminiの読み取りに失敗しました。手入力をご利用ください。'); $('manual').click(); }
  finally { $('progress').textContent = ''; lock(false); }
};
async function imagePayload() {
  const img = new Image(); img.src = previewUrl; await img.decode(); const scale = Math.min(1,1600/Math.max(img.width,img.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width*scale); canvas.height = Math.round(img.height*scale);
  const ctx = canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const data = canvas.toDataURL('image/jpeg',.72).split(',')[1]; if (data.length > 3000000) throw new Error('画像が大きすぎます。範囲を絞って撮影してください。'); return {type:'image/jpeg',data};
}
$('form').onsubmit = async event => {
  event.preventDefault(); if (busy) return; if (!selected) return toast('保存する画像を選んでください。'); lock(true);
  try { const items = [...$('items').children].map(row => { const [name,quantity,amount] = row.querySelectorAll('input'); return {name:name.value.trim(),quantity:Number(quantity.value),amount:Number(amount.value)}; });
    await api('POST',{receipt:{merchant_name:$('merchant').value.trim(),purchase_date:$('date').value || null,total_amount:Number($('total').value),notes:$('notes').value},items,image:await imagePayload()});
    $('form').reset(); $('items').replaceChildren(); $('review').hidden=true; selected=null; URL.revokeObjectURL(previewUrl); previewUrl=''; $('preview').hidden=true; $('preview').removeAttribute('src'); $('fileName').textContent=''; $('file').value=''; $('cameraFile').value=''; toast('保存しました。'); await load();
  } catch(error) { toast(error.message); } finally { lock(false); }
};
async function load() {
  $('refresh').disabled=true;
  try { const {receipts} = await api(); $('status').textContent='接続済み'; $('list').innerHTML=receipts.length ? receipts.map(r=>`<details><summary><div><b>${escape(r.merchant_name || '名称未設定')}</b><small>${escape(r.purchase_date || '日付未設定')}</small></div><strong>${money(r.total_amount)}</strong></summary><div class="detail">${(r.items||[]).map(i=>`<p>${escape(i.name)} × ${escape(i.quantity)} <b>${money(i.amount)}</b></p>`).join('') || '<p>明細なし</p>'}${/^https:\/\//.test(r.image_url || '') ? `<a href="${escape(r.image_url)}" target="_blank" rel="noopener noreferrer">レシート画像を見る ↗</a>` : ''}<pre>${escape(r.notes)}</pre></div></details>`).join('') : '<p class="empty">まだレシートがありません。</p>'; }
  catch(error) { $('status').textContent='未接続'; $('list').textContent=error.message; } finally { $('refresh').disabled=false; }
}
for(const id of ['file','cameraFile']) $(id).onchange=e=>setFile(e.target.files[0]);
$('drop').ondragover=e=>e.preventDefault(); $('drop').ondrop=e=>{e.preventDefault();setFile(e.dataTransfer.files[0]);};
$('manual').onclick=()=>{$('review').hidden=false;$('review').scrollIntoView({behavior:'smooth'});};
$('add').onclick=()=>addItem(); $('refresh').onclick=load; $('settings').onclick=()=>{$('password').value=localStorage.getItem('reci.password')||'';$('dialog').showModal();}; $('close').onclick=()=>$('dialog').close();
$('login').onsubmit=e=>{e.preventDefault();localStorage.setItem('reci.password',$('password').value);$('dialog').close();load();};
load();
