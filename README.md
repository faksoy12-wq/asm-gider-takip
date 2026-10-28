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
