'use strict';
const KEY='asm-gider-v1';
const $=selector=>document.querySelector(selector);
const uid=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random();
const today=()=>new Date().toLocaleDateString('sv-SE');
const monthNow=()=>today().slice(0,7);
const money=cents=>(Number(cents||0)/100).toLocaleString('tr-TR',{style:'currency',currency:'TRY'});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cats=['Elektrik','Su','Doğalgaz','Temizlik','Personel maaşı','Sarf malzemesi','Kira','İnternet / Telefon','Bakım / Onarım','Diğer'];
const empty=()=>({doctors:[],expenses:[],transfers:[],allowances:[]});
let db=load(), page='home', month=monthNow(), deferredInstall=null, busy=false, notification='';
let autoRefreshAt=0, autoRefreshPending=false;
const cloud=window.ASMCloud;
const state=()=>cloud.status();
const poolStatus=()=>window.ASMAllowanceMath.analyze(db,month);

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
  const expectedRevision=state().revision;
  busy=true;
  try {
    fn();validateBackup(db);
    if(hasRemote())await cloud.saveLedger(db,expectedRevision);
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
  const pool=poolStatus();
  if(pool.active&&pool.complete)return Object.fromEntries(pool.perDoctor.map(d=>[d.id,d.balance]));
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
  const pool=poolStatus();
  if(pool.active&&!pool.complete)return [];
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
  const selected=selectedMonth(),sum=selected.reduce((n,e)=>n+e.amount,0),pool=poolStatus();
  const b=pool.active&&!pool.complete?{}:balances();
  const balancesShort=Object.entries(b).filter(([,value])=>value!==0).slice(0,6);
  return heading('Genel Bakış','Aylık giderler ve güncel bakiyeler',true)+`
    <section class="grid" aria-label="Özet göstergeleri">
      <div class="card"><span class="muted">${pool.active?'Toplam ödenek':'Toplam gider'}</span><div class="metric">${money(pool.active?pool.totalAllowance:sum)}</div><span class="fine">${pool.active?pool.recordedCount+' / '+pool.doctorCount+' ödenek girildi':selected.length+' harcama'}</span></div>
      <div class="card"><span class="muted">${pool.active?'Toplam gider':'Hekim başına ortalama'}</span><div class="metric">${money(pool.active?pool.totalExpenses:(db.doctors.length?Math.round(sum/db.doctors.length):0))}</div><span class="fine">${pool.active?selected.length+' harcama':db.doctors.length+' hekim · yalnızca ortalama'}</span></div>
    </section>
    ${pool.active?`<section class="card"><span class="muted">Toplam kalan</span>
      ${pool.complete?`<div class="metric teal">${money(pool.remainder)}</div><p class="fine">Hekim başına yaklaşık ${money(pool.baseShare)}. Kuruş farkları tam olarak dağıtılır.</p>`:`<p class="warning">Ödenek kaydı bekleyenler: ${pool.missing.map(d=>esc(d.name)).join(', ')}</p>`}
      <button class="secondary" data-go="doctors">${pool.complete?'Ödenekleri görüntüle':'Ödenekleri tamamla'}</button>
    </section>`:''}
    <section class="card"><div class="row"><h2>Son giderler</h2><button class="secondary" data-go="expenses">Tümü</button></div>
    ${selected.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(e=>`<div class="item money-row"><div class="item-main"><strong>${esc(e.category)}</strong><small>${esc(e.date)} · ${esc(doctor(e.paidBy))}</small></div><span class="amount">${money(e.amount)}</span></div>`).join('')||'<div class="empty">Henüz gider eklenmedi.</div>'}
    <div class="toolbar"><button id="add-expense">+ Yeni gider ekle</button><button class="secondary" data-go="settlement">Hesaplaşmayı gör</button></div></section>
    <section class="card"><h2>${pool.active?'Ödenek havuzu net bakiyeleri':'Net bakiyeler'}</h2>
    ${pool.active&&!pool.complete?'<div class="warning">Ödenek girişleri tamamlandığında net borç ve alacaklar gösterilecek.</div>':balancesShort.map(([id,n])=>balanceRow(doctor(id),n)).join('')||'<div class="empty">Bekleyen bakiye yok.</div>'}</section>`;
}
function expenses(){
  const list=selectedMonth().slice().sort((a,b)=>b.date.localeCompare(a.date));
  return heading('Giderler','Harcamaları kaydedin ve düzenleyin',true)+`
    <div class="toolbar"><button id="add-expense">+ Yeni gider ekle</button><button class="secondary" id="pdf" type="button">PDF paylaş</button></div>
    <section class="card">${list.map(expenseRow).join('')||'<div class="empty">Bu ay gider bulunmuyor.</div>'}</section>`;
}

