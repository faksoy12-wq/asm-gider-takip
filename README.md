# ASM Gider Takip — Mobil uyumlu PWA (v2)

Aile Sağlığı Merkezleri için hekim giderlerini, paylaşım yüzdelerini, kişi bazında net alacak/borcu ve transferleri takip eden mobil uyumlu uygulama.

**Canlı pilot:** https://asm-gider-takip.vercel.app  
**GitHub:** https://github.com/faksoy12-wq/asm-gider-takip

## V2 ile gelenler

- 320–1024 piksel arasında uyumlu kart, form, ödeme ve hesaplaşma satırları; taşma ve sağa-sola kayma düzeltmeleri
- Eşit / yüzdesel paylaşım, kuruş bazında yuvarlama, ay sonu net borç/alacak ve transfer listesi
- Yerel cihaz sürümü için JSON yedek ve içe aktarma; aylık gider listesini PDF hazırlayıp desteklenen cihazlarda paylaşma (diğerlerinde PDF indirme)
- Supabase bağlantısına hazır oturum açma ve kayıt ekranları
- ASM oluşturma, yönetici tarafından doğrulanmış hesabı ASM'ye ekleme/çıkarma
- Ekip üyelerinin paylaştığı **tek** bulut defteri; PostgreSQL row-level security (RLS)
- İki hekimin aynı anda düzenlemesinde yanlışlıkla son yazanın diğerinin değişikliğini ezmesini engelleyen revizyon kontrolü
- İsteğe bağlı olarak eski yerel kayıtları **boş** bulut defterine, açık onayla aktarabilme

## Vercel

Vercel bu depoya GitHub'dan bağlıdır. `main` dalına gönderilen değişiklikler otomatik yayınlanır. Statik HTML/CSS/JS kullanılır; npm kurulumu gerekmez. `api/public-config.js` ise Vercel Function'dır ve yalnızca herkese açık Supabase istemci yapılandırmasını verir.

## Bulut ve giriş sistemini etkinleştirme

Bu depodaki Supabase altyapı kodu hazırdır; **tek başına GitHub'a kod yüklemek veritabanı oluşturmaz.** Gerçek çok kullanıcılı mod için:

