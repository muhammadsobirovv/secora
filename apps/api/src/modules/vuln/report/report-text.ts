import type {
  PipelineStage,
  ReportConfidence,
  ReportLanguage,
  ReportNotTestedDto,
  VerificationStatus,
  VulnFindingSeverity,
  VulnScanProfile,
} from '@pentesthub/shared';

/// Every fixed string of the exported report (HTML and PDF), in the three
/// supported languages. Text that comes from the scan itself (titles, tool
/// advice, evidence) is not translated here: it is shown as the tool wrote it.

type Dict = Record<string, string>;

const EN: Dict = {
  title: 'Security scan report',
  target: 'Website',
  profile: 'Scan type',
  status: 'Status',
  started: 'Started',
  finished: 'Finished',
  generated: 'Report created',
  score: 'Score',
  grade: 'Grade',
  summary: 'Summary',
  bySeverity: 'Findings by severity',
  byConfidence: 'Findings by confidence',
  scope: 'What was scanned',
  scopeApex: '{root} and all of its subdomains (DNS ownership proof)',
  scopeHost:
    '{root} only (the ownership proof covers this host, not its subdomains)',
  scopeUnknown: 'Not recorded',
  notTested: 'What was NOT tested',
  notTestedIntro:
    'A clean result only means that nothing was found by the checks below. These were not covered:',
  findings: 'Findings',
  noFindings: 'No findings were reported.',
  affected: 'Affected',
  whatIsThis: 'What is this',
  whyItMatters: 'Why it matters',
  howToFix: 'How to fix',
  exampleFor: 'Example for {stack}',
  evidence: 'Evidence (secrets removed)',
  request: 'Request',
  response: 'Response',
  payload: 'Payload',
  references: 'References',
  reportedBy: 'Reported by',
  verification: 'Re-check',
  tools: 'Tools and versions',
  toolRan: 'ran',
  toolNotRun: 'did not run',
  stages: 'Stages',
  methodology: 'How to read this report',
  method1:
    'Severity is set by the tool that reported the finding and is never changed by Secora or by AI. When two tools report the same issue, the higher of their severities is kept.',
  method2:
    'CONFIRMED means a safe re-check (one GET request, no data changed) reproduced the issue. LIKELY means a tool reported it and it was not, or could not be, re-checked. INFO is informational.',
  method3:
    'The score starts at 100 and loses points per finding (critical 25, high 15, medium 7, low 2), counted in full for confirmed findings and at 70% for likely ones. A critical or high finding caps the grade.',
  footer:
    'Created by Secora. Use it only for sites you own or are allowed to test.',
  yes: 'yes',
  no: 'no',
  aiExplained:
    'Explanation written by AI from the check description; the severity is not AI-assigned.',
  builtInExplained: 'Built-in explanation.',
  sev_CRITICAL: 'Critical',
  sev_HIGH: 'High',
  sev_MEDIUM: 'Medium',
  sev_LOW: 'Low',
  sev_INFO: 'Info',
  conf_CONFIRMED: 'Confirmed',
  conf_LIKELY: 'Likely',
  conf_INFO: 'Info',
  prof_QUICK: 'Quick check',
  prof_STANDARD: 'Standard scan',
  prof_DEEP: 'Deep scan',
  prof_NONE: 'Custom',
  ver_REPRODUCED: 'Reproduced by a safe re-check',
  ver_NOT_REPRODUCED: 'Not reproduced by the re-check',
  ver_NOT_APPLICABLE:
    'Not re-checked (this kind of finding cannot be re-checked safely)',
  ver_FAILED: 'The re-check could not be completed',
  stage_recon: 'Recon',
  stage_subdomains: 'Subdomains',
  stage_resolve: 'DNS resolve',
  stage_ports: 'Ports',
  stage_checks: 'Checks',
  stage_crawl: 'Crawl',
  stage_scan: 'Template scan',
  stage_content: 'Content discovery',
  stage_xss: 'XSS',
  stage_verify: 'Re-check',
  state_done: 'done',
  state_skipped: 'skipped',
  state_failed: 'failed',
  'state_not-run': 'not run',
  nt_STAGE_FAILED:
    'The "{stage}" stage failed or stopped early{detail}. Its results are partial.',
  nt_STAGE_SKIPPED: 'The "{stage}" stage was skipped{detail}.',
  nt_STAGE_NOT_RUN: 'The "{stage}" stage did not run.',
  nt_NO_AUTH: 'Pages behind a login were not tested.',
  nt_NO_BUSINESS_LOGIC:
    'Application logic (prices, permissions, workflows) was not tested.',
  nt_HOME_PAGE_ONLY:
    'Only the home page of each address was examined; other pages were not.',
  nt_NO_TEMPLATES: 'No vulnerability templates were run.',
  nt_NO_PORT_SCAN: 'Open ports and other network services were not scanned.',
  nt_NO_CONTENT_DISCOVERY:
    'Hidden files and directories were not searched for.',
  nt_NO_XSS_TESTING: 'Cross-site scripting was not tested.',
  nt_NO_STORED_XSS: 'Stored and blind cross-site scripting were not tested.',
  nt_HTTP_TEMPLATES_ONLY:
    'Only web (HTTP) templates were run; TLS, TCP and DNS templates were not.',
  nt_SUBDOMAINS_NOT_COVERED:
    'Subdomains were not scanned: ownership was verified for this host only.',
};

