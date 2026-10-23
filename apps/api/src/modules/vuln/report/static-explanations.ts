import type { ReportLanguage } from '@pentesthub/shared';
import type { VulnFindingSeverity } from '../../../prisma-types.js';

/// The built-in explanation of a finding class: what it is, why it matters,
/// how to fix it. It is what a user sees when no AI provider is configured, the
/// quota is used up, or the model's answer was unusable, and it is the context
/// the AI is asked to rephrase (never to override).

export interface StaticExplanation {
  whatIsThis: string;
  whyItMatters: string;
  howToFix: string;
}

type Triple = Record<ReportLanguage, StaticExplanation>;

const e = (
  whatIsThis: string,
  whyItMatters: string,
  howToFix: string,
): StaticExplanation => ({
  whatIsThis,
  whyItMatters,
  howToFix,
});

const CLASSES: Record<string, Triple> = {
  'security-header': {
    en: e(
      'A security header is a short instruction the website sends to the browser telling it to switch on a protection. This site does not send one of them.',
      'Without it the browser applies no extra protection, so a small mistake elsewhere (for example an injected script or a hostile frame) is easier to exploit.',
      'Add the header on the web server or in the application, as in the example below, then reload the site and check that the header appears.',
    ),
    uz: e(
      "Xavfsizlik sarlavhasi — sayt brauzerga yuboradigan qisqa ko'rsatma bo'lib, u brauzerda muayyan himoyani yoqadi. Bu sayt ulardan birini yubormayapti.",
      "U bo'lmasa brauzer qo'shimcha himoya qo'llamaydi, shuning uchun boshqa joydagi kichik xato (masalan, kiritilgan skript yoki yot freym) ekspluatatsiya qilinishi osonroq bo'ladi.",
      "Sarlavhani veb-serverda yoki ilovada quyidagi misoldagidek qo'shing, so'ng saytni qayta yuklab, sarlavha paydo bo'lganini tekshiring.",
    ),
    ru: e(
      'Заголовок безопасности — это короткая инструкция, которую сайт отправляет браузеру, чтобы включить определённую защиту. Этот сайт не отправляет один из них.',
      'Без него браузер не применяет дополнительную защиту, и небольшая ошибка в другом месте (например, внедрённый скрипт или чужой фрейм) эксплуатируется легче.',
      'Добавьте заголовок на веб-сервере или в приложении, как в примере ниже, затем перезагрузите сайт и убедитесь, что заголовок появился.',
    ),
  },
  cookie: {
    en: e(
      'A cookie that the site sets lacks a protective flag (Secure, HttpOnly or SameSite).',
      'Cookies often hold the login session. Without these flags a cookie can be read by scripts, sent over unencrypted connections, or attached to requests from other sites.',
      'Set the missing flag when the cookie is created. The example below shows it for your stack.',
    ),
    uz: e(
      'Sayt o‘rnatadigan cookie himoya bayrog‘iga (Secure, HttpOnly yoki SameSite) ega emas.',
      'Cookie ko‘pincha kirish sessiyasini saqlaydi. Bu bayroqlarsiz cookie skriptlar tomonidan o‘qilishi, shifrlanmagan ulanish orqali yuborilishi yoki boshqa saytlardan kelgan so‘rovlarga qo‘shilishi mumkin.',
      'Cookie yaratilayotganda yetishmayotgan bayroqni o‘rnating. Quyidagi misol sizning texnologiyangiz uchun ko‘rsatilgan.',
    ),
    ru: e(
      'Cookie, которую устанавливает сайт, не имеет защитного флага (Secure, HttpOnly или SameSite).',
      'В cookie часто хранится сессия входа. Без этих флагов cookie могут прочитать скрипты, передать по незашифрованному соединению или прикрепить к запросам с других сайтов.',
      'Установите недостающий флаг при создании cookie. Пример ниже показан для вашей технологии.',
    ),
  },
  cors: {
    en: e(
      "CORS decides which other websites may read this site's responses in a visitor's browser. Here the rule is too open.",
      "A hostile website could make a visitor's browser request data from this site and read the answer, including data that belongs to the logged-in visitor.",
      'Allow only a short list of trusted origins, never repeat back whatever origin the request names, and never combine credentials with a wildcard.',
    ),
    uz: e(
      "CORS qaysi boshqa saytlar tashrif buyuruvchi brauzerida bu saytning javoblarini o'qiy olishini belgilaydi. Bu yerda qoida juda ochiq.",
      "Yot sayt tashrif buyuruvchining brauzeri orqali bu saytdan ma'lumot so'rab, javobni, jumladan kirgan foydalanuvchining ma'lumotlarini ham o'qishi mumkin.",
      "Faqat ishonchli originlarning qisqa ro'yxatiga ruxsat bering, so'rovdagi originni aynan qaytarmang va hech qachon credentials'ni wildcard bilan birga ishlatmang.",
    ),
    ru: e(
      'CORS определяет, какие другие сайты могут читать ответы этого сайта в браузере посетителя. Здесь правило слишком открытое.',
      'Чужой сайт может заставить браузер посетителя запросить данные у этого сайта и прочитать ответ, в том числе данные вошедшего пользователя.',
      'Разрешите только короткий список доверенных источников, не возвращайте в ответ любой источник из запроса и не сочетайте учётные данные с подстановочным знаком.',
    ),
  },
  'exposed-file': {
    en: e(
      'A file or page that should be private can be opened by anyone who knows its address (for example source-control data, configuration, a backup or a diagnostics page).',
      'Such files often contain source code, passwords, keys or internal details that make a real attack much easier.',
      'Remove the file from the public web folder or block access to it in the web server, then treat anything it contained (passwords, keys) as exposed and change it.',
    ),
    uz: e(
      "Maxfiy bo'lishi kerak bo'lgan fayl yoki sahifani manzilini biladigan har kim ochishi mumkin (masalan, versiya nazorati ma'lumotlari, sozlamalar, zaxira nusxa yoki diagnostika sahifasi).",
      "Bunday fayllarda ko'pincha manba kodi, parollar, kalitlar yoki ichki tafsilotlar bo'ladi va ular haqiqiy hujumni ancha osonlashtiradi.",
      "Faylni ochiq veb-papkadan olib tashlang yoki veb-serverda unga kirishni bloklang, so'ng undagi hamma narsani (parollar, kalitlar) oshkor bo'lgan deb hisoblab, almashtiring.",
    ),
    ru: e(
      'Файл или страница, которые должны быть закрыты, открываются любым, кто знает адрес (например, данные системы контроля версий, конфигурация, резервная копия или страница диагностики).',
      'В таких файлах часто есть исходный код, пароли, ключи или внутренние детали, которые сильно упрощают настоящую атаку.',
      'Уберите файл из публичной папки или закройте к нему доступ на веб-сервере, а всё, что в нём было (пароли, ключи), считайте раскрытым и замените.',
    ),
  },
  tls: {
    en: e(
      "There is a problem with the site's HTTPS certificate or the encryption versions it accepts.",
      'Visitors may see browser warnings and lose trust, and weak or expired encryption can let an attacker on the same network read or change traffic.',
      "Renew or replace the certificate with one from a trusted authority (Let's Encrypt is free), serve the full certificate chain, and allow only TLS 1.2 and 1.3.",
    ),
    uz: e(
      'Saytning HTTPS sertifikati yoki u qabul qiladigan shifrlash versiyalarida muammo bor.',
      "Tashrif buyuruvchilar brauzer ogohlantirishlarini ko'rib, ishonchni yo'qotishi mumkin, zaif yoki muddati o'tgan shifrlash esa bir tarmoqdagi hujumchiga trafikni o'qish yoki o'zgartirish imkonini beradi.",
      "Sertifikatni ishonchli markazdan olingan sertifikat bilan yangilang yoki almashtiring (Let's Encrypt bepul), to'liq zanjirni taqdim eting va faqat TLS 1.2 va 1.3 ga ruxsat bering.",
    ),
    ru: e(
      'Есть проблема с HTTPS-сертификатом сайта или с версиями шифрования, которые он принимает.',
      'Посетители могут видеть предупреждения браузера и терять доверие, а слабое или просроченное шифрование позволяет злоумышленнику в той же сети читать или менять трафик.',
      "Продлите или замените сертификат на выданный доверенным центром (Let's Encrypt бесплатен), отдавайте полную цепочку и разрешите только TLS 1.2 и 1.3.",
    ),
  },
  disclosure: {
    en: e(
      'The server tells every visitor which software and version it runs.',
      'Attackers use the exact version to look up known weaknesses and aim at them.',
      'Configure the server or framework to hide the version (or the whole header), as in the example below.',
    ),
    uz: e(
      'Server har bir tashrif buyuruvchiga qaysi dastur va qaysi versiyada ishlayotganini aytadi.',
      "Hujumchilar aniq versiya bo'yicha ma'lum zaifliklarni topib, aynan shularga zarba beradi.",
      'Serverni yoki frameworkni versiyani (yoki butun sarlavhani) yashiradigan qilib sozlang, quyidagi misoldagidek.',
    ),
    ru: e(
      'Сервер сообщает каждому посетителю, какое ПО и какой версии он использует.',
      'Злоумышленники по точной версии ищут известные уязвимости и целятся именно в них.',
      'Настройте сервер или фреймворк так, чтобы он скрывал версию (или весь заголовок), как в примере ниже.',
    ),
  },
  'http-redirect': {
    en: e(
      'The site can be opened over plain, unencrypted HTTP.',
      'Anyone on the same network (public Wi-Fi, for example) can read or change what visitors send and receive.',
      'Serve the site over HTTPS only and redirect every HTTP request to HTTPS.',
    ),
    uz: e(
      'Saytni oddiy, shifrlanmagan HTTP orqali ochish mumkin.',
      "Bir tarmoqdagi (masalan, ochiq Wi-Fi) har kim tashrif buyuruvchilar yuboradigan va oladigan narsani o'qishi yoki o'zgartirishi mumkin.",
      "Saytni faqat HTTPS orqali taqdim eting va har bir HTTP so'rovini HTTPS ga yo'naltiring.",
    ),
    ru: e(
      'Сайт открывается по обычному, незашифрованному HTTP.',
      'Любой человек в той же сети (например, в общественном Wi-Fi) может читать или менять то, что посетители отправляют и получают.',
      'Отдавайте сайт только по HTTPS и перенаправляйте каждый HTTP-запрос на HTTPS.',
    ),
  },
  'open-port': {
    en: e(
      'A network service is reachable from the internet on this port.',
      'Every reachable service is a place to attack. Databases, remote-desktop and admin services in particular should never be public.',
      'If the service does not need to be public, close the port in the firewall or bind it to a private address. If it does, keep it updated and require strong authentication.',
    ),
    uz: e(
      'Ushbu portda tarmoq xizmatiga internetdan kirish mumkin.',
      "Har bir ochiq xizmat — hujum uchun joy. Ayniqsa ma'lumotlar bazalari, masofaviy ish stoli va admin xizmatlari hech qachon ochiq bo'lmasligi kerak.",
      "Xizmat ochiq bo'lishi shart bo'lmasa, portni xavfsizlik devorida yoping yoki shaxsiy manzilga bog'lang. Ochiq bo'lishi kerak bo'lsa, uni yangilab turing va kuchli autentifikatsiyani talab qiling.",
    ),
    ru: e(
      'К сетевой службе на этом порту можно подключиться из интернета.',
      'Каждая доступная служба — это место для атаки. Базы данных, удалённый рабочий стол и административные службы особенно не должны быть публичными.',
      'Если служба не должна быть публичной, закройте порт в файрволе или привяжите её к приватному адресу. Если должна — обновляйте её и требуйте надёжную аутентификацию.',
    ),
  },
  xss: {
    en: e(
      "Cross-site scripting (XSS): text sent to the page is shown back without being made safe, so an attacker can make the page run their script in a visitor's browser.",
      'The script runs as the visitor: it can read what they see, act on their behalf, or steal their session.',
      "Encode user-supplied text for the place it is written into, use your framework's output encoding, and add a Content-Security-Policy as a second layer.",
    ),
    uz: e(
      "Cross-site scripting (XSS): sahifaga yuborilgan matn xavfsizlashtirilmasdan qaytarib ko'rsatiladi, shuning uchun hujumchi sahifani tashrif buyuruvchi brauzerida o'z skriptini bajarishga majbur qila oladi.",
      "Skript tashrif buyuruvchi nomidan ishlaydi: u ko'rgan narsani o'qishi, uning nomidan harakat qilishi yoki sessiyasini o'g'irlashi mumkin.",
      "Foydalanuvchi matnini yoziladigan joyga mos kodlang, frameworkning chiqishni kodlash vositasidan foydalaning va ikkinchi qatlam sifatida Content-Security-Policy qo'shing.",
    ),
    ru: e(
      'Межсайтовый скриптинг (XSS): отправленный на страницу текст выводится обратно без обезвреживания, поэтому злоумышленник может заставить страницу выполнить его скрипт в браузере посетителя.',
      'Скрипт выполняется от имени посетителя: он может читать то, что тот видит, действовать от его имени или украсть сессию.',
      'Кодируйте вводимый пользователем текст под место вывода, используйте кодирование вывода вашего фреймворка и добавьте Content-Security-Policy как второй уровень защиты.',
    ),
  },
  subdomain: {
    en: e(
      'A subdomain of this site was found in public data sources.',
      'Forgotten subdomains are a common way in: they can run old software, or point at a cloud service that no longer exists and can be taken over.',
      'Check that every subdomain is intended to be public, and delete DNS records for services you no longer run.',
    ),
    uz: e(
      "Ushbu saytning subdomeni ochiq ma'lumot manbalarida topildi.",
      "Unutilgan subdomenlar — keng tarqalgan kirish yo'li: ularda eski dastur ishlayotgan bo'lishi yoki endi mavjud bo'lmagan bulut xizmatiga ishora qilib, uni egallab olish mumkin bo'lishi mumkin.",
      "Har bir subdomen ochiq bo'lishi kerakligini tekshiring va endi ishlatmaydigan xizmatlar uchun DNS yozuvlarini o'chiring.",
    ),
    ru: e(
      'Поддомен этого сайта найден в открытых источниках.',
      'Забытые поддомены — частый путь проникновения: на них может работать старое ПО, или они указывают на облачную службу, которой больше нет, и её можно перехватить.',
      'Проверьте, что каждый поддомен должен быть публичным, и удалите DNS-записи для служб, которыми вы больше не пользуетесь.',
    ),
  },
  generic: {
    en: e(
      'The scanner reported a possible weakness on this page.',
      'Depending on the details it can make an attack easier. The severity label tells you how urgent it is.',
      'Follow the advice and the references for this finding, apply the fix, then run the scan again to check it is gone.',
    ),
    uz: e(
      "Skaner ushbu sahifada mumkin bo'lgan zaiflikni aniqladi.",
      "Tafsilotlarga qarab, u hujumni osonlashtirishi mumkin. Jiddiylik belgisi buning qanchalik shoshilinchligini ko'rsatadi.",
      "Ushbu topilma bo'yicha maslahat va havolalarga amal qiling, tuzatishni qo'llang va yo'qolganini tekshirish uchun skanerlashni qayta ishga tushiring.",
    ),
    ru: e(
      'Сканер обнаружил на этой странице возможную уязвимость.',
      'В зависимости от деталей она может облегчить атаку. Метка серьёзности показывает, насколько это срочно.',
      'Следуйте совету и ссылкам для этого результата, примените исправление и запустите сканирование снова, чтобы убедиться, что проблема исчезла.',
    ),
  },
};

