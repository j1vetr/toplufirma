---
name: Tahsilat kapsamı
description: Bağımsız tahsilatın gemi ve bağlı firma ilişkisi ile fatura ödemesinden ayrımı.
---

Bağımsız tahsilatta gemi seçilerek tahsilat geminin bağlı firmasına atanabilmeli. Bu tahsilat bağlı firma carisinde ve grubun toplamında görünmeli. Gemi seçimi tek başına herhangi bir faturayı ödenmiş yapmamalı.

**Why:** Kullanıcı tahsilatı yalnızca genel cariye değil bağlı firmaya da eklemek istediğini, fatura ödemesinden bahsetmediğini açıkça belirtti.

**How to apply:** Tahsilat oluşturma akışlarında gemi ve bağlı firma seçimini destekle. Bağımsız tahsilatı gemisine bakarak otomatik olarak faturayla eşleştirme.

Mevcut tahsilatın faturaya saydırılması yeni tahsilat veya kasa hareketi değildir. Bir tahsilat birden fazla faturaya kısmen dağıtılabilir. Faturanın durumu karşılanan tutardan hesaplanmalı ve aynı para tekrar kullanılamamalı. Yeni Ödeme Kaydet işlemi ise para girişini bir kez oluşturmalı.

**Why:** Kullanıcı iki 500 USD faturaya tek 750 USD tahsilat girildiğinde faturaları kapatmanın toplam tahsilatı 1250 USD göstermesini istemedi. Mevcut tahsilattan karşılayıp birini tam, diğerini kısmi ödendi yapma akışını onayladı.

**How to apply:** Cari ve kasa toplamlarına yalnızca gerçek para hareketlerini dahil et. Faturayla eşleştirmeyi geri almak tahsilatı silmemeli. Fatura veya tahsilat silindiğinde kalan tutarları ve fatura durumlarını birlikte tutarlı tut.

Fatura listesinde her satıra ayrı bir “Tahsilattan Ödendi” düğmesi koyma. Bu seçenek Ödeme Kaydet penceresinde, Yeni Tahsilat Kaydet seçeneği ve bilgi simgesiyle birlikte kalmalı.

**Why:** Kullanıcı ayrı düğmelerin tüm faturalar tahsilattan ödenmiş gibi görünmesine neden olduğunu belirtti ve listeden kaldırılıp ödeme penceresinde kalmasını seçti.

**How to apply:** Fatura listesinde ödeme işlemleri için tek giriş noktasını koru. İşlem seçeneklerini ödeme penceresinde sun.

Cari ekranlarında fatura seçimi isteğe bağlı olmalı. Fatura seçildiğinde fatura ekranlarıyla aynı Yeni Tahsilat Kaydet / Tahsilattan Ödendi akışı kullanılmalı. Fatura seçilmezse bağımsız tahsilat korunmalı. Müşteriye yapılan ödeme, fatura tahsilatından ayrı kalmalı.

**Why:** Kullanıcı farklı sayfalardaki Ödeme Kaydet davranışlarının aynı olup olmadığını sordu ve cari ekranlarında isteğe bağlı fatura seçimiyle ortak akışa geçilmesini onayladı.

**How to apply:** Yeni ödeme giriş noktalarında faturayı zorunlu yapma. Faturaya bağlanan işlemlerde aynı tam/kısmi ödeme ve bilgi açıklamalarını koru.