const UZ: Dict = {
  title: 'Xavfsizlik skaneri hisoboti',
  target: 'Veb-sayt',
  profile: 'Skanerlash turi',
  status: 'Holat',
  started: 'Boshlandi',
  finished: 'Tugadi',
  generated: 'Hisobot yaratildi',
  score: 'Ball',
  grade: 'Daraja',
  summary: 'Qisqacha natija',
  bySeverity: "Topilmalar jiddiyligi bo'yicha",
  byConfidence: "Topilmalar ishonchlilik bo'yicha",
  scope: 'Nima skanerlandi',
  scopeApex: "{root} va uning barcha subdomenlari (DNS orqali egalik tasdig'i)",
  scopeHost:
    "Faqat {root} (egalik tasdig'i shu xostni qamrab oladi, subdomenlarni emas)",
  scopeUnknown: 'Qayd etilmagan',
  notTested: 'Nima TEKSHIRILMADI',
  notTestedIntro:
    'Toza natija faqat quyidagi tekshiruvlar hech narsa topmaganini bildiradi. Quyidagilar qamrab olinmagan:',
  findings: 'Topilmalar',
  noFindings: 'Hech qanday topilma qayd etilmadi.',
  affected: 'Qayerda',
  whatIsThis: 'Bu nima',
  whyItMatters: 'Nega muhim',
  howToFix: 'Qanday tuzatish kerak',
  exampleFor: '{stack} uchun misol',
  evidence: 'Dalil (sirlar olib tashlangan)',
  request: "So'rov",
  response: 'Javob',
  payload: 'Payload',
  references: 'Havolalar',
  reportedBy: 'Aniqlagan vositalar',
  verification: 'Qayta tekshiruv',
  tools: 'Vositalar va versiyalar',
  toolRan: 'ishladi',
  toolNotRun: 'ishlamadi',
  stages: 'Bosqichlar',
  methodology: "Hisobotni qanday o'qish kerak",
  method1:
    "Jiddiylikni topilmani aniqlagan vosita belgilaydi va Secora ham, sun'iy intellekt ham uni o'zgartirmaydi. Ikki vosita bir muammoni topsa, ularning yuqorisi saqlanadi.",
  method2:
    "TASDIQLANGAN — xavfsiz qayta tekshiruv (bitta GET so'rov, hech qanday ma'lumot o'zgarmaydi) muammoni takrorladi. EHTIMOLIY — vosita aniqlagan, ammo qayta tekshirilmagan yoki tekshirib bo'lmagan. MA'LUMOT — axborot xarakterida.",
  method3:
    "Ball 100 dan boshlanadi va har bir topilma uchun kamayadi (kritik 25, yuqori 15, o'rta 7, past 2): tasdiqlanganlar to'liq, ehtimoliylar 70% hisoblanadi. Kritik yoki yuqori topilma darajani cheklaydi.",
  footer:
    "Secora tomonidan yaratilgan. Faqat o'zingizga tegishli yoki tekshirishga ruxsat berilgan saytlar uchun foydalaning.",
  yes: 'ha',
  no: "yo'q",
  aiExplained:
    "Tushuntirishni sun'iy intellekt tekshiruv tavsifi asosida yozgan; jiddiylikni u belgilamagan.",
  builtInExplained: 'Tayyor tushuntirish.',
  sev_CRITICAL: 'Kritik',
  sev_HIGH: 'Yuqori',
  sev_MEDIUM: "O'rta",
  sev_LOW: 'Past',
  sev_INFO: "Ma'lumot",
  conf_CONFIRMED: 'Tasdiqlangan',
  conf_LIKELY: 'Ehtimoliy',
  conf_INFO: "Ma'lumot",
  prof_QUICK: 'Tezkor tekshiruv',
  prof_STANDARD: 'Standart skanerlash',
  prof_DEEP: 'Chuqur skanerlash',
  prof_NONE: 'Maxsus',
  ver_REPRODUCED: 'Xavfsiz qayta tekshiruvda takrorlandi',
  ver_NOT_REPRODUCED: 'Qayta tekshiruvda takrorlanmadi',
  ver_NOT_APPLICABLE:
    "Qayta tekshirilmagan (bunday topilmani xavfsiz qayta tekshirib bo'lmaydi)",
  ver_FAILED: "Qayta tekshiruvni yakunlab bo'lmadi",
  stage_recon: 'Razvedka',
  stage_subdomains: 'Subdomenlar',
  stage_resolve: 'DNS',
  stage_ports: 'Portlar',
  stage_checks: 'Tekshiruvlar',
  stage_crawl: 'Aylanish',
  stage_scan: 'Shablonli skanerlash',
  stage_content: 'Kontent qidirish',
  stage_xss: 'XSS',
  stage_verify: 'Qayta tekshiruv',
  state_done: 'bajarildi',
  state_skipped: "o'tkazib yuborildi",
  state_failed: 'xato',
  'state_not-run': 'ishga tushmadi',
  nt_STAGE_FAILED:
    '"{stage}" bosqichi xato bilan tugadi yoki erta to\'xtadi{detail}. Natijalari to\'liq emas.',
  nt_STAGE_SKIPPED: '"{stage}" bosqichi o\'tkazib yuborildi{detail}.',
  nt_STAGE_NOT_RUN: '"{stage}" bosqichi ishga tushmadi.',
  nt_NO_AUTH: 'Kirish (login) ortidagi sahifalar tekshirilmadi.',
  nt_NO_BUSINESS_LOGIC:
    "Ilova mantig'i (narxlar, huquqlar, jarayonlar) tekshirilmadi.",
  nt_HOME_PAGE_ONLY:
    "Har bir manzilning faqat bosh sahifasi ko'rib chiqildi; boshqa sahifalar emas.",
  nt_NO_TEMPLATES: 'Zaiflik shablonlari ishga tushirilmadi.',
  nt_NO_PORT_SCAN: 'Ochiq portlar va boshqa tarmoq xizmatlari skanerlanmadi.',
  nt_NO_CONTENT_DISCOVERY: 'Yashirin fayl va papkalar qidirilmadi.',
  nt_NO_XSS_TESTING: 'Cross-site scripting tekshirilmadi.',
  nt_NO_STORED_XSS:
    'Saqlanuvchi va "ko\'r" cross-site scripting tekshirilmadi.',
  nt_HTTP_TEMPLATES_ONLY:
    'Faqat veb (HTTP) shablonlari ishga tushirildi; TLS, TCP va DNS shablonlari emas.',
  nt_SUBDOMAINS_NOT_COVERED:
    'Subdomenlar skanerlanmadi: egalik faqat shu xost uchun tasdiqlangan.',
};

