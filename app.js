'use strict';
const KEY='asm-gider-v1';
const $=selector=>document.querySelector(selector);
const uid=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random();
const today=()=>new Date().toLocaleDateString('sv-SE');
const monthNow=()=>today().slice(0,7);
const money=cents=>(Number(cents||0)/100).toLocaleString('tr-TR',{style:'currency',currency:'TRY'});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cats=['Elektrik','Su','Doğalgaz','Temizlik','Personel maaşı','Sarf malzemesi','Kira','İnternet / Telefon','Bakım / Onarım','Diğer'];
const empty=()=>({doctors:[],expenses:[],transfers:[]});
let db=load(), page='home', month=monthNow(), deferredInstall=null, busy=false, notification='';
const cloud=window.ASMCloud;
const state=()=>cloud.status();

function load(){
  try {const value=JSON.parse(localStorage.getItem(KEY));validateBackup(value);return value}
  catch {return empty()}
}
function hasRemote(){const s=state();return s.enabled&&s.ready&&s.workspace}
function ledgerReady(){const s=state();return !s.enabled||Boolean(s.ready&&s.workspace)}
function ensureEditable(){if(busy){alert('Önce devam eden kayıt işleminin bitmesini bekleyin.');return false}return true}
async function mutate(fn,callback){
  if(!ensureEditable())return;
  const previous=JSON.parse(JSON.stringify(db));
  busy=true;
  try {
    fn();validateBackup(db);
    if(hasRemote())await cloud.saveLedger(db);
    else localStorage.setItem(KEY,JSON.stringify(db));
    if(callback)callback();else render();
  }catch(error){
    db=previous;
    alert('Değişiklik kaydedilemedi: '+(error?.message||'Bilinmeyen hata'));
    if(hasRemote()){
      try {const remote=await cloud.refresh();if(remote){validateBackup(remote);db=remote}}
      catch(e){notification='Güncel bulut kaydı alınamadı: '+e.message}
    }
    render();
  }finally {busy=false;}
}
function selectedMonth(){return db.expenses.filter(x=>x.date.slice(0,7)===month)}
function split(expense){
  const ids=expense.participants,result={};
  if(!ids.length)return result;
  if(expense.method!=='custom'){
    const base=Math.floor(expense.amount/ids.length),left=expense.amount%ids.length;
    ids.forEach((id,i)=>result[id]=base+(i<left?1:0));return result;
  }
  const exact=ids.map(id=>expense.amount*(Number(expense.percentages[id])||0)/100);
  const rounded=exact.map(Math.floor);
  let remaining=expense.amount-rounded.reduce((sum,n)=>sum+n,0);
  const order=ids.map((_,i)=>i).sort((a,b)=>exact[b]-rounded[b]-(exact[a]-rounded[a])||a-b);
  for(let i=0;i<remaining;i++)rounded[order[i%order.length]]++;
  ids.forEach((id,i)=>result[id]=rounded[i]);return result;
}
function balances(){
  const out=Object.fromEntries(db.doctors.map(d=>[d.id,0]));
  for(const expense of selectedMonth()){
    out[expense.paidBy]=(out[expense.paidBy]||0)+expense.amount;
    for(const [id,share] of Object.entries(split(expense)))out[id]=(out[id]||0)-share;
  }
  for(const transfer of db.transfers.filter(t=>t.month===month)){
    out[transfer.from]=(out[transfer.from]||0)+transfer.amount;
    out[transfer.to]=(out[transfer.to]||0)-transfer.amount;
  }
  return out;
}
function transfers(){
  const b=balances(),debt=Object.entries(b).filter(([,n])=>n<0).map(([id,n])=>({id,n:-n})).sort((a,b)=>b.n-a.n);
  const credit=Object.entries(b).filter(([,n])=>n>0).map(([id,n])=>({id,n})).sort((a,b)=>b.n-a.n);
  const out=[];let i=0,j=0;
  while(i<debt.length&&j<credit.length){
    const amount=Math.min(debt[i].n,credit[j].n);
    if(amount>0)out.push({from:debt[i].id,to:credit[j].id,amount});
    debt[i].n-=amount;credit[j].n-=amount;
    if(!debt[i].n)i++;if(!credit[j].n)j++;
  }
  return out;
}
function doctor(id){return db.doctors.find(d=>d.id===id)?.name||'Silinmiş hekim'}
function monthControl(){return `<input class="select-month" aria-label="Ay seçin" type="month" id="month" value="${month}">`}
function heading(title,subtitle,withMonth=false){return `<div class="page-heading"><div><h1>${title}</h1><p class="muted">${subtitle}</p></div>${withMonth?monthControl():''}</div>`}
function balanceRow(label,value){const color=value>0?'green':value<0?'red':'';return `<div class="item money-row"><span class="item-main">${esc(label)}</span><strong class="amount ${color}">${value>0?'+':''}${money(value)}</strong></div>`}
function expenseRow(e){return `<article class="item item--action"><div class="money-row"><div class="item-main"><strong>${esc(e.category)}</strong><small>${esc(e.date)} · Ödeyen: ${esc(doctor(e.paidBy))}</small></div><strong class="amount">${money(e.amount)}</strong></div><p class="muted">${esc(e.description||'Açıklama yok')} · ${e.participants.length} hekim</p><div class="actions"><button type="button" class="secondary" data-edit="${esc(e.id)}">Düzenle</button><button type="button" class="danger" data-del="${esc(e.id)}">Sil</button></div></article>`}

