---
name: tw-animate-css class adları
description: Panelde animasyon utility'leri tw-animate-css kullanır, Animate.css değil
---
Panel `tw-animate-css` import eder (index.css). Geçerli sınıflar: `animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both` gibi.
**Why:** Bir design geçişi Animate.css adlarını (`animate__animated animate__fadeInUp`) yazdı, sınıflar sessizce hiç çalışmadı (build hatası yok).
**How to apply:** Yeni animasyon eklerken `animate__` öneki görürsen yanlıştır, tw-animate-css utility'lerine çevir. Gecikmeli stagger için `fill-mode-both` şart, yoksa eleman gecikme öncesi görünür.