const RU: Dict = {
  title: 'Отчёт о сканировании безопасности',
  target: 'Сайт',
  profile: 'Тип сканирования',
  status: 'Статус',
  started: 'Начало',
  finished: 'Окончание',
  generated: 'Отчёт создан',
  score: 'Оценка',
  grade: 'Класс',
  summary: 'Итог',
  bySeverity: 'Находки по серьёзности',
  byConfidence: 'Находки по достоверности',
  scope: 'Что сканировалось',
  scopeApex: '{root} и все его поддомены (подтверждение владения через DNS)',
  scopeHost:
    'Только {root} (подтверждение владения охватывает этот хост, но не поддомены)',
  scopeUnknown: 'Не записано',
  notTested: 'Что НЕ проверялось',
  notTestedIntro:
    'Чистый результат означает лишь то, что проверки ниже ничего не нашли. Не охвачено:',
  findings: 'Находки',
  noFindings: 'Находок нет.',
  affected: 'Где',
  whatIsThis: 'Что это',
  whyItMatters: 'Почему это важно',
  howToFix: 'Как исправить',
  exampleFor: 'Пример для {stack}',
  evidence: 'Доказательства (секреты удалены)',
  request: 'Запрос',
  response: 'Ответ',
  payload: 'Payload',
  references: 'Ссылки',
  reportedBy: 'Обнаружено',
  verification: 'Перепроверка',
  tools: 'Инструменты и версии',
  toolRan: 'запускался',
  toolNotRun: 'не запускался',
  stages: 'Этапы',
  methodology: 'Как читать этот отчёт',
  method1:
    'Серьёзность задаёт инструмент, обнаруживший проблему; ни Secora, ни ИИ её не меняют. Если два инструмента нашли одну и ту же проблему, остаётся более высокая серьёзность.',
  method2:
    'ПОДТВЕРЖДЕНО — безопасная перепроверка (один GET-запрос, данные не меняются) воспроизвела проблему. ВЕРОЯТНО — инструмент сообщил о ней, но перепроверки не было или она невозможна. ИНФО — информационная находка.',
  method3:
    'Оценка начинается со 100 и уменьшается за каждую находку (критическая 25, высокая 15, средняя 7, низкая 2): подтверждённые считаются полностью, вероятные на 70%. Критическая или высокая находка ограничивает класс.',
  footer:
    'Создано в Secora. Используйте только для сайтов, которыми вы владеете или которые вам разрешено проверять.',
  yes: 'да',
  no: 'нет',
  aiExplained:
    'Пояснение написано ИИ по описанию проверки; серьёзность ИИ не назначал.',
  builtInExplained: 'Встроенное пояснение.',
  sev_CRITICAL: 'Критическая',
  sev_HIGH: 'Высокая',
  sev_MEDIUM: 'Средняя',
  sev_LOW: 'Низкая',
  sev_INFO: 'Инфо',
  conf_CONFIRMED: 'Подтверждено',
  conf_LIKELY: 'Вероятно',
  conf_INFO: 'Инфо',
  prof_QUICK: 'Быстрая проверка',
  prof_STANDARD: 'Стандартное сканирование',
  prof_DEEP: 'Глубокое сканирование',
  prof_NONE: 'Особый',
  ver_REPRODUCED: 'Воспроизведено безопасной перепроверкой',
  ver_NOT_REPRODUCED: 'Перепроверка не воспроизвела',
  ver_NOT_APPLICABLE:
    'Не перепроверялось (такую находку нельзя безопасно перепроверить)',
  ver_FAILED: 'Перепроверку не удалось выполнить',
  stage_recon: 'Разведка',
  stage_subdomains: 'Поддомены',
  stage_resolve: 'DNS',
  stage_ports: 'Порты',
  stage_checks: 'Проверки',
  stage_crawl: 'Обход',
  stage_scan: 'Сканирование шаблонами',
  stage_content: 'Поиск контента',
  stage_xss: 'XSS',
  stage_verify: 'Перепроверка',
  state_done: 'выполнен',
  state_skipped: 'пропущен',
  state_failed: 'сбой',
  'state_not-run': 'не запускался',
  nt_STAGE_FAILED:
    'Этап «{stage}» завершился сбоем или остановился раньше{detail}. Его результаты неполные.',
  nt_STAGE_SKIPPED: 'Этап «{stage}» пропущен{detail}.',
  nt_STAGE_NOT_RUN: 'Этап «{stage}» не запускался.',
  nt_NO_AUTH: 'Страницы за логином не проверялись.',
  nt_NO_BUSINESS_LOGIC:
    'Логика приложения (цены, права, процессы) не проверялась.',
  nt_HOME_PAGE_ONLY:
    'Рассматривалась только главная страница каждого адреса; другие страницы — нет.',
  nt_NO_TEMPLATES: 'Шаблоны уязвимостей не запускались.',
  nt_NO_PORT_SCAN: 'Открытые порты и другие сетевые службы не сканировались.',
  nt_NO_CONTENT_DISCOVERY: 'Скрытые файлы и каталоги не искались.',
  nt_NO_XSS_TESTING: 'Межсайтовый скриптинг не проверялся.',
  nt_NO_STORED_XSS: 'Хранимый и «слепой» межсайтовый скриптинг не проверялись.',
  nt_HTTP_TEMPLATES_ONLY:
    'Запускались только веб-шаблоны (HTTP); шаблоны TLS, TCP и DNS — нет.',
  nt_SUBDOMAINS_NOT_COVERED:
    'Поддомены не сканировались: владение подтверждено только для этого хоста.',
};

