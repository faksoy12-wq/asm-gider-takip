# ASM Gider Takip (PWA)

Aile Sağlığı Merkezi hekimleri için harcama, gider paylaşımı ve ay sonu hesaplaşma uygulaması.

## Vercel ile yayınlama

1. Vercel kontrol panelinde **Add New → Project** seçin.
2. GitHub deposu **faksoy12-wq/asm-gider-takip** için **Import** seçin.
3. Framework Preset: **Other**; Root Directory: `./`. Build Command / Output Directory alanlarını boş (varsayılan) bırakın.
4. **Deploy** seçin. Vercel HTTPS adresi açıldığında sayfa görüntülenir.
5. Android Chrome'da **Uygulamayı yükle**, iPhone Safari'de **Paylaş → Ana Ekrana Ekle** seçeneklerini kullanın.

## İlk sürümün özellikleri

- Hekim ekleme; daha önce işlem görmüş hekimin yanlışlıkla silinmesini engelleme
- Gider kaydetme, düzenleme, silme; tutarları kuruş bazında işleme
- Eşit veya yüzdesel bölüşüm (kuruş farkları için dengeli dağıtım)
- Seçilen ayın net alacak/borç bakiyesi ve önerilen transferler
- Gerçekleşmiş transferi “ödendi” işaretleme ve yanlış kaydı geri alma
- JSON yedek alma / yükleme, CSV gider dışa aktarımı
- Telefonda ana ekrana eklenebilen PWA; daha önce açılmış dosyaları çevrimdışı kullanabilme

## Önemli sınırlamalar

**Bu sürüm bir pilot / kişisel test sürümüdür.** Veriler yalnızca o cihazın o tarayıcısındaki `localStorage` alanında tutulur. Birden fazla hekim arasında senkronizasyon, kullanıcı girişleri, sunucu veritabanı ve otomatik yedek henüz yoktur. Aynı URL farklı telefonlarda aynı verileri göstermez. Tarayıcı verileri silinirse yedeksiz kayıtlar kaybolabilir.

GitHub deposunun görünürlüğü **Public** olduğunda kaynak kod herkes tarafından görülebilir. Bu kodda kullanıcı parolası veya gizli anahtar bulunmaz; buraya gizli anahtar ya da gerçek mali kayıt eklemeyin. **Hasta adı, TC kimlik numarası, sağlık bilgisi veya diğer hassas verileri bu sürüme girmeyin.** Gerçek ekip kullanımı için kimlik doğrulama, yetki kontrolü, sunucu yedeği ve Supabase gibi merkezi bir veritabanı planlanmalıdır.

“Ödendi” yalnızca bir kayıt oluşturur, gerçek banka havalesi gerçekleştirmez. Gider düzenlenirse o aya ait önceki ödeme kayıtlarını yeniden kontrol edin. Borçlar aylar arasında otomatik devredilmez. Fatura fotoğrafı ekleme henüz yoktur.

## Teknoloji

Statik HTML/CSS/JavaScript + Service Worker + Web App Manifest. Derleme veya gizli ortam değişkeni gerektirmez.