function home(){
  const selected=selectedMonth(),sum=selected.reduce((n,e)=>n+e.amount,0),b=balances();
  const balancesShort=Object.entries(b).filter(([,value])=>value!==0).slice(0,6);
  return heading('Genel Bakış','Aylık giderler ve güncel bakiyeler',true)+`
    <section class="grid" aria-label="Özet göstergeleri">
      <div class="card"><span class="muted">Toplam gider</span><div class="metric">${money(sum)}</div><span class="fine">${selected.length} harcama</span></div>
      <div class="card"><span class="muted">Hekim başına ortalama</span><div class="metric">${money(db.doctors.length?Math.round(sum/db.doctors.length):0)}</div><span class="fine">${db.doctors.length} hekim · yalnızca ortalama</span></div>
    </section>
    <section class="card"><div class="row"><h2>Son giderler</h2><button class="secondary" data-go="expenses">Tümü</button></div>
    ${selected.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(e=>`<div class="item money-row"><div class="item-main"><strong>${esc(e.category)}</strong><small>${esc(e.date)} · ${esc(doctor(e.paidBy))}</small></div><span class="amount">${money(e.amount)}</span></div>`).join('')||'<div class="empty">Henüz gider eklenmedi.</div>'}
    <div class="toolbar"><button id="add-expense">+ Yeni gider ekle</button><button class="secondary" data-go="settlement">Hesaplaşmayı gör</button></div></section>
    <section class="card"><h2>Net bakiyeler</h2>${balancesShort.map(([id,n])=>balanceRow(doctor(id),n)).join('')||'<div class="empty">Bekleyen bakiye yok.</div>'}</section>`;
}
function expenses(){
  const list=selectedMonth().slice().sort((a,b)=>b.date.localeCompare(a.date));
  return heading('Giderler','Harcamaları kaydedin ve düzenleyin',true)+`
    <div class="toolbar"><button id="add-expense">+ Yeni gider ekle</button><button class="secondary" id="csv">CSV dışa aktar</button></div>
    <section class="card">${list.map(expenseRow).join('')||'<div class="empty">Bu ay gider bulunmuyor.</div>'}</section>`;
}
function doctorsPage(){
  return heading('Hekimler','Harcama yapan ve gider paylaşan hekimler')+`
    <section class="card"><h2>Yeni hekim</h2><form id="add-doctor"><label for="doctor-name">Ad soyad</label>
    <input id="doctor-name" name="name" maxlength="100" placeholder="Örn. Dr. Ahmet Yılmaz" autocomplete="off" required>
    <div class="toolbar"><button type="submit">+ Hekim ekle</button></div></form></section>
    <section class="card"><h2>Kayıtlı hekimler (${db.doctors.length})</h2>
    ${db.doctors.map(d=>`<div class="item money-row"><strong class="item-main">${esc(d.name)}</strong><button class="danger" data-del-doctor="${esc(d.id)}">Sil</button></div>`).join('')||'<div class="empty">Önce hekim ekleyin.</div>'}</section>
    <section class="card"><h2>Yedekleme</h2><p class="muted">JSON yedeğini indirip arşivleyin. İçe aktarım mevcut defteri tamamen değiştirir.</p>
    <div class="toolbar"><button type="button" id="export">JSON yedek indir</button>
    <label class="backup-control">JSON yedek yükle<input id="import" type="file" accept=".json,application/json"></label></div></section>`;
}
function settlement(){
  const b=balances(),pending=transfers(),history=db.transfers.filter(t=>t.month===month),sum=selectedMonth().reduce((n,e)=>n+e.amount,0);
  return heading('Ay Sonu Hesaplaşma','Yapılan ödemeler düşülmüş kalan bakiyeler',true)+`
    <section class="card"><span class="muted">Toplam aylık gider</span><div class="receipt-value teal">${money(sum)}</div>
    <hr class="divider"><h2>Hekim bakiyeleri</h2>
    ${db.doctors.map(d=>balanceRow(d.name,b[d.id]||0)).join('')||'<div class="empty">Hekim ekleyin.</div>'}
    <p class="fine">Pozitif bakiye alacak; negatif bakiye borç anlamına gelir.</p></section>
    <section class="card"><h2>Önerilen transferler</h2>
    ${pending.map((t,i)=>`<div class="item transfer-row"><div class="money-row"><div class="item-main"><strong>${esc(doctor(t.from))} → ${esc(doctor(t.to))}</strong><small>Gönderilecek tutar</small></div><strong class="amount teal">${money(t.amount)}</strong></div><div class="toolbar"><button data-transfer="${i}">Ödendi olarak kaydet</button></div></div>`).join('')||'<div class="success">Bu ay için bekleyen transfer yok.</div>'}
    <p class="fine">Ödendi butonu banka havalesi gerçekleştirmez; sadece gerçekleşmiş ödemeyi kaydeder.</p></section>
    <section class="card"><h2>Kaydedilen transferler</h2>
    ${history.map(t=>`<div class="item transfer-row"><div class="money-row"><div class="item-main"><strong>${esc(doctor(t.from))} → ${esc(doctor(t.to))}</strong><small>${esc(t.date)}</small></div><strong class="amount">${money(t.amount)}</strong></div><div class="actions"><button class="danger" data-undo="${esc(t.id)}">Kaydı geri al</button></div></div>`).join('')||'<div class="empty">Henüz ödeme kaydı yok.</div>'}</section>`;
}
function accountPage(){
  const s=state();
  if(s.loading||s.resolving)return launchScreen();
  if(s.error&&!s.enabled)return `<div class="auth-layout"><section class="card"><h1>Bağlantı kurulamadı</h1><p class="warning">${esc(s.error)}</p><button id="retry-cloud" class="wide">Yeniden dene</button></section></div>`;
  if(!s.enabled)return heading('Bulut bağlantısı','İkinci aşama: ortak ASM veritabanı')+`
    <section class="card"><h2>Ortak veri sistemi henüz etkinleştirilmedi</h2>
    <p class="muted">Şu anda giderler sadece bu cihazda saklanıyor. Supabase projesi oluşturup SQL kurulumunu yaptıktan sonra Vercel'de <code>SUPABASE_URL</code> ve <code>SUPABASE_PUBLISHABLE_KEY</code> değişkenlerini ekleyerek çok kullanıcılı modu açabiliriz.</p>
    <div class="warning">Gerçek gider kayıtlarını bulut güvenlik yapılandırması tamamlanmadan burada saklamayın.</div>
    <div class="toolbar"><button id="export">Mevcut verilerin yedeğini indir</button><button class="secondary" data-go="home">Yerel moda dön</button></div></section>`;
  if(s.error&&!s.user)return `<div class="auth-layout"><section class="card"><h1>Bağlantı hatası</h1><p class="warning">${esc(s.error)}</p><button id="retry-cloud" class="wide">Yeniden dene</button></section></div>`;
  if(!s.user)return `<div class="auth-layout"><section class="card"><div class="breadcrumb">GÜVENLİ GİRİŞ</div><h1>ASM hesabına giriş</h1>
    <p class="muted">Hekimlerin aynı kayıtları görmesi için hesaplarına giriş yapması gerekir.</p>
    <form id="login-form"><label>E-posta</label><input name="email" type="email" autocomplete="email" required>
    <label>Şifre</label><input name="password" type="password" minlength="8" autocomplete="current-password" required>
    <div class="toolbar"><button name="action" value="login" type="submit">Giriş yap</button><button class="secondary" name="action" value="signup" type="submit">Yeni hesap oluştur</button></div></form>
    <p class="form-note">Yeni hesap için e-posta doğrulaması gerekebilir. Şifrenizi yalnızca bu güvenli formda kullanın.</p></section></div>`;
  if(s.error&&!s.ready)return `<div class="auth-layout"><section class="card"><h1>ASM bağlantısı tamamlanamadı</h1><p class="warning">${esc(s.error)}</p><button id="retry-cloud" class="wide">Yeniden dene</button></section></div>`;
  if(!s.workspace)return `<div class="auth-layout"><section class="card"><div class="breadcrumb">HOŞ GELDİNİZ</div><h1>ASM çalışma alanı</h1>
    <p class="muted">${esc(s.user.email)} hesabına giriş yapıldı. Henüz bu hesabın erişebildiği bir ASM bulunmuyor.</p>
    <form id="new-workspace"><label>ASM adı</label><input name="name" minlength="2" maxlength="100" required placeholder="Örn. Merkez ASM"><div class="toolbar"><button type="submit">Yeni ASM oluştur</button></div></form>
    <p class="form-note">Başka bir ASM'ye katılacaksanız önce o ASM'nin yöneticisi e-posta adresinizi eklemeli; sonra sayfayı yenileyin.</p>
    <div class="toolbar"><button id="refresh-workspace" class="secondary">Üyelikleri yenile</button><button id="logout" class="secondary">Çıkış yap</button></div></section></div>`;
  if(!s.ready)return `<div class="loading-state">Ortak ASM defteri yükleniyor…</div>`;
  const local=load(),hasLocal=local.doctors.length||local.expenses.length||local.transfers.length;
  const remoteEmpty=!db.doctors.length&&!db.expenses.length&&!db.transfers.length;
  return heading('ASM Hesabım','Hekim üyelikleri ve ortak çalışma alanı')+`
    <section class="card card--soft"><div class="account-summary"><div><div class="breadcrumb">BAĞLI ASM</div><h2>${esc(s.workspace.name)}</h2>
    <div class="muted">${esc(s.user.email)} · ${s.role==='owner'?'Yönetici':'Hekim / editör'}</div></div>
    <span class="tag"><span class="cloud-dot cloud-dot--online"></span> Buluta bağlı</span></div>
    <div class="toolbar"><button id="refresh-workspace" class="secondary">Güncel kayıtları getir</button><button id="logout" class="secondary">Çıkış yap</button></div></section>
    ${remoteEmpty&&hasLocal?`<section class="card"><h2>Bu cihazdan veri taşıma</h2><p class="muted">Cihazda daha önce kaydettiğiniz pilot kayıtları bulut ASM defterine aktarabilirsiniz. Bu işlem boş bulut defterini doldurur.</p><button id="migrate-local" class="wide">Yerel kayıtları buluta aktar</button></section>`:''}
    ${s.role==='owner'?`<section class="card"><h2>Hekim hesabı davet et</h2><p class="muted">Hekimin önce kendi e-postasıyla uygulamaya kayıt olup e-posta doğrulaması yapması gerekiyor. Sonra yöneticinin bu adresten üyelik vermesi yeterli.</p>
    <form id="add-member"><label>Hekimin kayıtlı e-postası</label><input name="email" type="email" autocomplete="off" placeholder="hekim@ornek.com" required><div class="toolbar"><button type="submit">Hesaba ASM erişimi ver</button></div></form></section>
    <section class="card"><h2>Yetkili kullanıcılar</h2>
    ${(s.members||[]).map(member=>`<div class="item member-grid"><div class="member-name"><strong>${esc(member.email)}</strong><small>${member.role==='owner'?'Yönetici':'Hekim / editör'}</small></div>${member.role==='owner'?'':`<button class="danger" data-remove-member="${esc(member.user_id)}">Kaldır</button>`}</div>`).join('')||'<p class="muted">Üyeleri yüklemek için Hesabım ekranını yeniden açın.</p>'}</section>`:''}
    <section class="card"><h2>Yedekleme</h2><div class="toolbar"><button id="export">Ortak defterin JSON yedeğini indir</button><label class="backup-control">JSON yedek yükle<input id="import" type="file" accept=".json,application/json"></label></div></section>`;
}

