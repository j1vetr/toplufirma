import { useId, useState } from "react";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function TahsilatIslemBilgisi() {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          aria-label="Tahsilat işlemleri hakkında bilgi"
          title="Tahsilat işlemleri hakkında bilgi"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={16}
        aria-labelledby={titleId}
        className="w-[calc(100vw-2rem)] max-w-[26rem] max-h-[70dvh] overflow-y-auto p-4"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id={titleId} className="font-semibold">Hangi Tahsilat İşlemini Seçmeliyim?</h3>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Bilgilendirmeyi kapat" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="space-y-4 text-sm leading-relaxed">
          <section className="space-y-1">
            <h4 className="font-semibold">1. Yeni Tahsilat Kaydet</h4>
            <p>Müşteriden yeni para geldiyse ve bu parayı henüz sisteme girmediyseniz seçin. Tutar, tarih, ödeme yöntemi ve varsa banka hesabını belirtin.</p>
            <p className="text-muted-foreground">Tahsilat kaydı bir kez oluşturulur, cari bakiyeyi azaltır ve seçtiğiniz hesaba yansır. Aynı tutar faturanın ödenen tutarına da eklenir.</p>
          </section>
          <section className="space-y-1 border-t pt-3">
            <h4 className="font-semibold">2. Tahsilattan Ödendi</h4>
            <p>Parayı daha önce tahsilat olarak kaydettiyseniz seçin. Bu faturaya saydırmak istediğiniz tutarı girin.</p>
            <p className="text-muted-foreground">Aynı bağlı firma, çatı firma ve para birimindeki kullanılmamış tahsilatlar, en eskisinden başlanarak kullanılır. Tutar hem kullanılabilir tahsilatı hem de faturanın kalan borcunu aşamaz.</p>
            <p className="font-medium">Yeni tahsilat veya kasa/banka hareketi oluşmaz. Cari bakiye ikinci kez azalmaz.</p>
          </section>
          <section className="space-y-1 border-t pt-3">
            <h4 className="font-semibold">Kısmi Ödeme Nasıl Çalışır?</h4>
            <p>Her iki işlemde de faturanın yalnızca bir kısmını karşılayabilirsiniz. Örneğin 500 USD faturaya 200 USD girerseniz durum Kısmi Ödendi, kalan borç 300 USD olur. Kalan borç da karşılandığında fatura otomatik Ödendi olur.</p>
          </section>
          <section className="space-y-1 border-t pt-3">
            <h4 className="font-semibold">Örnek: İki Fatura, Tek Tahsilat</h4>
            <p>İki adet 500 USD faturanız ve önceden kaydedilmiş 750 USD tahsilatınız olsun. Tahsilattan Ödendi ile ilk faturaya 500 USD, ikinciye 250 USD saydırın.</p>
            <p className="text-muted-foreground">İlk fatura Ödendi, ikinci fatura Kısmi Ödendi olur. Caride toplam tahsilat 750 USD, kalan borç 250 USD olarak kalır.</p>
          </section>
          <section className="space-y-1 border-t pt-3">
            <h4 className="font-semibold">Yanlış Eşleştirmeyi Düzeltme</h4>
            <p>Fatura detayındaki Mevcut Tahsilattan Karşılananlar bölümünden eşleştirmeyi kaldırabilirsiniz. Tahsilat silinmez, ayrılan tutar yeniden kullanılabilir olur ve faturanın ödeme durumu yeniden hesaplanır.</p>
          </section>
          <p className="border border-amber-500/40 bg-amber-500/10 p-3 font-medium">
            Aynı parayı iki kez kaydetmeyin. Daha önce tahsilata girdiğiniz para için Yeni Tahsilat Kaydet yerine Tahsilattan Ödendi seçeneğini kullanın.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