export function classOfIssue(issueKey: string): keyof typeof CLASSES {
  if (/^header-/.test(issueKey)) return 'security-header';
  if (/^cookie-/.test(issueKey)) return 'cookie';
  if (/^cors-/.test(issueKey)) return 'cors';
  if (/^exposed-/.test(issueKey)) return 'exposed-file';
  if (/^tls-/.test(issueKey)) return 'tls';
  if (/^disclosure-/.test(issueKey)) return 'disclosure';
  if (/^(http-no-redirect|https-unavailable)/.test(issueKey))
    return 'http-redirect';
  if (/^open-port:/.test(issueKey)) return 'open-port';
  if (/^xss:/.test(issueKey)) return 'xss';
  if (/^subdomain:/.test(issueKey)) return 'subdomain';
  return 'generic';
}

export function staticExplanation(
  issueKey: string,
  language: ReportLanguage,
): StaticExplanation {
  return CLASSES[classOfIssue(issueKey)][language];
}

/// Opening sentence for "why it matters" that depends on severity only.
const SEVERITY_LEAD: Record<
  VulnFindingSeverity,
  Record<ReportLanguage, string>
> = {
  CRITICAL: {
    en: 'Critical: fix this first.',
    uz: 'Juda jiddiy: birinchi navbatda tuzating.',
    ru: 'Критично: исправьте в первую очередь.',
  },
  HIGH: {
    en: 'High: fix this soon.',
    uz: 'Yuqori: yaqin kunlarda tuzating.',
    ru: 'Высокий: исправьте в ближайшее время.',
  },
  MEDIUM: {
    en: 'Medium: plan to fix this.',
    uz: "O'rta: tuzatishni rejalashtiring.",
    ru: 'Средний: запланируйте исправление.',
  },
  LOW: {
    en: 'Low: worth fixing when convenient.',
    uz: "Past: qulay paytda tuzatish ma'qul.",
    ru: 'Низкий: стоит исправить, когда будет удобно.',
  },
  INFO: {
    en: 'Informational: no action may be needed.',
    uz: "Ma'lumot: harakat talab qilinmasligi mumkin.",
    ru: 'Информация: действий может не потребоваться.',
  },
};

export function severityLead(
  severity: VulnFindingSeverity,
  language: ReportLanguage,
): string {
  return SEVERITY_LEAD[severity][language];
}
