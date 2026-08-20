import { useState } from "react";
import { Link } from "wouter";
import {
  useGetDashboardOzet, getGetDashboardOzetQueryKey,
  useGetSonIslemler, getGetSonIslemlerQueryKey,
  useGetAylikGelir, getGetAylikGelirQueryKey,
  useGetVadesiYaklasanFaturalar, getGetVadesiYaklasanFaturalarQueryKey,
  useGetFirmaGelir, getGetFirmaGelirQueryKey,
} from "@workspace/api-client-react";
import { 
  Plus, Wallet, Building2, PieChart, 
  ArrowRight, TrendingUp, TrendingDown, ChevronRight, 
  Calendar, Clock, FileText, Banknote, AlertCircle
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useSirket } from "@/contexts/sirket-context";

const fmt = (n: number, pb = "USD") =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(n) + " " + pb;

const bakiyeDurumu = (bakiye: number) =>
  bakiye < -0.01 ? "Alacak Bakiyesi" : bakiye > 0.01 ? "Tahsil edilecek" : "Kapatılmış";

const DURUM_ETK: Record<string, string> = {
  taslak: "Taslak", acik: "Açık", kismi_odendi: "Kısmi", odendi: "Ödendi", iptal: "İptal",
};

function StatusBadge({ durum }: { durum: string }) {
  const STATUS_UI: Record<string, { text: string, border: string, dot: string }> = {
    taslak: { text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" },
    acik: { text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" },
    kismi_odendi: { text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
    odendi: { text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
    iptal: { text: "text-zinc-500", border: "border-zinc-200", dot: "bg-zinc-400" },
  };

  const ui = STATUS_UI[durum] || STATUS_UI.taslak;
  const etiket = DURUM_ETK[durum] || durum;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border bg-white text-[10px] font-bold uppercase tracking-wider ${ui.border} ${ui.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ui.dot}`} />
      {etiket}
    </span>
  );
}

function QuickActionButton({ href, icon: Icon, label, primary }: { href: string; icon: any; label: string; primary?: boolean }) {
  return (
    <Link href={href} className={`
      flex items-center gap-2 px-3.5 py-2 text-sm font-semibold transition-all rounded-sm border
      ${primary 
        ? "bg-foreground text-background border-foreground hover:bg-foreground/90 shadow-sm" 
        : "bg-white text-foreground border-border/60 hover:border-foreground/30 hover:bg-slate-50"}
    `}>
      <Icon className="w-4 h-4" />
      {label}
    </Link>
  );
}

function EmptyState({ text, icon: Icon = FileText }: { text: string; icon?: any }) {
  return (
    <div className="p-8 text-center flex flex-col items-center justify-center h-full min-h-[160px] border border-dashed border-border/60 rounded-sm bg-slate-50/30">
       <Icon className="w-6 h-6 text-muted-foreground/30 mb-3" />
       <p className="text-sm font-medium text-muted-foreground">{text}</p>
    </div>
  );
}

export default function Dashboard() {
  const { aktifSirketId } = useSirket();
  const firmaParam = aktifSirketId ? { catiFirmaId: aktifSirketId } : undefined;
  const yil = new Date().getFullYear();

  const { data: ozet, isLoading } = useGetDashboardOzet(
    firmaParam,
    { query: { queryKey: [...getGetDashboardOzetQueryKey(firmaParam), aktifSirketId] } },
  );
  
  const pbListe = (ozet?.paraBirimiOzetleri ?? []).map(p => p.paraBirimi);
  const [secilenPb, setSecilenPb] = useState<string | null>(null);
  const grafikPb = secilenPb && pbListe.includes(secilenPb) ? secilenPb : (pbListe[0] ?? "USD");

  const aylikParams = { ...firmaParam, paraBirimi: grafikPb };
  const { data: aylikVeriler = [] } = useGetAylikGelir(
    aylikParams,
    { query: { queryKey: [...getGetAylikGelirQueryKey(aylikParams), aktifSirketId] } },
  );

  const firmaGelirParams = { ...firmaParam, yil, paraBirimi: grafikPb };
  const { data: firmaGelirVeriler = [] } = useGetFirmaGelir(
    firmaGelirParams,
    { query: { queryKey: [...getGetFirmaGelirQueryKey(firmaGelirParams), aktifSirketId, yil] } },
  );
  
  const { data: sonIslemler } = useGetSonIslemler(
    firmaParam,
    { query: { queryKey: [...getGetSonIslemlerQueryKey(firmaParam), aktifSirketId] } },
  );
  
  const { data: vadesiYaklasan = [] } = useGetVadesiYaklasanFaturalar(
    { ...firmaParam, gun: 14 },
    { query: { queryKey: [...getGetVadesiYaklasanFaturalarQueryKey({ ...firmaParam, gun: 14 }), aktifSirketId] } },
  );

  if (isLoading) {
    return (
      <div className="space-y-8 pb-8">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted animate-pulse rounded-sm" />
            <div className="h-4 w-64 bg-muted animate-pulse rounded-sm" />
          </div>
          <div className="flex gap-2 hidden md:flex">
             {[1,2,3,4].map(i => <div key={i} className="h-9 w-28 bg-muted animate-pulse rounded-sm" />)}
          </div>
        </div>
        <div className="h-4 w-32 bg-muted animate-pulse rounded-sm mt-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-sm" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
           <div className="lg:col-span-1 h-80 bg-muted animate-pulse rounded-sm" />
           <div className="lg:col-span-2 h-80 bg-muted animate-pulse rounded-sm" />
        </div>
      </div>
    );
  }

  const pbOzet = ozet?.paraBirimiOzetleri ?? [];
  const bugun = new Date().toLocaleDateString("sv-SE");

  const aktifAylar = (aylikVeriler as { ayAd: string; toplamFatura?: number; toplamTahsilat?: number }[]).filter(
    a => (a.toplamFatura ?? 0) > 0 || (a.toplamTahsilat ?? 0) > 0
  );

  const aktifFirmaGelir = firmaGelirVeriler.filter(f => f.toplamFatura > 0 || f.toplamTahsilat > 0);
  
  const chartData = aktifSirketId === null ? aktifFirmaGelir : aktifAylar;
  const xAxisKey = aktifSirketId === null ? "catiFirmaAd" : "ayAd";
  const hasChartData = chartData.length > 0;

  return (
    <div className="space-y-8 pb-8">
      {/* Header & Quick Actions */}
      <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
         <div className="animate-in fade-in duration-300 fill-mode-both">
           <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> {ozet?.toplamFaturaSayisi || 0} Fatura İşlemi</span>
            <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {ozet?.vadesGecmisFaturaSayisi || 0} Geciken Fatura</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-300 fill-mode-both" style={{ animationDelay: '100ms' }}>
           <QuickActionButton href="/faturalar/yeni" icon={Plus} label="Yeni Fatura" primary />
           <QuickActionButton href="/odemeler" icon={Wallet} label="Tahsilat & Ödeme" />
           <QuickActionButton href="/cariler" icon={Building2} label="Cariler" />
           <QuickActionButton href="/raporlar" icon={PieChart} label="Raporlar" />
        </div>
      </section>

      {/* Currency Balances */}
      <section>
         <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Aktif Bakiye Durumu</h2>
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pbOzet.length > 0 ? pbOzet.map((pb, i) => (
               <div 
                 key={pb.paraBirimi}
                 className="bg-white border border-border/60 p-5 rounded-sm relative overflow-hidden group hover:border-foreground/30 transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both" 
                 style={{ animationDelay: `${i * 50}ms` }}
               >
                 <div className="absolute top-0 left-0 w-[3px] h-full bg-foreground/10 group-hover:bg-primary transition-colors" />
                 <div className="pl-2">
                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{pb.paraBirimi} Net Bakiye</h3>
                   <div className="text-2xl font-display font-bold tracking-tight text-foreground">
                     {fmt(pb.kalanBakiye, pb.paraBirimi)}
                   </div>
                    <p className={`mt-1 text-[11px] font-semibold ${
                      pb.kalanBakiye < -0.01 ? "text-red-600" : pb.kalanBakiye > 0.01 ? "text-orange-600" : "text-green-600"
                    }`}>
                      {bakiyeDurumu(pb.kalanBakiye)}
                    </p>
                   <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between text-xs">
                     <span className="text-muted-foreground font-medium">Toplam Tahsilat</span>
                     <span className="font-bold text-foreground">{fmt(pb.toplamTahsilat, pb.paraBirimi)}</span>
                   </div>
                 </div>
               </div>
            )) : (
              <div className="col-span-full">
                <EmptyState text="Henüz bakiye verisi bulunmuyor." icon={Wallet} />
              </div>
            )}
         </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Upcoming Due List */}
         <div className="lg:col-span-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Yaklaşan Tahsilatlar</h2>
               {vadesiYaklasan.length > 0 && (
                 <span className="text-[10px] font-bold bg-foreground text-background px-2 py-0.5 rounded-sm">
                   {vadesiYaklasan.length} Kayıt
                 </span>
               )}
            </div>
            <div className="flex-1 bg-white border border-border/60 rounded-sm overflow-hidden flex flex-col relative">
               {vadesiYaklasan.length > 0 && <div className="absolute top-0 left-0 w-full h-[2px] bg-primary z-10" />}
               
               <div className="p-0 flex-1 overflow-y-auto max-h-[340px] custom-scrollbar">
                 {vadesiYaklasan.length > 0 ? (
                    <div className="divide-y divide-border/40">
                       {vadesiYaklasan.map((f, i) => {
                          const isOverdue = f.vadeTarihi.slice(0, 10) < bugun;
                          return (
                            <Link 
                              key={f.id} 
                              href={`/faturalar/${f.id}`} 
                              className="block p-4 relative bg-white hover:bg-slate-50 transition-colors animate-in fade-in slide-in-from-right-2 duration-300 fill-mode-both group" 
                              style={{ animationDelay: `${i * 50}ms` }}
                            >
                               <div className={`absolute left-0 top-0 h-full w-[2px] bg-transparent group-hover:bg-foreground/20 transition-colors ${isOverdue ? 'bg-rose-500/50 group-hover:bg-rose-500' : ''}`} />
                               <div className="flex justify-between items-start mb-1.5 pl-1">
                                 <span className="font-semibold text-[13px] text-foreground group-hover:underline">{f.faturaNo}</span>
                                 <span className="font-bold text-[13px] text-foreground">{fmt(f.kalanTutar ?? f.genelToplam, f.paraBirimi)}</span>
                               </div>
                               <div className="flex justify-between items-center text-[11px] text-muted-foreground font-medium uppercase tracking-wide pl-1">
                                 <span className="truncate pr-2">{f.bagliFirmaAd}</span>
                                 <span className={`flex items-center gap-1 whitespace-nowrap ${isOverdue ? 'text-rose-600 font-bold' : ''}`}>
                                   <Clock className="w-3 h-3" /> Vade: {f.vadeTarihi}
                                 </span>
                               </div>
                            </Link>
                          );
                       })}
                    </div>
                 ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
                       <Banknote className="w-8 h-8 mb-3 opacity-20" />
                       <p className="text-sm font-medium text-foreground">Harika!</p>
                       <p className="text-xs mt-1">Yakın zamanda vadesi dolacak fatura bulunmuyor.</p>
                    </div>
                 )}
               </div>
               {vadesiYaklasan.length > 0 && (
                  <div className="p-3 border-t border-border/60 bg-slate-50/50">
                    <Link href="/faturalar" className="text-xs font-bold text-foreground hover:text-foreground/70 flex items-center justify-center gap-1 uppercase tracking-widest">
                      Tümünü Gör <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
               )}
            </div>
         </div>

         {/* Analytics Chart */}
         <div className="lg:col-span-2 flex flex-col">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {aktifSirketId === null ? `Firma Gelir Özeti (${yil}, ${grafikPb})` : `Aylık Nakit Akışı (${yil}, ${grafikPb})`}
              </h2>
              {pbListe.length > 1 && (
                <div className="flex items-center gap-1">
                  {pbListe.map(pb => (
                    <button
                      key={pb}
                      type="button"
                      onClick={() => setSecilenPb(pb)}
                      className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-sm border transition-colors ${pb === grafikPb ? "bg-foreground text-background border-foreground" : "bg-white text-muted-foreground border-border/60 hover:border-foreground/30"}`}
                    >
                      {pb}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 bg-white border border-border/60 rounded-sm p-6 relative overflow-hidden group min-h-[300px]">
               {hasChartData ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={2} barSize={28}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.6} />
                     <XAxis dataKey={xAxisKey} tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} dy={10} />
                     <YAxis 
                        tick={{ fontSize: 11, fill: '#71717a' }} 
                        tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}k` : String(Math.round(v)))} 
                        axisLine={false} 
                        tickLine={false} 
                        dx={-10} 
                        width={45} 
                     />
                     <Tooltip 
                       cursor={{ fill: '#f4f4f5' }}
                       contentStyle={{ borderRadius: '2px', border: '1px solid #e4e4e7', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', fontSize: '12px', padding: '8px 12px' }} 
                       formatter={(v: number, n: string) => [fmt(Number(v), grafikPb), n === "toplamFatura" ? "Fatura" : "Tahsilat"]} 
                     />
                     <Legend 
                        iconType="circle" 
                        wrapperStyle={{ fontSize: '12px', paddingTop: '20px', fontWeight: 500 }} 
                        formatter={(v: string) => v === "toplamFatura" ? "Fatura Edilen" : "Tahsil Edilen"} 
                     />
                     <Bar dataKey="toplamFatura" fill="#18181b" radius={[2, 2, 0, 0]} />
                     <Bar dataKey="toplamTahsilat" fill="#a1a1aa" radius={[2, 2, 0, 0]} />
                   </BarChart>
                 </ResponsiveContainer>
               ) : (
                 <EmptyState text="Bu dönem için grafik verisi bulunamadı." icon={PieChart} />
               )}
            </div>
         </div>
      </section>

      {/* Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Recent Invoices */}
         <div>
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Son Faturalar</h2>
               <Link href="/faturalar" className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                 Tümü <ChevronRight className="w-3 h-3" />
               </Link>
            </div>
            <div className="bg-white border border-border/60 rounded-sm overflow-hidden">
               {sonIslemler?.sonFaturalar?.length ? (
                  <div className="divide-y divide-border/40">
                     {sonIslemler.sonFaturalar.slice(0, 5).map((f, i) => (
                        <div key={f.id} className="p-4 relative bg-white hover:bg-slate-50 transition-colors flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both group" style={{ animationDelay: `${(i) * 50}ms` }}>
                           <div className="absolute left-0 top-0 h-full w-[2px] bg-transparent group-hover:bg-foreground/10 transition-colors" />
                           <div className="min-w-0 flex-1 pl-1">
                              <div className="flex items-center gap-3 mb-1.5">
                                 <Link href={`/faturalar/${f.id}`} className="font-semibold text-[13px] text-foreground hover:underline">{f.faturaNo}</Link>
                                 <StatusBadge durum={f.durum} />
                              </div>
                              <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-3">
                                 <span className="truncate max-w-[180px]">{f.bagliFirmaAd}</span>
                                 <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {f.faturaTarihi}</span>
                              </div>
                           </div>
                           <div className="text-right shrink-0 ml-4">
                              <div className="font-bold text-[13px] text-foreground">{fmt(f.genelToplam, f.paraBirimi)}</div>
                              {(f.kalanTutar ?? 0) > 0.005 && f.durum !== 'odendi' && (
                                 <div className="text-[10px] text-muted-foreground font-bold mt-1 uppercase tracking-wider">Kalan: {fmt(f.kalanTutar ?? 0, f.paraBirimi)}</div>
                              )}
                           </div>
                        </div>
                     ))}
                  </div>
               ) : (
                 <EmptyState text="Son fatura bulunamadı." icon={FileText} />
               )}
            </div>
         </div>

         {/* Recent Payments */}
         <div>
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Son İşlemler</h2>
               <Link href="/odemeler" className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                 Tümü <ChevronRight className="w-3 h-3" />
               </Link>
            </div>
            <div className="bg-white border border-border/60 rounded-sm overflow-hidden">
               {sonIslemler?.sonOdemeler?.length ? (
                  <div className="divide-y divide-border/40">
                     {sonIslemler.sonOdemeler.slice(0, 5).map((o, i) => (
                        <div key={o.id} className="p-4 relative bg-white hover:bg-slate-50 transition-colors flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both group" style={{ animationDelay: `${(i) * 50}ms` }}>
                           <div className="absolute left-0 top-0 h-full w-[2px] bg-transparent group-hover:bg-foreground/10 transition-colors" />
                           <div className="min-w-0 flex-1 pl-1 flex items-start gap-3">
                              <div className={`mt-0.5 w-7 h-7 rounded-sm flex items-center justify-center shrink-0 border ${o.tip === 'tahsilat' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                 {o.tip === 'tahsilat' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                 <p className="font-semibold text-[13px] text-foreground truncate">{o.aciklama || (o.tip === 'tahsilat' ? 'Tahsilat' : 'Ödeme')}</p>
                                 <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mt-1.5 flex items-center gap-3">
                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {o.tarih}</span>
                                    {o.faturaNo && <span className="truncate flex items-center gap-1 border-l pl-2 border-border/60"><FileText className="w-3 h-3" /> {o.faturaNo}</span>}
                                 </div>
                              </div>
                           </div>
                           <div className="text-right shrink-0 ml-4">
                              <div className={`font-bold text-[13px] ${o.tip === 'tahsilat' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                 {o.tip === 'tahsilat' ? '+' : '-'}{fmt(o.tutar, o.paraBirimi)}
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               ) : (
                 <EmptyState text="Son işlem bulunamadı." icon={Wallet} />
               )}
            </div>
         </div>
      </section>
    </div>
  );
}
