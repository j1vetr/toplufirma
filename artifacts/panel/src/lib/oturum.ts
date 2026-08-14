/**
 * Merkezi oturum/izin yanıt takibi.
 *
 * Paneldeki tüm API çağrıları (React Query sorguları, mutasyonlar ve
 * doğrudan fetch kullanımları) global `fetch` üzerinden geçer. Burada
 * `fetch` bir kez sarmalanır ve /api yanıtlarında:
 *  - 401 → oturum geçersiz (kullanıcı silinmiş/pasif/token süresi dolmuş)
 *  - 403 → modül izni değişmiş olabilir
 * durumlarında kayıtlı işleyiciler tetiklenir. İşleyiciler App tarafından
 * kaydedilir (kullanıcı bilgisini /auth/me ile tazeler ya da çıkış yapar).
 */

export type OturumIsleyicileri = {
  /** Oturum geçersiz (401) — çıkış yapılmalı. */
  on401: () => void;
  /** Yetki reddi (403) — izinler tazelenmeli. */
  on403: () => void;
};

let isleyiciler: OturumIsleyicileri | null = null;

export function setOturumIsleyicileri(h: OturumIsleyicileri | null): void {
  isleyiciler = h;
}

function istekUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof Request) return input.url;
  return input.toString();
}

let kuruldu = false;

/** Global fetch'i bir kez sarmalar; tekrar çağrılırsa etkisizdir. */
export function kurOturumInterceptor(): void {
  if (kuruldu) return;
  kuruldu = true;

  const orijinalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const yanit = await orijinalFetch(input, init);
    try {
      const url = istekUrl(input);
      // Sadece kendi API'mizin yanıtları; auth uçları hariç
      // (/auth/login'de 401 = yanlış parola, /auth/me zaten yenileme çağrısı).
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const apiMi = path === "/api" || path.startsWith("/api/");
      const authMu = path.startsWith("/api/auth/");
      if (apiMi && !authMu && isleyiciler) {
        if (yanit.status === 401) isleyiciler.on401();
        else if (yanit.status === 403) isleyiciler.on403();
      }
    } catch {
      // Takip hatası isteği etkilemesin.
    }
    return yanit;
  };
}
