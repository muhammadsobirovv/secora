# Secora AI — Holat hisoboti

*Sana: 2026-07-12*

Ushbu hisobot ikki qismdan iborat: (1) shu sessiyada bajarilgan ish — WSL'dan Windows'ga ko'chirish, buglarni tuzatish, ishga tushirish; (2) loyihaning umumiy holati — qaysi modul qay darajada tayyor, 3-modul (Recon) qayerda to'xtagani.

---

## 1-qism: Shu sessiyada bajarilgan ish

### Boshlang'ich vaziyat
Loyiha avvalgi ko'rib chiqishda bir nechta xatolik topilgan edi, ular tuzatilgan edi, so'ng loyiha WSL/Kali'dan native Windows muhitiga ko'chirildi. Ko'chirishdan keyin registratsiya va Google Sign-In doim xato berardi. Uzoq debugging davomida asosiy sabab **WSL port-relay muammosi** ekani aniqlandi: `wslrelay.exe` `localhost` portlarini WSL ichidagi eski, tuzatilmagan serverga yo'naltirib yuborar edi — shuning uchun Windows'da qilingan tuzatishlar "ko'rinmayotgandek" tuyular edi.

Bir necha muvaffaqiyatsiz debugging tsiklidan so'ng, siz loyihani **butunlay o'chirib, WSL'dagi asl nusxadan qayta ko'chirishga** qaror qildingiz. Bu ishni bajardim va barcha tuzatishlarni yangi nusxaga qaytadan qo'lladim.

### Tuzatilgan xatoliklar (barchasi tekshirildi va ishlaydi)

**Xavfsizlik va mantiqiy xatolar (backend):**
- Refresh token rotatsiyasidagi race condition — ikkita bir vaqtdagi so'rov bitta tokenni ikki marta ishlatishi mumkin edi. Atomik `rotateIfActive` bilan tuzatildi.
- Ro'yxatdan o'tishda email unique constraint (P2002) xatosi 500 sifatida chiqib ketardi — endi to'g'ri 409 "email band" xatosi qaytariladi.
- Google/GitHub OAuth'da CSRF himoyasi (`state` parametri) yo'q edi — HMAC-imzolangan `StatelessOAuthStateStore` bilan qo'shildi.
- MFA'ni o'chirishda joriy parolni tekshirish yo'q edi — endi majburiy.
- Helmet xavfsizlik header'lari va `trust proxy` sozlamasi yo'q edi — qo'shildi.
- 5 ta use-case (reset-password, change-password, logout, revoke-session, mfa-confirm) bir nechta yozuvni bitta tranzaksiyada bajarmasdi — `@Transactional()` bilan atomik qilindi.
- Frontend `confirmPassword` maydoni backend'ga yuborilib, DTO validatsiyasini buzayotgan edi (`register`, `change-password`) — endi yuborilmaydi.

**Windows muhitiga moslashtirish:**
- `tsx watch` (esbuild) generic tipdagi (`ConfigService<EnvConfig, true>`) konstruktor parametrlari uchun reflection metadata chiqarmasligi sababli 11 ta faylda Dependency Injection ishlamay qolgan edi — barchasiga aniq `@Inject(ConfigService)` qo'shildi.
- Test skriptlari `NODE_OPTIONS=...` sintaksisi Windows cmd'da ishlamasligi — `cross-env` bilan tuzatildi.
- 5 ta unit test fayli yangi `@Transactional()` bilan mos kelmay qolgani — `compileTransactionalTestingModule` yordamchisiga o'tkazildi.