1. [Supabase Dashboard](https://supabase.com/dashboard) içinde bir proje açın (veya mevcut projenizi seçin).
2. **SQL Editor** → New query bölümünde [`supabase/migrations/202610280001_asm_team_ledger.sql`](supabase/migrations/202610280001_asm_team_ledger.sql) dosyasının tamamını **bir defa** çalıştırın. Bu işlem workspace, membership, ledger, RLS ve kontrollü yazma işlevlerini oluşturur.
3. **Authentication → URL Configuration** bölümünde Site URL olarak `https://asm-gider-takip.vercel.app` tanımlayın. Redirect URL listesine bu adresi (gerekirse `https://asm-gider-takip.vercel.app/**` desenini) ekleyin. E-posta doğrulamasını açık tutun; gerekirse SMTP ayarlayın.
4. Supabase projesinden **Project URL** ve **publishable key** (ya da legacy anon key) değerlerini bulun. **service_role / secret key kesinlikle kullanmayın.**
5. Vercel → `asm-gider-takip` → **Settings → Environment Variables** ekranına şunları ekleyin:

   ```env
   SUPABASE_URL=https://PROJE-REF.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

6. Vercel'de üretim ortamına yeni deployment oluşturun. Ardından uygulamayı açın, **Giriş yap → Yeni hesap oluştur** seçeneğinden kayıt olun, e-postanızı doğrulayın ve giriş yapın.
7. İlk yönetici hesabıyla **Yeni ASM oluştur** seçeneğini kullanın. Diğer hekimler önce kendi hesaplarıyla kayıt olmalı, e-postalarını doğrulamalıdır. Yönetici, **Hesabım** ekranından bu adresleri ASM'ye ekler.
8. Önce örnek/test giderleriyle farklı telefonlardan ortak görünüm ve hesaplaşmayı deneyin. Önceki yerel verileri taşımak isterseniz bulut ASM defteri boşken Hesabım ekranında taşıma seçeneği görünür. İşleme başlamadan JSON yedek alın.

Supabase bağlantısı yapılandırılmamışken uygulama v1'deki gibi **yerel pilot** modunda açılır. Bağlantı etkin olduğunda hekimler giriş yapmadan ortak giderleri görüp düzenleyemez.

## Veri modeli ve güvenlik

- `asm_workspaces`: ASM çalışma alanı, oluşturma bilgisi.
- `asm_members`: ASM yetkilileri (`owner`, `editor`) ve erişebildikleri alan.
- `asm_ledgers`: ASM'ye ait JSON gider defteri, sürüm (`revision`) ve son düzenleyen.
- `asm_create_workspace`, `asm_add_member_by_email`, `asm_remove_member`: yetki doğrulamalı yönetim işlevleri.
- `asm_save_ledger`: atomik, sürüm kontrollü kayıt; diğer cihazdaki değişiklikleri otomatik ezmez.
- RLS sadece üyelerin ilgili ASM'yi görmesini sağlar. Doğrudan tablo yazımı kapalıdır; sunucu kontrolünde RPC kullanılır.

**Önemli:** Bu sürüm mali kayıt takibi içindir. Hasta bilgisi, TC kimlik numarası veya sağlık verisi saklamayın. Tüm üyeler (`owner`/`editor`) gider defterini düzenleyebilir; ayrıntılı denetim izi, her gider için yazma kısıtı, otomatik yedekleme, belge ekleme ve banka havalesi entegrasyonu bu sürümde yoktur. Çok kullanıcılı moda geçmeden önce SQL/RLS kurulumunu tamamlayın ve en az iki test hesabıyla erişim sınırlarını doğrulayın.

### Yerel pilot modun sınırları

Yerel modda kayıtlar tarayıcının `localStorage` alanındadır; ayrı telefonlar aynı kayıtları paylaşmaz. Tarayıcı verilerini silmek kayıtları silebilir. Yedek alın. Bulut modu ise Supabase projesi kurulmadan çalışmaz.

## Hızlı geliştirme ve test

```bash
node --check app.js
node --check cloud.js
node --test tests/ledger.test.cjs
```

Bu testler hesaplama ve sözdizimini doğrular; gerçek Supabase uygulaması / API bağlantısı ayrıca test edilmelidir.

## Uygulama simgesi (v4)

ASM Gider Takip'in ana ekran simgesi, stetoskop ve hekimlik asası ile yükselen finans grafiğini birleştirir.
iOS için `apple-touch-icon.png`, Android için PWA manifestindeki 192/512 piksel ve maskable simge kullanılır.
Önceden ana ekrana eklenen simgeyi yenilemek için uygulamanın kısayolunu kaldırıp uygulamayı tekrar ana ekrana ekleyin.
Bu işlem Supabase'de saklanan kayıtları silmez; yine de önemli veriler için yedek önerilir.

## Veri Yönetimi

Hekimler ekranı yalnızca hekim kayıtlarını gösterir. İsteğe bağlı JSON yedek alma veya geri yükleme işlemleri **Hesabım → Veri Yönetimi** altındaki açılır alana taşınmıştır. Bulut kayıtları yedekten bağımsız olarak uygulama üzerinden kaydedilir; yükleme mevcut defteri değiştirmeden önce onay ister.

## v9 — Aylık ödenek havuzu

- **Hekimler** bölümünden ay seçilip her hekim adına yatan ödenek girilir. 0 TL de geçerli bir kayıttır; eksik girişten farklıdır.
- Bir ay için **hiç ödenek kaydı yoksa** eski gider paylaşımı yöntemi çalışır. O ayın ilk ödenek kaydı yeni havuz modunu başlatır. **Tüm hekimlerin tutarları girilmeden** net kalan veya ödeme önerisi sunulmaz.
- Hesaplama: **Toplam yatan ödenek − toplam harcama = eşit paylaştırılacak kalan**. Her hekimin hesabında kalan fiili tutar kendi ödeneğinden ödediği giderler ve geçmiş hekimler arası transferlerle bulunur; hedef tutara eşitlenmesi gereken net ödemeler önerilir.
- Bölünemeyen kuruşlar hekimlerin kayıt sırasına göre 1 kuruşluk parçalar halinde dağıtılır. Negatif kalan da doğru hesaplanır.
- PDF raporunda ödenek havuzu ve net hekim bakiyeleri (girişler tamamsa) yer alır.
- **Erişim notu:** Halihazırda ortak ASM defterine erişen tüm yetkili editörler diğer hekimlerin ödeneklerini de değiştirebilir. Hekimlerin yalnızca kendi ödeneğine müdahale edebilmesi için hekim-kullanıcı eşleştirmesi ve sunucu tarafında yetki politikası eklenmelidir.

## v12 — Otomatik ortak kayıt yenilemesi

- Oturum açıkken sayfa ilk yüklendiğinde buluttaki ASM defteri otomatik alınır.
- Açık uygulama yeniden öne getirildiğinde (telefon uygulamasına dönüş, sekme odağı veya geri/ileri geçmişi), internet bağlantısı geri geldiğinde ve ana sekmeler arasında gezinildiğinde ek veri kontrolü yapılır.
- Yakın aralıklı olaylar beş saniyelik aralıkla sınırlandırılır. Kayıtların değişmediği durumda gereksiz veri yeniden çizilmez.
- Gider veya ödenek düzenleme formu açıksa otomatik istek başlatılmaz; kullanıcı girdilerinin kaybolması önlenir. Beklenmeyen eş zamanlı değişiklik durumunda eski formu açık bırakarak üzerine yazmak yerine güncel kayıt gösterilir.
- Ortak defter PostgreSQL revizyon kontrolüyle korunur. Kaydetme başlamadan önceki revizyon ile yazma yapılır; başka cihazın değişikliğinin üzerine sessizce yazılmaz.
- Bu özellik **anlık gerçek zamanlı dinleme** değildir: giriş, sayfa/uygulama dönüşü ve sekme geçişinde yenilenir. Ayrı cihazlardaki kayıtlar güncel görünsün diye aynı hesabın şifresini paylaşmak güvenlik açısından önerilmez.

## v13 — Takvim senkronizasyonu ve otomatik ödenek aktarımı

- Güncel ay uygulama ilk açıldığında cihazın **yerel tarihine** göre seçilir. Kullanıcı ayı özellikle değiştirmediyse, uygulama açık kaldığında bile ay/yıl geçişi takip edilir (uygulamaya geri dönüş ve dakikalık kontrol). Özet, Giderler, Hekimler ve Hesaplaşma ortak seçili aya bağlıdır.
- **Yeni gider** tarihi içinde bulunduğumuz ayda otomatik olarak **bugün** seçilir. Eski bir ay özellikle seçilmişse giderin yanlışlıkla bu aya kaydedilmemesi için yeni gider formu seçili ayın ilk günüyle açılır. Kullanıcı tarihi değiştirebilir; kaydedince giderin ait olduğu aya geçilir. Önceden kayıtlı giderleri düzenlerken orijinal tarih korunur.
- Hekimler için bir ay girilen ödenek tutarı, sonradan değiştirilmedikçe izleyen aylara **varsayılan** olarak taşınır; kullanıcı yalnızca değişen hekim için yeni tutar kaydeder. 0 TL geçerli değer olmaya devam eder. Kayıt yapılmamış yeni bir hekim için önceki aydan aktarım yapılamaz.
- Otomatik tutarlar Hekimler ekranında ve PDF'de açıkça işaretlenir: Bunlar yeni aya ait banka hareketleri doğrulanmadan **varsayım** niteliğindedir.
- Yeni ay için ilk ödenek/gider/transfer kaydı yapılırken otomatik tutarlar o ayın defterine kopyalanır (copiedFrom alanıyla), böylece geçmiş aylara sonradan yapılan tutar düzeltmeleri daha önce işlem yapılmış yeni ayları sessizce değiştirmez.
- Eski aylardaki kayıtlar ve hesaplaşmalar korunur. Kullanıcının elle seçtiği eski ay, isteği dışında güncel aya çevrilmez; **Bu ay** düğmesiyle güncel aya dönülebilir.

## v14 — Hekim silme ve güvenli arşivleme

- **Hekimler → Aktif hekimler** altında henüz hiç gider, ödenek veya transfer kaydı bulunmayan hekim, onaydan sonra kalıcı olarak silinebilir.
- İlişkili finansal kaydı bulunan hekim **Arşivle** düğmesiyle mevcut aydan itibaren pasifleştirilir; JSON defterindeki kimliği ve eski gider/ödenek/transfer kayıtları korunur. **Arşivdeki hekimler** panelinden yeniden aktifleştirilebilir.
- Arşivlenmiş hekim, gelecek ayların gider girişlerinde ve ödeneklerin otomatik aktarımında yer almaz. Arşivleme ayına veya önceki dönemlere ait gerçek finansal kaydı varsa, geçmiş hesapların bölüşümü değişmemesi için o ilgili ayın hesaplaşmasında yer almaya devam eder.
- Pasiflik tarihleri, her hekim için isteğe bağlı `inactivePeriods:[{from:"YYYY-MM",to:null|"YYYY-MM"}]` aralıklarında tutulur. Geri alınan bir hekim önceki boş dönemlere geriye dönük dahil edilmez. Eski JSON yedekleri aynı şekilde kullanılabilir.
- Yedek doğrulaması arşiv tarih sırasını kontrol eder; mevcut ortak Supabase veritabanı şemasının değiştirilmesi gerekmez.

## v15 — Bu cihazdaki hekim ve giderde varsayılan ödeyen

- **Hesabım → Bu cihazdaki hekim** bölümünden, o cihazda oturum açmış kullanıcının hekim kimliği seçilir. Tercih, her cihazın tarayıcı yerel depolamasında (localStorage) `asm-device-doctor-v1:<workspace_id>:<user_id>` anahtarıyla saklanır. Ortak Supabase defterine yazılmaz.
- Yeni gider formundaki **Ödemeyi yapan hekim** otomatik olarak o kimliğe gelir; kullanıcı gider özelinde değiştirebilir. Bu cihazda kimlik seçilmediyse alan **boş** başlar ve hekim seçilmesi zorunludur (ilk hekimin/yöneticinin yanlışlıkla otomatik seçilmesi önlendi).
- Mevcut gideri düzenlerken eskiden kayıtlı ödeyen hekim aynen seçilir. Cihaz tercihi eski kayıtlara uygulanmaz.
- Arşivlenen/hekim listesinden silinen bir kişi cihaz tercihi olarak otomatik uygulanmaz. Yeni hekim seçimi için Hesabım'a dönülür.
- Bu ayar erişim yetkisi veya sunucuda hekim-kullanıcı doğrulaması sağlamaz; mevcut düzenleme izinleri değişmemiştir.

## v16 — Giriş ve hesap oluşturma deneyimi

- **Giriş yap** ve **Hesap oluştur** ayrı sekmelerde gösterilir; her sekmede yalnızca bir ana işlem butonu vardır. Giriş ekranı varsayılan olarak giriş modunda açılır.
- E-posta ve şifre alanlarında açık, ilişkili etiketler; uygun otomatik doldurma; hesap oluştururken **şifre tekrar** doğrulaması ve şifreyi göster/gizle düğmeleri bulunur.
- Gönderim sırasında işlem butonu ve diğer akışa geçiş devre dışı kalır, işlem metni ve dönen gösterge görünür. Supabase hata metinleri teknik ham mesaj yerine giriş formunun altında Türkçe ve erişilebilir olarak açıklanır.
- E-posta kotası aşıldığında açık hata verilir. Başarılı hesap oluşturma isteğinde oturum açılmamışsa ayrı bir **kayıt isteği alındı** adımı gösterilir; doğrulama e-postasının mutlaka teslim edildiği iddia edilmez. Aynı kayıt isteğinin tekrar tekrar gönderilmesini önlemek için form bu adımda gizlenir ve kullanıcı tek düğmeyle girişe dönebilir.
- Mevcut Supabase e-posta/şifre kimlik doğrulama, ASM davet ve üyelik yetkileri değişmez; Google ile giriş veya yeni e-posta gönderim altyapısı eklenmemiştir.

## v18 — Bir hesap, birden fazla ASM; kolay ve güvenli davet

- Bir kullanıcı aynı doğrulanmış Supabase hesabıyla **birden fazla ASM** üyesi olabilir. Hesabım → ASM'lerim içinde yetkili olduğu ASM'leri görür; **Bu ASM'ye geç** düğmesiyle çalışma alanını değiştirir. Eski ASM hesabı ve kayıtlar korunur. Tercih cihazda ve kullanıcıya özel tutulur.
- Henüz hiçbir ASM'ye üye olmayan kişinin ilk ekranında **Davetle ASM'ye katıl** birincil seçenektir. **Yeni ASM kurmak istiyorum** bölümü kapalıdır; yanlışlıkla fazladan ASM açılması önlenir.
- ASM yöneticisi, davet edeceği hekimin e-posta adresini yazar ve 14 gün geçerli, tek kullanımlık bağlantı oluşturur. Linki WhatsApp ile iletir. **Hekim hesabının önceden oluşturulmuş olması gerekmez.** Hekim e-postasını doğrulayıp giriş yaptıktan sonra davet bağlantısıyla katılır. Doğrulanmış kayıtlı kullanıcılar için eski doğrudan e-postayla ekleme yöntemi ayrı bölümde kalır.
- Davet bağlantısı URL fragmenti içindedir (#davet=...) ve ilk açılışta cihazda saklanır. Doğrulama sonrası yeni oturumda **Davetle ASM'ye katıl** alanına otomatik yerleşir. Davet doğrulandığında yerel geçici anahtar temizlenir.
- Davet kaydında 128 bit rastgele tokenın **SHA256 özeti** tutulur. Kayıtlı e-postadan başka hesap kullanamaz, 14 gün sonunda geçersizdir, yalnızca bir kez kullanılabilir. Davet tablosuna anon veya authenticated kullanıcısının doğrudan okuma/yazma yetkisi yoktur.
- Bir ASM'den diğerine geçildiğinde, kayıtlar ve **hekim cihaz tercihi** yeni ASM defterinden yüklenir. Eski ASM'nin giderleri yeni ASM'de görünmez. Yöneticinin ve hekimin mevcut yetkileri değişmez.
- Davet sistemi, Supabase'in hesap doğrulama için kullandığı e-posta gönderim sınırını kaldırmaz; yalnızca ASM katılımı için uygulama e-postası gönderme zorunluluğu yoktur.

## v19 — Girişte ve davet/üyelik sonrasında otomatik kayıt yükleme

- Giriş/ilk kayıt/ASM davetini kabul etme anında buluttan gelen kayıtlar otomatik ekrana yansır. Önceki `busy` denetimi giriş işlemlerini yanlışlıkla finansal kayıt yazma işlemi gibi değerlendirerek veriyi göstermiyordu. Yeni `ledgerWriteInProgress` yalnızca gerçek finansal kayıt yazımını korur.
- ASM'ye henüz bağlı olmayan ve oturumu açık hesaplarda sayfaya/uygulamaya dönüşte ve uygulama açıkken 30 saniyede bir üyelik kontrol edilir. Yönetici doğrudan erişim verdiğinde yeni ASM ve kayıtları ekstra butona basmadan açılır.
- Düğme isteğe bağlı kalır. Açık düzenleme formları otomatik yenileme tarafından kesilmez. Bulut ve SQL şemaları değiştirilmedi.

## v20 — Cloudflare Pages ücretsiz alternatif yayın

Vercel üzerinden erişim sağlayamayan iş yeri ağları için **aynı Supabase veritabanını** kullanan Cloudflare Pages statik kopyası hazırlanmıştır.

- Mevcut Vercel projesi aynı kalır, `/api/public-config` sunucusundan genel ayarlarını okumaya devam eder.
- `*.pages.dev` üzerinde `cloud.js`, yalnızca **publishable (public)** Supabase URL ve anahtarını içeren `./public-config.json` dosyasını okur. Service-role anahtarları veya kullanıcı verileri hiçbir zaman statik kopyaya konulmaz.
- `node scripts/build-static.js` komutu tarayıcıda kullanılacak dosyaları `dist/` dizinine ayıklar; Vercel `api/`, Supabase migration dosyaları ve kod deposunun yardımcı dosyaları yayınlanmaz.
- Cloudflare dashboard → Workers & Pages → Create → Pages → **Import Git repository** → `faksoy12-wq/asm-gider-takip` → production branch `main` → build command `node scripts/build-static.js` → output directory `dist`.
- Cloudflare'da Pages adresi oluşturulduktan sonra Supabase → Authentication → URL Configuration → **Redirect URLs** listesine tam adres (ör. `https://<proje>.pages.dev/`) eklenmelidir; aksi takdirde yeni hesapların e-posta onay bağlantısı varsayılan Vercel adresine dönebilir. Üretimde exact URL tercih edilir.
- Giriş, ASM davet linkleri ve PDF çıktı işlemleri, her statik ayna kendi origin adresinde çalışır. Mevcut kullanıcıların ilk kez alternatif domaine geçtiklerinde **tekrar giriş yapmaları normaldir**, çünkü tarayıcı oturumları origin bazında tutulur.
- Bir ağ `supabase.co` veya `cdn.jsdelivr.net` erişimini de engelliyorsa ikinci adres tek başına yeterli olmayabilir; bağlantıyı gerçek iş yeri Wi-Fi'sinden doğrulayın.

## v21 — Cloudflare Workers statik dağıtımı (kullanıcının mevcut kurulumu)

Cloudflare'ın yeni kurulum akışı otomatik olarak **Workers Builds** açtı; ekrandaki deploy komutu `npx wrangler deploy`. Pages'i yeniden oluşturmak gerekmiyor. `wrangler.jsonc` bu mevcut Worker'ın `dist/` klasöründeki uygulama varlıklarını **statik dosya olarak** sunmasını sağlar. Hazır GitHub build entegrasyonu:

- Build command: `node scripts/build-static.js`
- Deploy command: `npx wrangler deploy`
- Worker name: `asm-gider-takip`
- `wrangler.jsonc` assets directory: `./dist`
- Statik Worker adresleri genelde `*.workers.dev` uzantılıdır. `cloud.js` bu alan adlarında `public-config.json` dosyasını okur. Vercel mevcut API üzerinden çalışmayı sürdürür.
- Cloudflare Workers → Domains & Routes altında gerçekten yayımlanan **tam** `workers.dev` URL bulunmalı. Adresi varsaymayın.
- Supabase Authentication Redirect URLs listesine mevcut Worker URL'si eklenmelidir. Aynı Supabase hesabıyla tekrar giriş gerekir; browser login state farklı origin'ler arasında paylaşılmaz.
- Yayımlanan alternatif adresin iş yerindeki Wi-Fi ve farklı mobil ağlarda açılacağı garanti edilemez; gerçek ağlarda test edin.

## v22 — Mobil beyaz ekran teşhisi

- `/baglanti-testi.html` herhangi bir giriş istemeyen, bağımsız HTML sayfasıdır. HTML kendisi açılamıyorsa mobil ağın Cloudflare Workers `workers.dev` alanına erişiminde sorun vardır. Sayfa açılıyorsa uygulama, Supabase yapılandırması ve üçüncü taraf istemci kütüphanesi ayrı ayrı test edilebilir.
- Uygulamanın açılış animasyonu 15 saniyeden uzun sürerse basit ve erişilebilir bir yönlendirme gösterilir. Böylece uygulama hazır değilken boş veya sonsuz yükleme ekranında kalmak yerine test sayfasına gidilebilir.
- Bu test kullanıcı verilerini görüntülemez veya sunucuya kayıt yazmaz. Eski veritabanı, giriş, ASM davet ve gider işlemleri değiştirilmez.

## v23 — Tek bağlantı için GitHub Pages akıllı giriş

- Kaynak: `docs/index.html`. GitHub Pages yayımlama kaynağı `main` dalındaki `/docs` klasörü olmalıdır.
- GitHub → Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` → Folder: `/docs` → Save.
- Etkinleştirilip yayımlandıktan sonra beklenen paylaşım adresi: `https://faksoy12-wq.github.io/asm-gider-takip/`. **Açıldığını kontrol etmeden bu adresi dağıtmayın.**
- Basit `Image` probe üzerinden mevcut Vercel ve Cloudflare Workers bağlantılarına ayrı ayrı, cache-busting favicon isteği gönderilir. Test CORS gerektirmez. Vercel ulaşılabiliyorsa onu, Vercel yanıt vermeyip Cloudflare erişilebiliyorsa Cloudflare'ı seçer. Her iki adres için manuel giriş her zaman sunulur.
- Tarayıcının adresi hiç açamadığı veya sitenin statik görselleri ulaşsa da JavaScript'in yüklenemediği durumlar otomatik olarak çözülemez; bağlantı sağlık kontrolü tam işlevsellik testi değildir.
- İlk otomatik geçişten tarayıcının geri tuşuyla dönüldüğünde yeniden zorla yönlendirilmez. Linkteki davet parametreleri (`search`/`hash`) yönlendirilen adrese korunur. Her iki sağlayıcı mevcut Supabase verilerini paylaşır; bu sayfa kimlik bilgisi saklamaz.
- **Önemli:** GitHub Pages yayını bu repo için GitHub Settings üzerinden etkinleştirilmelidir. Bu kodun GitHub'a commitlenmiş olması tek başına Pages yayını başlatmaz.

## v24 — Render üçüncü statik yedek ve akıllı giriş güncellemesi

- Render static site: `https://asm-gider-takip-yedek.onrender.com/`, workspace `My Workspace`, GitHub `main` branch, build command `node scripts/build-static.js`, publish `dist`, auto-deploy enabled. Render deploy initial status `live`.
- `docs/index.html` GitHub Pages akıllı giriş sayfasında üçüncü probe hedefi olarak Render eklendi. Öncelik Vercel → Cloudflare → Render; 7 saniyelik bağımsız görsel istekleri tamamlandığında ilk erişilebilir adres açılır.
- Manuel üç bağlantı ve davet parametrelerinin (`search` ve `hash`) korunması devam eder. GitHub Pages yayınının tamamlanması ve farklı ağlardan gerçek cihaz testi gerekir.
- Erişilebilir favicon, uygulamanın veya Supabase'in tamamen çalıştığını garanti etmez. Tarayıcı tüm sağlayıcıların DNS/TLS isteğini engelliyorsa otomatik yönlendirme bunu aşamaz.