function launchScreen(){
  return `<div class="launch-screen" role="status" aria-label="Uygulama açılıyor">
    <img class="launch-screen__icon" src="./icon-192.png?v=4" width="76" height="76" alt="">
    <strong class="launch-screen__title">ASM Gider Takip</strong>
    <span class="launch-screen__subtitle">Güvenli oturum hazırlanıyor</span>
    <span class="launch-screen__spinner" aria-hidden="true"></span>
  </div>`;
}
function render(){
  const s=state();
  const booting=Boolean(s.loading||s.resolving);
  const forced=booting||(s.enabled&&(!s.user||!s.workspace||!s.ready))||Boolean(s.error&&!s.enabled);
  const view=forced?'account':page;
  document.body.classList.toggle('app-booting',booting);
  document.body.classList.toggle('has-bottom-nav',!forced);
  $('#nav').hidden=forced;
  $('#nav').style.display=forced?'none':'';
  $('#account').disabled=booting;
  $('#account').textContent=booting?'Hazırlanıyor':s.enabled?(s.ready?'Hesabım':'Giriş yap'):'Bulut / Hesap';
  const online=Boolean(s.enabled&&s.ready&&s.workspace);
  $('#cloud-status').innerHTML=`<span class="cloud-dot ${online?'cloud-dot--online':''}"></span>${booting?'Güvenli bağlantı hazırlanıyor':online?'Ortak ASM · senkronize':s.enabled?'Giriş gerekli':s.error?'Bağlantı hatası':'Yerel pilot'}`;
  $('#footer-note').textContent=booting?'Güvenli bağlantı hazırlanıyor…':online?'Veriler ortak ASM veritabanında saklanır. Raporlar için düzenli yedek önerilir.':'Bu sürümde veriler yalnızca bu cihazda saklanır. Düzenli yedek alın.';
  if(booting){$('#app').innerHTML=launchScreen();return;}
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===view));
  const pages={home,expenses,doctors:doctorsPage,settlement,account:accountPage};
  const root=$('#app');root.innerHTML=(notification?`<p class="warning">${esc(notification)}</p>`:'')+(pages[view]||home)();
  notification='';
  root.querySelector('#month')?.addEventListener('change',event=>{month=event.target.value||monthNow();render()});
  root.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>expenseForm(b.dataset.edit));
  root.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteExpense(b.dataset.del));
  root.querySelectorAll('[data-del-doctor]').forEach(b=>b.onclick=()=>deleteDoctor(b.dataset.delDoctor));
  root.querySelectorAll('[data-transfer]').forEach(b=>b.onclick=()=>recordTransfer(Number(b.dataset.transfer)));
  root.querySelectorAll('[data-undo]').forEach(b=>b.onclick=()=>undoTransfer(b.dataset.undo));
  root.querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=()=>removeMember(b.dataset.removeMember));
  $('#add-expense')?.addEventListener('click',()=>expenseForm());
  $('#add-doctor')?.addEventListener('submit',addDoctor);
  $('#export')?.addEventListener('click',exportData);
  $('#import')?.addEventListener('change',importData);
  $('#csv')?.addEventListener('click',exportCSV);
  $('#login-form')?.addEventListener('submit',authSubmit);
  $('#new-workspace')?.addEventListener('submit',createWorkspace);
  $('#add-member')?.addEventListener('submit',addMember);
  $('#logout')?.addEventListener('click',signOut);
  $('#retry-cloud')?.addEventListener('click',()=>location.reload());
  $('#refresh-workspace')?.addEventListener('click',refreshCloud);
  $('#migrate-local')?.addEventListener('click',migrateLocal);
}
function navigate(next){page=next;render();if(next==='account'&&state().role==='owner')cloud.listMembers().catch(e=>{notification=e.message;render()})}
function expenseForm(id){
  if(!db.doctors.length){alert('Önce en az bir hekim ekleyin.');navigate('doctors');return}
  const e=db.expenses.find(x=>x.id===id),participants=e?.participants||db.doctors.map(d=>d.id);
  page='expenses';document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='expenses'));
  $('#app').innerHTML=heading(e?'Gideri düzenle':'Yeni gider ekle',e?'Mevcut harcamayı güncelleyin':'Ödemeyi yapanı ve paylaşan hekimleri belirleyin')+`
    <form id="expense-form">
      <section class="card"><h2>01 — Gider bilgileri</h2><div class="form-grid"><div class="field"><label>Kategori *</label><select name="category">${cats.map(c=>`<option ${e?.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label>Tutar (₺) *</label><input name="amount" inputmode="decimal" type="text" required value="${e?(e.amount/100).toFixed(2).replace('.',','):''}" placeholder="8.400,00"></div>
      <div class="field"><label>Harcama tarihi *</label><input type="date" name="date" required value="${e?.date||today()}"></div></div>
      <label>Açıklama</label><textarea name="description" rows="2" maxlength="500" placeholder="Örn. Ekim ayı elektrik faturası">${esc(e?.description||'')}</textarea></section>
      <section class="card"><h2>02 — Ödeme bilgileri</h2><div class="form-grid"><div class="field"><label>Ödemeyi yapan hekim *</label><select name="paidBy">${db.doctors.map(d=>`<option value="${esc(d.id)}" ${e?.paidBy===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Ödeme yöntemi</label><select name="paymentMethod">${[['bank','Banka havalesi / EFT'],['cash','Nakit'],['card','Kart']].map(([v,n])=>`<option value="${v}" ${e?.paymentMethod===v?'selected':''}>${n}</option>`).join('')}</select></div></div></section>
      <section class="card"><h2>03 — Gider paylaşımı</h2><label>Paylaştırma yöntemi</label><select name="method" id="method"><option value="equal" ${e?.method!=='custom'?'selected':''}>Eşit paylaştır</option><option value="custom" ${e?.method==='custom'?'selected':''}>Yüzdelere göre</option></select>
      <p class="hint">Bu giderden sorumlu hekimleri seçin. Hekim isminin yanındaki alan özel paylaşım yüzdesidir.</p>
      ${db.doctors.map(d=>`<div class="checkrow"><input type="checkbox" id="p-${esc(d.id)}" data-participant="${esc(d.id)}" ${participants.includes(d.id)?'checked':''}><label for="p-${esc(d.id)}">${esc(d.name)}</label><input class="share-input" data-percent="${esc(d.id)}" inputmode="decimal" aria-label="${esc(d.name)} yüzdesi" value="${e?.percentages?.[d.id]??(100/db.doctors.length).toFixed(2)}" placeholder="%"></div>`).join('')}
      <p class="hint" id="share-hint"></p></section>
      <section class="card"><div class="toolbar"><button type="submit">${e?'Değişiklikleri kaydet':'Gideri kaydet'}</button><button type="button" id="cancel" class="secondary">Vazgeç</button></div></section>
    </form>`;
  $('#cancel').onclick=()=>navigate('expenses');
  $('#method').onchange=updateShare;
  document.querySelectorAll('[data-participant]').forEach(el=>el.onchange=updateShare);
  document.querySelectorAll('[data-percent]').forEach(el=>el.oninput=updateShare);
  $('#expense-form').onsubmit=event=>submitExpense(event,e);
  updateShare();
}
function updateShare(){
  const custom=$('#method')?.value==='custom';if(!$('#method'))return;
  const ids=[...document.querySelectorAll('[data-participant]:checked')].map(el=>el.dataset.participant);
  const shareFields=[...document.querySelectorAll('[data-percent]')];
  shareFields.forEach(el=>{el.hidden=!custom;el.style.display=custom?'block':'none';el.disabled=!ids.includes(el.dataset.percent)});
  const sum=shareFields.filter(el=>ids.includes(el.dataset.percent)).reduce((n,el)=>n+Number(el.value.replace(',','.')),0);
  $('#share-hint').textContent=custom?`Seçili hekimlerin yüzdeleri toplamı %${Number(sum.toFixed(4))}. Toplam %100 olmalıdır.`:`${ids.length} hekim arasında eşit paylaştırılacak.`;
  $('#share-hint').classList.toggle('red',custom&&Math.abs(sum-100)>.00001);
}
function parseAmount(input){
  let text=String(input).trim().replace(/\s/g,'');
  if(text.includes(',')&&text.includes('.'))text=text.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(text))text=text.replace(/\./g,'');
  else text=text.replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(text))return NaN;
  return Math.round(Number(text)*100);
}
async function submitExpense(event,existing){
  event.preventDefault();
  const f=event.target,amount=parseAmount(f.elements.amount.value);
  const ids=[...document.querySelectorAll('[data-participant]:checked')].map(el=>el.dataset.participant);
  const method=f.elements.method.value,percentages={};
  if(!Number.isSafeInteger(amount)||amount<=0){alert('Tutar sıfırdan büyük olmalı; en fazla iki ondalık basamak kullanın.');return}
  if(!ids.length){alert('En az bir hekim seçin.');return}
  if(method==='custom'){
    let sum=0;
    for(const id of ids){
      const raw=document.querySelector(`[data-percent="${id}"]`).value.replace(',','.');const n=Number(raw);
      if(!raw.trim()||!Number.isFinite(n)||n<0||n>100){alert('Yüzdeleri kontrol edin.');return}
      percentages[id]=n;sum+=n;
    }
    if(Math.abs(sum-100)>.00001){alert(`Yüzde toplamı %100 olmalı. Şu an: %${sum}`);return}
  }
  const obj={id:existing?.id||uid(),category:f.elements.category.value,amount,date:f.elements.date.value,
    description:f.elements.description.value.trim(),paidBy:f.elements.paidBy.value,
    paymentMethod:f.elements.paymentMethod.value,method,participants:ids,percentages};
  await mutate(()=>{if(existing)db.expenses=db.expenses.map(x=>x.id===existing.id?obj:x);else db.expenses.push(obj)},()=>navigate('expenses'));
}
async function addDoctor(event){
  event.preventDefault();const name=event.target.elements.name.value.trim();if(!name)return;
  if(db.doctors.some(d=>d.name.toLocaleLowerCase('tr')===name.toLocaleLowerCase('tr'))){alert('Bu hekim zaten kayıtlı.');return}
  await mutate(()=>db.doctors.push({id:uid(),name}));
}
async function deleteDoctor(id){
  if(db.expenses.some(e=>e.paidBy===id||e.participants.includes(id))||db.transfers.some(t=>t.from===id||t.to===id)){
    alert('Bu hekimin gider veya transfer kaydı var. Önce ilişkili kayıtları düzenleyin.');return;
  }
  if(confirm(`${doctor(id)} silinsin mi?`))await mutate(()=>{db.doctors=db.doctors.filter(d=>d.id!==id)});
}
async function deleteExpense(id){if(confirm('Bu gider silinsin mi?'))await mutate(()=>{db.expenses=db.expenses.filter(e=>e.id!==id)})}
async function recordTransfer(index){
  const t=transfers()[index];if(!t)return;
  if(confirm(`${doctor(t.from)} → ${doctor(t.to)}: ${money(t.amount)} ödendi olarak kaydedilsin mi?`))
    await mutate(()=>db.transfers.push({...t,id:uid(),month,date:today()}));
}
async function undoTransfer(id){if(confirm('Bu ödeme kaydı geri alınsın mı?'))await mutate(()=>{db.transfers=db.transfers.filter(t=>t.id!==id)})}
function download(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function exportData(){download('asm-gider-yedek-'+today()+'.json',JSON.stringify(db,null,2),'application/json')}
function validateBackup(x){
  if(!x||!Array.isArray(x.doctors)||!Array.isArray(x.expenses)||!Array.isArray(x.transfers))throw Error('Yedek formatı geçersiz');
  const isId=v=>typeof v==='string'&&/^[A-Za-z0-9_.-]{1,149}$/.test(v);
  const doctorIds=new Set();
  for(const d of x.doctors){
    if(!d||!isId(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>100||doctorIds.has(d.id))throw Error('Hekim kayıtları geçersiz');
    doctorIds.add(d.id);
  }
  const expenses=new Set();
  for(const e of x.expenses){
    if(!e||!isId(e.id)||expenses.has(e.id)||!Number.isSafeInteger(e.amount)||e.amount<=0||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(e.date)||!doctorIds.has(e.paidBy)
      ||!Array.isArray(e.participants)||!e.participants.length||new Set(e.participants).size!==e.participants.length||e.participants.some(id=>!doctorIds.has(id))
      ||!['equal','custom'].includes(e.method)||typeof e.category!=='string'||e.category.length>100||typeof e.description!=='string'||e.description.length>500)throw Error('Gider kayıtları geçersiz');
    if(e.method==='custom'&&(!e.percentages||Math.abs(e.participants.reduce((sum,id)=>sum+Number(e.percentages[id]),0)-100)>0.00001
      ||e.participants.some(id=>!Number.isFinite(Number(e.percentages[id]))||Number(e.percentages[id])<0||Number(e.percentages[id])>100)))throw Error('Yüzde değerleri geçersiz');
    expenses.add(e.id);
  }
  const transfers=new Set();
  for(const t of x.transfers){
    if(!t||!isId(t.id)||transfers.has(t.id)||!doctorIds.has(t.from)||!doctorIds.has(t.to)||t.from===t.to||!Number.isSafeInteger(t.amount)||t.amount<=0
      ||typeof t.month!=='string'||!/^[0-9]{4}-[0-9]{2}$/.test(t.month)||typeof t.date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(t.date))throw Error('Transfer kayıtları geçersiz');
    transfers.add(t.id);
  }
  return true;
}
async function importData(event){
  const file=event.target.files?.[0];if(!file)return;
  try {
    if(file.size>5*1024*1024)throw Error('Yedek en fazla 5 MB olabilir');
    const imported=JSON.parse(await file.text());validateBackup(imported);
    if(!confirm('Mevcut bütün kayıtlar bu yedekle değiştirilecek. Devam edilsin mi?'))return;
    await mutate(()=>{db=imported});
  }catch(e){alert('Yedek okunamadı: '+e.message)}finally{event.target.value=''}
}
function exportCSV(){
  const rows=[['Tarih','Kategori','Tutar TL','Ödeyen','Açıklama','Paylaşım','Hekimler'],
    ...selectedMonth().map(e=>[e.date,e.category,(e.amount/100).toFixed(2),doctor(e.paidBy),e.description,e.method,e.participants.map(doctor).join('; ')])];
  const csv='\ufeff'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/^[=+@-]/,match=>"'"+match).replace(/"/g,'""')+'"').join(';')).join('\r\n');
  download('asm-gider-'+month+'.csv',csv,'text/csv;charset=utf-8');
}
async function authSubmit(event){
  event.preventDefault();if(!ensureEditable())return;busy=true;
  const form=event.target,action=event.submitter?.value||'login';
  const email=form.elements.email.value.trim(),password=form.elements.password.value;
  try {
    if(action==='signup'){
      const hasSession=await cloud.register(email,password);
      if(!hasSession)alert('Kayıt alındı. E-posta adresinize gelen doğrulama bağlantısını açın, ardından giriş yapın.');
    } else await cloud.login(email,password);
  }catch(e){alert('Giriş işlemi başarısız: '+e.message)}
  finally{busy=false;render()}
}
async function createWorkspace(event){
  event.preventDefault();if(!ensureEditable())return;busy=true;
  try {await cloud.createWorkspace(event.target.elements.name.value.trim());page='home';}
  catch(e){alert('ASM oluşturulamadı: '+e.message)}finally{busy=false;render()}
}
async function addMember(event){
  event.preventDefault();if(!ensureEditable())return;busy=true;
  try {await cloud.addMember(event.target.elements.email.value.trim());alert('Hekime ASM erişimi verildi. Artık kendi hesabıyla giriş yapabilir.');}
  catch(e){alert('Üyelik eklenemedi: '+e.message)}finally{busy=false;render()}
}
async function removeMember(id){
  if(!confirm('Bu kullanıcının ASM erişimini kaldırmak istiyor musunuz?')||!ensureEditable())return;
  busy=true;try{await cloud.removeMember(id)}catch(e){alert('Üye kaldırılamadı: '+e.message)}finally{busy=false;render()}
}
async function refreshCloud(){
  if(!ensureEditable())return;busy=true;
  try {const data=await cloud.refresh();if(data){validateBackup(data);db=data};if(state().role==='owner')await cloud.listMembers();}
  catch(e){alert('Güncel kayıtlar yüklenemedi: '+e.message)}finally{busy=false;render()}
}
async function migrateLocal(){
  const local=load();if(!local.doctors.length&&!local.expenses.length&&!local.transfers.length)return;
  if(db.doctors.length||db.expenses.length||db.transfers.length){alert('Bulut defteri boş değil. Önce birleştirme planı yapılmalı.');return}
  if(!confirm('Bu cihazdaki yerel veriler ortak ASM veritabanına aktarılacak. Bu işlem diğer hekimlerin görebileceği kayıtlar oluşturur. Onaylıyor musunuz?'))return;
  await mutate(()=>{db=local});
}
async function signOut(){if(!ensureEditable())return;busy=true;
  try {await cloud.logout();db=load();page='account';}
  catch(e){alert('Oturum kapatılamadı: '+e.message)}finally{busy=false;render()}
}

$('#account').onclick=()=>navigate('account');
document.querySelectorAll('nav button').forEach(button=>button.onclick=()=>navigate(button.dataset.page));
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;$('#install').hidden=false});
$('#install').onclick=async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#install').hidden=true}};
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
cloud.init(remote=>{if(remote){try {validateBackup(remote);db=remote;}catch(e){notification='Buluttaki kayıtlar doğrulanamadı: '+e.message}}render()});
render();