function allowanceSection(){
  const pool=poolStatus();
  return `<section class="card">
    <div class="row wrap"><h2>Bu ay yatan ödenekler</h2><span class="tag">${pool.recordedCount} / ${pool.doctorCount} kayıt</span></div>
    <p class="muted">Her hekim adına yatan ödeneği girin. 0 TL ödenek için de sıfır tutarlı kayıt oluşturun. Kalan para bütün hekimlerin kayıtları tamamlanınca eşitlenir. Bu sürümde ASM yetkilileri tüm hekimlerin tutarlarını düzenleyebilir.</p>
    ${db.doctors.map(d=>{
      const record=(db.allowances||[]).find(a=>a.doctorId===d.id&&a.month===month);
      return `<div class="allowance-row"><div class="allowance-row__person">
        <strong>${esc(d.name)}</strong><small>${record?'Ödenek kaydedildi':'Ödenek bekleniyor'}</small></div>
        <div class="allowance-row__amount"><strong class="${record?'teal':'muted'}">${record?money(record.amount):'—'}</strong>
        <button type="button" class="secondary" data-allowance="${esc(d.id)}">${record?'Düzenle':'Ödenek gir'}</button></div></div>`;
    }).join('')||'<div class="empty">Ödenek girmek için önce hekim ekleyin.</div>'}
    ${pool.active&&!pool.complete?`<p class="warning">Ödenek kaydı bekleyenler: ${pool.missing.map(d=>esc(d.name)).join(', ')}. Tümü girilmeden kesin hesaplaşma yapılmaz.</p>`:''}
    ${pool.complete?`<p class="info">Toplam ödenek ${money(pool.totalAllowance)} · Toplam gider ${money(pool.totalExpenses)} · Kişi başına yaklaşık ${money(pool.baseShare)}</p>`:''}
    </section>`;
}
function allowanceForm(id){
  const person=db.doctors.find(d=>d.id===id);
  if(!person)return;
  const recordMonth=month;
  const record=(db.allowances||[]).find(a=>a.doctorId===id&&a.month===recordMonth);
  page='doctors';
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='doctors'));
  $('#app').innerHTML=heading('Aylık ödenek',person.name+' · '+recordMonth)+`
    <form id="allowance-form"><section class="card"><h2>Hesaba yatan tutar</h2>
      <p class="muted">Bu hekimin ${esc(recordMonth)} ayında aldığı toplam ödeneği girin. 0 TL girilmesi de geçerli bir kayıttır.</p>
      <label for="allowance-amount">Ödenek (₺)</label>
      <input name="amount" id="allowance-amount" type="text" inputmode="decimal" required placeholder="40.000,00" value="${record?(record.amount/100).toFixed(2).replace('.',','):''}">
      <div class="toolbar"><button type="submit">${record?'Ödeneği güncelle':'Ödeneği kaydet'}</button><button id="cancel-allowance" type="button" class="secondary">Vazgeç</button></div>
    </section></form>
    ${record?'<section class="card"><button id="remove-allowance" class="danger" type="button">Bu ayın ödenek kaydını kaldır</button></section>':''}`;
  $('#cancel-allowance').onclick=()=>navigate('doctors');
  $('#allowance-form').onsubmit=event=>saveAllowance(event,id,recordMonth);
  $('#remove-allowance')?.addEventListener('click',()=>removeAllowance(id,recordMonth));
}
async function saveAllowance(event,id,recordMonth){
  event.preventDefault();
  const amount=parseAmount(event.target.elements.amount.value);
  if(!Number.isSafeInteger(amount)||amount<0){alert('Ödenek sıfır veya daha büyük olmalı. En fazla iki ondalık basamak kullanın.');return;}
  await mutate(()=>{
    db.allowances=db.allowances.filter(a=>a.doctorId!==id||a.month!==recordMonth);
    db.allowances.push({doctorId:id,month:recordMonth,amount});
  },()=>navigate('doctors'));
}
async function removeAllowance(id,recordMonth){
  if(!confirm(doctor(id)+' için '+recordMonth+' ödenek kaydı kaldırılsın mı?'))return;
  await mutate(()=>{db.allowances=db.allowances.filter(a=>a.doctorId!==id||a.month!==recordMonth)},()=>navigate('doctors'));
}