**Yangi topilgan va tuzatilgan 2 ta muammo (avvalgi sessiyada bo'lmagan):**
- Ma'lumotlar bazasida USER/ADMIN rollari seed qilinmagan edi (`prisma db seed` ishga tushirilmagan) — ishga tushirildi, ro'yxatdan o'tish endi ishlaydi.
- **OAuth callback yo'nalishi noto'g'ri edi** — API `/auth/oauth/callback` ga yo'naltirar edi, lekin frontend sahifasi haqiqatda `/oauth/callback` yo'lida joylashgan (bu **loyihaning asl, mendan oldingi xatosi**, Windows ko'chirishga aloqasi yo'q). Middleware (`proxy.ts`) buni tanimay, foydalanuvchini login sahifasiga qaytarib yuborardi. Tuzatildi.

### Yakuniy tekshiruv (brauzerda amalda sinaldi)
- ✅ Email/parol bilan ro'yxatdan o'tish — ishlaydi ("Check your email" ekrani chiqdi)
- ✅ Google Sign-In — to'liq ishlaydi, dashboard'ga muvaffaqiyatli kirildi ("Welcome back, Muhammad")
- ✅ API va Web serverlar toza ishga tushdi, DI xatolari yo'q
- ✅ Lokal Postgres (`prisma dev`) ishlayapti, schema sinxron

---

## 2-qism: Loyihaning umumiy holati (modullar bo'yicha)

`PROJECT_SPEC.md`da belgilangan rejaga ko'ra loyiha 11 modulga bo'lingan, bir vaqtda faqat bitta modul quriladi. Hozirgi holat:

### ✅ Modul 1 — Auth (TAYYOR)
Ro'yxatdan o'tish, email tasdiqlash, login/logout, JWT + refresh-token rotatsiyasi, argon2 parol hash, parolni unutish/tiklash/o'zgartirish, Google/GitHub OAuth, TOTP MFA + backup kodlar, RBAC asosi, sessiya/qurilma boshqaruvi, audit log, rate limiting, Swagger docs, seed data. To'liq test qilingan (61 ta unit test), hujjatlashtirilgan (`docs/adr/0001-auth-module.md`, `docs/modules/01-auth.md`), git'ga commit qilingan.

### ✅ Modul 2 — Workspace Foundation + Dashboard UI (TAYYOR)
Backend: Workspaces, Projects, Targets, Notes, Evidence, Attachments, Tags, Activity Timeline, Search. Frontend: to'liq Next.js dashboard (sidebar, barcha sahifalar, Settings, command palette, dark-mode). Hujjatlashtirilgan (`docs/adr/0002-workspace-foundation-module.md`), git'ga commit qilingan.

### 🟡 Modul 3 — Recon Engine (WSL'da qurilayotgan edi — QISMAN TAYYOR, COMMIT QILINMAGAN)

Bu siz so'ragan qism — aynan shu yerda to'xtagan ekansiz.

**Backend kodi ancha yozilgan:**
- 8 ta real pentest vositasi uchun to'liq adapter + normalizer + unit test: **nmap, naabu, subfinder, assetfinder, httpx, dnsx, whatweb, gowitness** (port skanerlash, subdomain enum, HTTP probe, DNS, fingerprinting, screenshot).
- Job pipeline to'liq: job yaratish/bekor qilish/qayta urinish, alohida worker process (`worker.main.ts`) job'larni polling orqali bajaradi, natijalarni (findings) target'ga "promote" qilish, log stream (SSE).
- CQRS pattern bilan yozilgan (commands/queries/controllers/repositories), integratsiya testlari (`.itest.ts`) va e2e test fayli (`recon.e2e-spec.ts`) mavjud.
- Ma'lumotlar bazasi sxemasi tayyor: `recon_jobs`, `recon_job_tool_runs`, `recon_job_logs`, `recon_findings` jadvallari, alohida migration (`20260201000000_recon_engine`).

**Nima YETISHMAYDI / tugallanmagan:**

| Narsa | Holat |
|---|---|
| **Git commit** | Yo'q — barcha recon fayllari hali `git status`da "untracked" (hech qachon commit qilinmagan) |
| **Frontend UI** | Umuman yo'q — dashboard sidebar'da "Recon" hali ham "Soon" (kelayotgan) belgisi bilan, sahifa yo'q |
| **ADR hujjati** | Yo'q — kodda `docs/adr/0003-recon-engine-module.md`ga izoh bor, lekin bu fayl hali yaratilmagan |
| **Spec'dagi vositalar** | PROJECT_SPEC.md 15 ta narsani talab qiladi (WHOIS, DNS, Subdomain Enum, ASN Lookup, Tech Detection, HTTP Headers, robots.txt, sitemap.xml, Wayback URLs, Security Headers, TLS Analysis, Directory Discovery, Port Info, Fingerprinting, Screenshots). Hozir faqat **8 tasi** vosita orqali qoplangan (DNS, Subdomain Enum ×2, Tech Detection, HTTP Headers qisman, Port Info ×2, Fingerprinting, Screenshots). **Yetishmayapti:** WHOIS, ASN Lookup, robots.txt, sitemap.xml, Wayback URLs, alohida Security Headers tahlili, TLS Analysis, Directory Discovery (gobuster/ffuf kabi) |
| **Haqiqiy vositalar o'rnatilgan emas** | `nmap`, `subfinder`, `httpx-toolkit`, `dnsx`, `naabu`, `whatweb`, `assetfinder`, `gowitness` — bular Kali Linux'da odatda tayyor, lekin native Windows'da yo'q. Shuning uchun bu modulni WSL/Kali'da qurayotgan edingiz — Windows'da ular PATH'da bo'lmagani sabab hech qanday recon job real ishlay olmaydi (hozircha) |
| **End-to-end sinov** | Hali birror marta amalda ishga tushirilib ko'rilmagan (na Windows'da, na WSL'da tasdiqlangan) |

**Xulosa:** Modul 3'ning "orkestratsiya" qatlami (job yaratish, navbat, worker, DB, API) arxitektura jihatidan deyarli tugallangan va puxta yozilgan ko'rinadi. Lekin (a) haqiqiy skanerlash vositalari to'plami spec'ning yarmigacha, (b) frontend butunlay yo'q, (c) hech narsa hali git'ga commit qilinmagan va hujjatlashtirilmagan, (d) Windows muhitida real vositalar yo'qligi sabab hozircha sinab bo'lmaydi.

### ⬜ Modul 4–11 (BOSHLANMAGAN)
Vulnerability Tools, Bug Bounty Workspace, Report Generator, AI Assistant, CVE Center, Knowledge Base, Admin Panel, Integrations/Mobile/Plugin SDK — hech biriga hali qo'l tegmagan.

---

## Qo'shimcha eslatma: Git holati

`git status` deyarli **barcha** fayllarni "modified" deb ko'rsatmoqda — bu WSL→Windows rsync ko'chirishi paytida satr oxiri (line-ending, CRLF/LF) farqidan bo'lishi ehtimoli katta, real kod o'zgarishi emas. Bunga alohida e'tibor berish kerak: birinchi commit qilishdan oldin bu diff'lar chindan ham faqat kosmetik ekanini tekshirib ko'rish tavsiya etiladi (`git diff --ignore-space-at-eol` yoki shunga o'xshash). `docs/releases/`, `docs/reviews/` papkalari va yangi recon fayllari hali hech qachon commit qilinmagan.

---

## Tavsiya etiladigan keyingi qadamlar (fikr uchun)

1. Git holatini tozalash — CRLF/LF muammosini hal qilish, keyin Modul 1–2 o'zgarishlarini (agar chindan faqat formatlash bo'lsa) yoki Modul 3 ishini alohida commit qilish.
2. Modul 3 uchun `docs/adr/0003-recon-engine-module.md` yozish (spec'da ko'rsatilgan, hali yo'q).
3. Recon uchun frontend UI qurish (job yaratish, natijalarni ko'rish, log oqimi).
4. Yetishmayotgan skaner vositalarini qo'shish yoki hozirgi 8 tasini "Modul 3 v1" deb belgilab, qolganini keyingi bosqichga qoldirish haqida qaror qabul qilish.
5. Recon vositalarini qayerda ishga tushirish haqida qaror: WSL/Kali (vositalar tayyor, lekin bu sessiyada port-relay muammosi chiqargan edi) yoki Windows'ga vositalarni alohida o'rnatish, yoki Docker konteyner orqali izolyatsiya qilish.