const DICTS: Record<ReportLanguage, Dict> = { en: EN, uz: UZ, ru: RU };

export function text(
  language: ReportLanguage,
  key: string,
  params: Record<string, string> = {},
): string {
  const raw = DICTS[language][key] ?? EN[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) => params[name] ?? '');
}

export const severityName = (l: ReportLanguage, s: VulnFindingSeverity) =>
  text(l, `sev_${s}`);
export const confidenceName = (l: ReportLanguage, c: ReportConfidence) =>
  text(l, `conf_${c}`);
export const profileName = (l: ReportLanguage, p: VulnScanProfile | null) =>
  text(l, `prof_${p ?? 'NONE'}`);
export const verificationName = (l: ReportLanguage, v: VerificationStatus) =>
  text(l, `ver_${v}`);
export const stageName = (l: ReportLanguage, s: PipelineStage) =>
  text(l, `stage_${s}`);
export const stateName = (l: ReportLanguage, s: string) =>
  text(l, `state_${s}`);

export function notTestedText(
  l: ReportLanguage,
  item: ReportNotTestedDto,
): string {
  const detail = item.detail
    ? ` (${item.detail.replace(/[\r\n]+/g, ' ').slice(0, 200)})`
    : '';
  return text(l, `nt_${item.code}`, {
    stage: item.stage ? stageName(l, item.stage) : '',
    detail,
  });
}