function doctorsPage(){
  return heading('Hekimler','Hekimler ve aylık ödenekler',true)+`
    ${allowanceSection()}
    <section class="card"><h2>Yeni hekim</h2><form id="add-doctor"><label for="doctor-name">Ad soyad</label>
    <input id="doctor-name" name="name" maxlength="100" placeholder="Örn. Dr. Ahmet Yılmaz" autocomplete="off" required>
    <div class="toolbar"><button type="submit">+ Hekim ekle</button></div></form></section>
    <section class="card"><h2>Kayıtlı hekimler (${db.doctors.length})</h2>
    ${db.doctors.map(d=>`<div class="item money-row"><strong class="item-main">${esc(d.name)}</strong><button class="danger" data-del-doctor="${esc(d.id)}">Sil</button></div>`).join('')||'<div class="empty">Önce hekim ekleyin.</div>'}</section>
`;
}
function dataManagement(){
  const remote=hasRemote();
  return `<section class="card data-management">
    <details id="data-management">
      <summary class="data-management__summary">
        <span class="data-management__label"><strong>Veri Yönetimi</strong><small>Yedekleme ve geri yükleme</small></span>
        <span class="data-management__chevron" aria-hidden="true"></span>
      </summary>
      <div class="data-management__content">
        <p class="muted">${remote?'Giderleriniz ortak ASM veritabanına kaydedilir. JSON yedeği isteğe bağlı ek bir kopyadır.':'Bu cihazdaki kayıtlar otomatik olarak bu cihazda saklanır. JSON yedeği ayrı bir kopya oluşturur.'}</p>
        <div class="toolbar">
          <button id="export" type="button">JSON yedeğini indir</button>
          <label class="backup-control">JSON yedeği yükle<input id="import" type="file" accept=".json,application/json"></label>
        </div>
        <p class="fine">Yedek yüklemek mevcut defteri değiştirir; işlem öncesinde onay istenir.</p>
      </div>
    </details>
  </section>`;
}
function settlement(){
  if(poolStatus().active)return allowanceSettlement();
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

function allowanceSettlement(){
  const pool=poolStatus();
  const pending=pool.complete?transfers():[];
  const history=db.transfers.filter(t=>t.month===month);
  return heading('Ay Sonu Hesaplaşma','Ödeneklerden sonra kalan para eşitlenir',true)+`
    <section class="grid">
      <div class="card"><span class="muted">Toplam ödenek</span><div class="metric">${money(pool.totalAllowance)}</div><span class="fine">${pool.recordedCount} / ${pool.doctorCount} hekim kaydetti</span></div>
      <div class="card"><span class="muted">Toplam gider</span><div class="metric">${money(pool.totalExpenses)}</div><span class="fine">Ödeyen hekimden düşülür</span></div>
    </section>
    ${pool.complete?`<section class="card"><span class="muted">Toplam kalan</span><div class="receipt-value teal">${money(pool.remainder)}</div>
      <hr class="divider"><span class="muted">Hekim başına eşit kalan</span><div class="receipt-value">${money(pool.baseShare)}</div>
      <p class="fine">Bölünemeyen kuruş farkları hekimlere sırasıyla dağıtılır. Negatif kalan, giderlerin toplam ödeneği aştığı anlamına gelir.</p></section>`
      :`<section class="card"><h2>Ödenek girişi tamamlanmadı</h2><p class="warning">Beklenen hekimler: ${pool.missing.map(d=>esc(d.name)).join(', ')}</p>
      <p class="muted">Bütün kayıtlar tamamlanmadan net kalan veya transfer önerisi oluşturulmaz. 0 TL ödenek de kaydedilmelidir.</p>
      <button class="secondary" data-go="doctors">Ödenekleri tamamla</button></section>`}
    <section class="card"><h2>Hekim bazında dağılım</h2>
      ${pool.perDoctor.map(d=>`<div class="allowance-breakdown"><strong>${esc(d.name)}</strong>
        <div class="allowance-breakdown__grid">
          <span>Yatan ödenek</span><b>${d.allowance===null?'Henüz girilmedi':money(d.allowance)}</b>
          <span>Ödediği gider</span><b>${money(d.spent)}</b>
          <span>Gider sonrası kalan</span><b>${d.cash===null?'—':money(d.cash)}</b>
          ${pool.complete?`<span>Eşit kalan hakkı</span><b>${money(d.target)}</b>
            <span>Net ${d.balance<0?'borç':'alacak'}</span>
            <b class="${d.balance>0?'green':d.balance<0?'red':''}">${money(Math.abs(d.balance))}</b>`:''}
        </div></div>`).join('')||'<div class="empty">Hekim kaydı yok.</div>'}
      <p class="fine">Kaydedilmiş transferler net hesaba dahildir. Gider bazındaki katılım yüzdeleri ödenek havuzunu etkilemez.</p>
    </section>
    <section class="card"><h2>Önerilen transferler</h2>
      ${!pool.complete?'<div class="warning">Ödenek girişleri tamamlanmadan transfer hesaplanmaz.</div>':
        pending.map((t,i)=>`<div class="item transfer-row"><div class="money-row"><div class="item-main"><strong>${esc(doctor(t.from))} → ${esc(doctor(t.to))}</strong><small>Gönderilecek tutar</small></div><strong class="amount teal">${money(t.amount)}</strong></div><div class="toolbar"><button data-transfer="${i}">Ödendi olarak kaydet</button></div></div>`).join('')||'<div class="success">Bu ay için bekleyen transfer yok.</div>'}
      <p class="fine">Ödendi butonu para transferi yapmaz; yalnızca gerçekleşmiş ödemeyi kaydeder.</p></section>
    <section class="card"><h2>Kaydedilen transferler</h2>
      ${history.map(t=>`<div class="item transfer-row"><div class="money-row"><div class="item-main"><strong>${esc(doctor(t.from))} → ${esc(doctor(t.to))}</strong><small>${esc(t.date)}</small></div><strong class="amount">${money(t.amount)}</strong></div><div class="actions"><button class="danger" data-undo="${esc(t.id)}">Kaydı geri al</button></div></div>`).join('')||'<div class="empty">Henüz ödeme kaydı yok.</div>'}
    </section>`;
}

function accountPage(){
  const s=state();
  if(s.loading||s.resolving)return launchScreen();
  if(s.error&&!s.enabled)return `<div class="auth-layout"><section class="card"><h1>Bağlantı kurulamadı</h1><p class="warning">${esc(s.error)}</p><button id="retry-cloud" class="wide">Yeniden dene</button></section></div>`;
  if(!s.enabled)return heading('Bulut bağlantısı','İkinci aşama: ortak ASM veritabanı')+`
    <section class="card"><h2>Ortak veri sistemi henüz etkinleştirilmedi</h2>
    <p class="muted">Şu anda giderler sadece bu cihazda saklanıyor. Supabase projesi oluşturup SQL kurulumunu yaptıktan sonra Vercel'de <code>SUPABASE_URL</code> ve <code>SUPABASE_PUBLISHABLE_KEY</code> değişkenlerini ekleyerek çok kullanıcılı modu açabiliriz.</p>
    <div class="warning">Gerçek gider kayıtlarını bulut güvenlik yapılandırması tamamlanmadan burada saklamayın.</div>
    <div class="toolbar"><button class="secondary" data-go="home">Yerel moda dön</button></div></section>`+dataManagement();
  if(s.error&&!s.user)return `<div class="auth-layout"><section class="card"><h1>Bağlantı hatası</h1><p class="warning">${esc(s.error)}</p><button id="retry-cloud" class="wide">Yeniden dene</button></section></div>`;
  if(!s.user)return `<div class="auth-layout"><section class="card"><div class="breadcrumb">GÜVENLİ GİRİŞ</div><h1>ASM hesabına giriş</h1>
    <p class="muted">Hekimlerin aynı kayıtları görmesi için hesaplarına giriş yapması gerekir.</p>
    <form id="login-form"><label>E-posta</label><input name="email" type="email" autocomplete="email" required>
    <label>Şifre</label><input name="password" type="password" minlength="8" autocomplete="current-password" required>
    <div class="toolbar"><button name="action" value="login" type="submit">Giriş yap</button><button class="secondary" name="action" value="signup" type="submit">Yeni hesap oluştur</button></div></form>
    <p id="auth-feedback" class="auth-feedback" aria-live="polite" hidden></p>
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
    ${dataManagement()}`;
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
  $('#cloud-status').innerHTML=`<span class="cloud-dot ${online&&!s.error?'cloud-dot--online':''}"></span>${booting?'Güvenli bağlantı hazırlanıyor':online?(s.error?'Ortak ASM · yenileme hatası':'Ortak ASM · güncel'):s.enabled?'Giriş gerekli':s.error?'Bağlantı hatası':'Yerel pilot'}`;
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
  root.querySelectorAll('[data-allowance]').forEach(button=>button.addEventListener('click',()=>allowanceForm(button.dataset.allowance)));
  $('#export')?.addEventListener('click',exportData);
  $('#import')?.addEventListener('change',importData);
  $('#pdf')?.addEventListener('click',sharePDFReport);
  if ($('#pdf')) window.ASMPDF?.preload?.().catch(()=>{ /* Retried on tap. */ });
  $('#login-form')?.addEventListener('submit',authSubmit);
  $('#new-workspace')?.addEventListener('submit',createWorkspace);
  $('#add-member')?.addEventListener('submit',addMember);
  $('#logout')?.addEventListener('click',signOut);
  $('#retry-cloud')?.addEventListener('click',()=>location.reload());
  $('#refresh-workspace')?.addEventListener('click',refreshCloud);
  $('#migrate-local')?.addEventListener('click',migrateLocal);
}
function editingFormOpen(){
  return Boolean(document.querySelector('#expense-form, #allowance-form'));
}
async function autoRefreshCloud(){
  // Startup restoration fetches the current ledger. Re-check on navigation
  // and foreground return, but do not interrupt active editing forms.
  if(!hasRemote()||busy||autoRefreshPending||editingFormOpen())return;
  if(Date.now()-autoRefreshAt<5000)return;
  autoRefreshAt=Date.now();
  autoRefreshPending=true;
  try{
    await cloud.refresh();
  }catch(error){
    notification='Ortak kayıtlar güncellenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.';
    if(!editingFormOpen()&&!busy)render();
  }finally{
    autoRefreshPending=false;
  }
}
function navigate(next){
  page=next;render();
  if(next==='account'&&state().role==='owner')cloud.listMembers().catch(e=>{notification=e.message;render()});
  void autoRefreshCloud();
}
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
  if(poolStatus().active){
    const section=$('#method')?.closest('section.card');
    if(section)section.innerHTML='<h2>03 — Ödenek havuzu</h2><p class="info">Bu ay ödenek hesabı kullanılıyor. Harcamalar ödeyen hekimin tutarından düşer; ay sonunda kalan para hekimler arasında eşitlenir.</p>';
  }
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
  const pooled=poolStatus().active;
  const ids=pooled?(existing?.participants||db.doctors.map(d=>d.id)):[...document.querySelectorAll('[data-participant]:checked')].map(el=>el.dataset.participant);
  const method=pooled?(existing?.method||'equal'):f.elements.method.value;
  const percentages=pooled?{...(existing?.percentages||{})}:{};
  if(!Number.isSafeInteger(amount)||amount<=0){alert('Tutar sıfırdan büyük olmalı; en fazla iki ondalık basamak kullanın.');return}
  if(!ids.length){alert('En az bir hekim seçin.');return}
  if(method==='custom'&&!pooled){
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
  if(db.expenses.some(e=>e.paidBy===id||e.participants.includes(id))||db.transfers.some(t=>t.from===id||t.to===id)||(db.allowances||[]).some(a=>a.doctorId===id)){
    alert('Bu hekimin gider veya transfer kaydı var. Önce ilişkili kayıtları düzenleyin.');return;
  }
  if(confirm(`${doctor(id)} silinsin mi?`))await mutate(()=>{db.doctors=db.doctors.filter(d=>d.id!==id)});
}
async function deleteExpense(id){if(confirm('Bu gider silinsin mi?'))await mutate(()=>{db.expenses=db.expenses.filter(e=>e.id!==id)})}
async function recordTransfer(index){
  const pool=poolStatus();
  if(pool.active&&!pool.complete){alert('Önce tüm hekimlerin ödeneklerini girin.');return;}
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
  // Legacy JSON backups and existing cloud documents can lack allowances.
  if(x.allowances===undefined)x.allowances=[];
  if(!Array.isArray(x.allowances))throw Error('Ödenek kayıtları geçersiz');
  const allowanceKeys=new Set();
  for(const a of x.allowances){
    if(!a||!doctorIds.has(a.doctorId)||typeof a.month!=='string'
      ||!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(a.month)
      ||!Number.isSafeInteger(a.amount)||a.amount<0)throw Error('Ödenek kayıtları geçersiz');
    const key=a.month+':'+a.doctorId;
    if(allowanceKeys.has(key))throw Error('Bir hekim için aynı ayda birden fazla ödenek kaydı var');
    allowanceKeys.add(key);
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
async function sharePDFReport(){
  const button=$('#pdf');
  if(!button || button.disabled) return;
  const rows=selectedMonth().slice();
  if(!rows.length&&!poolStatus().active){alert('Bu ay için paylaşılacak gider veya ödenek bulunmuyor.');return;}
  button.disabled=true;
  button.textContent='PDF hazırlanıyor…';
  try{
    await window.ASMPDF.share({
      month,
      workspaceName:state().workspace?.name||'ASM Gider Takip',
      doctors:db.doctors.map(d=>({id:d.id,name:d.name})),
      expenses:rows,
      allowancePool:poolStatus()
    });
  }catch(error){
    alert('PDF hazırlanamadı: '+(error?.message||'Lütfen tekrar deneyin.'));
  }finally{
    if(button.isConnected){
      button.disabled=false;
      button.textContent='PDF paylaş';
    }
  }
}
function authErrorMessage(error,action){
  const code=String(error?.code||'').toLowerCase();
  const description=String(error?.message||'').toLowerCase();
  const emailQuota=code==='over_email_send_rate_limit'||description.includes('email rate limit exceeded');
  if(emailQuota)return 'Doğrulama e-postası gönderilemedi: Bu ASM projesinin e-posta gönderim sınırına ulaşıldı. Tekrar tekrar kayıt denemek kotayı açmaz. Bir süre sonra yeniden deneyebilirsiniz; daha fazla hekim kaydı için özel e-posta (SMTP) gönderimi kurulmalıdır.';
  if(code==='email_address_not_authorized'||description.includes('email address not authorized'))return 'Bu e-posta adresine doğrulama mesajı gönderilemiyor. Varsayılan Supabase e-posta hizmeti proje ekibi dışındaki adresleri kısıtlıyor. Hekim üyelikleri için özel SMTP kurulması gerekiyor.';
  if(code==='over_request_rate_limit'||code==='over_email_send_rate_limit'||Number(error?.status)===429)return 'Çok sayıda istek yapıldığı için işlem geçici olarak sınırlandı. Bir süre sonra tekrar deneyin.';
  if(code==='email_not_confirmed'||description.includes('email not confirmed'))return 'E-posta adresi henüz doğrulanmamış. Gelen kutunuzu ve spam klasörünü kontrol edin.';
  if(code==='invalid_credentials'||description.includes('invalid login credentials'))return 'E-posta adresi veya şifre hatalı. Bilgilerinizi kontrol edin.';
  if(code==='user_already_exists'||description.includes('user already registered'))return 'Bu adresle daha önce hesap oluşturulmuş olabilir. Lütfen giriş yapmayı deneyin.';
  return (action==='signup'?'Hesap oluşturulamadı. ':'Giriş yapılamadı. ')+'Lütfen bilgilerinizi ve internet bağlantınızı kontrol edip yeniden deneyin.';
}
async function authSubmit(event){
  event.preventDefault();
  if(!ensureEditable())return;
  const form=event.target,action=event.submitter?.value||'login';
  const email=form.elements.email.value.trim(),password=form.elements.password.value;
  const buttons=Array.from(form.querySelectorAll('button[type="submit"]'));
  const feedback=form.parentElement?.querySelector('#auth-feedback');
  function showFeedback(text,success=false){
    if(!feedback){alert(text);return;}
    feedback.textContent=text;
    feedback.className='auth-feedback '+(success?'info':'warning');
    feedback.setAttribute('role',success?'status':'alert');
    feedback.hidden=false;
  }
  busy=true;
  buttons.forEach(button=>button.disabled=true);
  if(feedback){feedback.hidden=true;feedback.textContent='';}
  try{
    if(action==='signup'){
      const hasSession=await cloud.register(email,password);
      if(!hasSession){
        showFeedback('Kayıt isteği alındı. E-posta adresinize doğrulama bağlantısı geldiyse açıp ardından giriş yapın.',true);
        return;
      }
    }else{
      await cloud.login(email,password);
    }
    render();
  }catch(error){
    showFeedback(authErrorMessage(error,action));
  }finally{
    busy=false;
    buttons.forEach(button=>button.disabled=false);
  }
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
window.addEventListener('pageshow',()=>{void autoRefreshCloud()});
window.addEventListener('focus',()=>{void autoRefreshCloud()});
window.addEventListener('online',()=>{void autoRefreshCloud()});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')void autoRefreshCloud();
});
$('#install').onclick=async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#install').hidden=true}};
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
cloud.init(remote=>{
  if(remote){
    try{
      validateBackup(remote);
      if(!busy){
        if(editingFormOpen()){
          notification='Ortak kayıtlar başka bir cihazda değişti. Güncel haliyle devam etmek için açık form kapatıldı.';
        }
        db=remote;
      }else{
        // Never overwrite an in-flight local edit with a simultaneous fetch.
        notification='Ortak kayıtlar yenilendi. Kaydetme işleminin ardından güncel verileri yeniden kontrol edin.';
        return;
      }
    }catch(e){notification='Buluttaki kayıtlar doğrulanamadı: '+e.message;}
  }
  if(!editingFormOpen()||remote||state().loading||state().resolving)render();
});
render();
