---
name: Derleme görsellerinin taşınabilirliği
description: Sunucuya aktarılan kaynaklarda yüklenen dosyalar klasörünün bulunmaması
---
Uygulamanın derlenmesi için gereken küçük, sabit marka görselleri uygulama kaynaklarıyla birlikte sürümlenmeli. Yüklenen dosyalar klasörü dağıtım paketinin parçası kabul edilmemeli.

**Why:** Kullanıcının sunucusundaki üretim derlemesi eksik logo nedeniyle durdu. Çalışma ortamının genel Git dışlama kuralı `attached_assets` içeriğini dışarıda bırakıyor, bu yüzden burada görünen bir dosya sunucuya aktarılan kodda bulunmayabiliyor.

**How to apply:** Sabit arayüz görsellerini aktarılabilir kaynaklardan içe al. Yeni bir görsel bağımlılığında yalnızca önizlemeyi değil, üretim derlemesini ve kaynak dosyanın Git tarafından dışlanmadığını da kontrol et. Kullanıcı tarafından yüklenen dinamik içerikleri bu sabit görsellerle karıştırma.
