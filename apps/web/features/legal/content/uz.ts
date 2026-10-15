// DRAFT: requires review by a qualified Uzbekistan lawyer before launch.
// Uzbek translation of en.ts — keep the section structure identical. The
// English text is the working source; "LEGAL REVIEW" markers match it.
import { LEGAL_CONTACT } from "@pentesthub/shared";
import type { LegalCatalog } from "./types";

const S = LEGAL_CONTACT.support;
const SEC = LEGAL_CONTACT.security;

export const uz: LegalCatalog = {
  terms: {
    title: "Foydalanish shartlari",
    intro:
      "Ushbu Shartlar O'zbekiston Respublikasidan boshqariladigan Secora AI xizmatidan (\"Xizmat\") foydalanishni tartibga soladi. Hisob yaratish yoki Xizmatdan foydalanish orqali siz ushbu Shartlarga, Maqbul foydalanish siyosatiga va Maxfiylik siyosatiga rozilik bildirasiz.",
    sections: [
      {
        heading: "1. Faqat ruxsat etilgan xavfsizlik testlari",
        paragraphs: [
          "Xizmat ruxsat etilgan xavfsizlik testlari uchun vositadir. Undan faqat o'zingizga tegishli aktivlarga yoki egasidan aniq, yozma va amaldagi ruxsatingiz bo'lgan aktivlarga nisbatan foydalanishingiz mumkin — masalan, imzolangan shartnoma, imzolangan Test o'tkazish qoidalari (ROE) yoki bug bounty dasturining e'lon qilingan qamrovi va safe harbor shartlari.",
          "Siz ruxsat etilgan qamrov, vaqt oralig'i va test usullari doirasida qolishingiz shart. ROE yoki dastur qamrovidan tashqaridagi har qanday faoliyat taqiqlanadi.",
        ],
      },
      {
        heading: "2. Sizning javobgarligingiz",
        paragraphs: [
          "Agar siz ruxsatsiz yoki kelishilgan ROE yoki qamrovdan tashqarida test o'tkazsangiz, buni to'liq o'z tavakkalingizga ko'ra qilasiz va harakatlaringiz uchun to'liq yuridik javobgarlikni — fuqarolik, ma'muriy va jinoiy javobgarlikni — o'z zimmangizga olasiz.",
          "Xizmat faqat vositalarni taqdim etadi. U sizning nomingizdan ruxsatingizni tekshirmaydi (tekshirish funksiyasi aniq yoqilgan holatlar bundan mustasno) va biz undan qanday foydalanishingiz uchun javobgar emasmiz. Siz o'zingiz joylashgan mamlakat va nishonlaringiz joylashgan mamlakatlar qonunlariga rioya qilish uchun javobgarsiz.",
        ],
      },
      {
        heading: "3. Hisoblar",
        paragraphs: [
          "Siz to'g'ri ma'lumot berishingiz, kirish ma'lumotlaringizni xavfsiz saqlashingiz va hisobingizdan ruxsatsiz foydalanish haqida bizga darhol xabar berishingiz shart. Hisobingiz orqali amalga oshirilgan barcha harakatlar, jumladan siz ishchi maydoningizga taklif qilgan a'zolar va API kalitlaringiz orqali bajarilgan harakatlar uchun siz javobgarsiz.",
        ],
      },
      {
        heading: "4. Biz saqlaydigan yozuvlar",
        paragraphs: [
          "Xizmatni himoya qilish va suiiste'mollarni tekshirish uchun biz audit yozuvlarini saqlaymiz, jumladan ushbu Shartlarni qachon va qaysi IP manzildan qabul qilganingiz, har bir nishon uchun bildirgan ruxsatingiz va skanerlashlar qachon boshlangani. Batafsil ma'lumot Maxfiylik siyosatida.",
        ],
      },
      {
        heading: "5. To'xtatish va bekor qilish",
        paragraphs: [
          "Ushbu Shartlar yoki Maqbul foydalanish siyosati buzilgan deb asosli hisoblasak yoki qonun talab qilsa, biz hisoblarni to'xtatishimiz yoki bekor qilishimiz, skanerlash yoki nishonlarni bloklashimiz va kontentni o'chirishimiz mumkin. Biz vakolatli organlarning qonuniy so'rovlari bilan hamkorlik qilishimiz va ularga tegishli yozuvlarni taqdim etishimiz mumkin.",
        ],
      },
      {
        heading: "6. Uchinchi tomon xizmatlari",
        paragraphs: [
          "Ayrim funksiyalar siz tanlagan uchinchi tomon xizmatlaridan foydalanadi, masalan Google yoki GitHub orqali kirish yoki o'z API kalitingiz bilan ulagan AI provayder. Bu xizmatlardan foydalanish ularning o'z shartlari bilan tartibga solinadi.",
        ],
      },
      {
        heading: "7. Kafolatlardan voz kechish va javobgarlikni cheklash",
        paragraphs: [
          "Xizmat \"boricha\" va \"mavjud bo'lganicha\" taqdim etiladi, hech qanday kafolatlarsiz. Skanerlash natijalari to'liq bo'lmasligi yoki noto'g'ri bo'lishi mumkin va tekshirilishi kerak.",
          "Qonun ruxsat bergan maksimal darajada biz bilvosita, tasodifiy yoki oqibatdagi zararlar, ma'lumotlar, foyda yoki biznesning yo'qolishi, shuningdek Xizmatdan har qanday tizimga nisbatan foydalanishingiz natijasida yetkazilgan zarar uchun javobgar emasmiz. Har qanday da'vo bo'yicha umumiy javobgarligimiz da'vodan oldingi 12 oy ichida Xizmat uchun bizga to'lagan summangiz bilan cheklanadi. (LEGAL REVIEW)",
        ],
      },
      {
        heading: "8. Zararni qoplash",
        paragraphs: [
          "Siz Xizmatdan foydalanishingiz, test faoliyatingiz yoki ushbu Shartlar yoxud qonunni buzishingiz natijasida yuzaga keladigan har qanday da'volar, zararlar, jarimalar va xarajatlardan (jumladan oqilona yuridik xarajatlar) Secora AI va uning operatorlarini himoya qilishga va zararni qoplashga rozilik bildirasiz. (LEGAL REVIEW)",
        ],
      },
      {
        heading: "9. O'zgarishlar",
        paragraphs: [
          "Biz ushbu Shartlarni yangilashimiz mumkin. Muhim o'zgarish kiritilganda versiya raqami o'zgaradi va Xizmatdan foydalanishni davom ettirishdan oldin yangi versiyani ko'rib chiqib, qabul qilishingiz so'raladi.",
        ],
      },
      {
        heading: "10. Amaldagi qonun",
        paragraphs: [
          "Ushbu Shartlar O'zbekiston Respublikasi qonunlari bilan tartibga solinadi va nizolar, agar siz yashaydigan joyning majburiy qonunlarida boshqacha nazarda tutilmagan bo'lsa, O'zbekiston Respublikasining vakolatli sudlarida ko'rib chiqiladi. (LEGAL REVIEW)",
        ],
      },
      {
        heading: "11. Aloqa",
        paragraphs: [`Shartlar bo'yicha savollar: ${S}. Xizmatdagi xavfsizlik zaifliklari: ${SEC}.`],
      },
    ],
  },
  aup: {
    title: "Maqbul foydalanish siyosati va Test o'tkazish qoidalari",
    intro:
      "Ushbu siyosat Secora AI bilan nima qilish mumkin va nima mumkin emasligini tushuntiradi. U Foydalanish shartlarining bir qismidir. Biror narsa noaniq bo'lsa, test o'tkazishdan oldin so'rang.",
    sections: [
      {
        heading: "1. Avval ruxsat",
        paragraphs: [
          "Faqat o'zingizga tegishli yoki egasidan aniq, yozma va amaldagi ruxsatingiz bo'lgan aktivlarni test qiling (shartnoma, imzolangan ROE yoki bug bounty dasturining e'lon qilingan qamrovi va safe harbor shartlari). Xizmatda har bir nishon uchun ruxsatingiz asosini qayd eting va uni dolzarb holda saqlang.",
        ],
      },
      {
        heading: "2. Test o'tkazish qoidalari (ROE)",
        list: [
          "Ruxsat etilgan aktivlar, vaqt oralig'i va usullar doirasida qoling.",
          "Biror narsa qamrovga kirishiga ishonchingiz komil bo'lmasa, to'xtang va egasidan so'rang.",
          "Zarur minimal intensivlikdan foydalaning; nishonning ishlashiga zarar yetkazmang.",
          "Muammoni ko'rsatish uchun zarur bo'lgan minimal isbot (proof of concept) bilan cheklaning.",
          "Topilmalar haqida faqat egasiga yoki dasturning rasmiy kanali orqali xabar bering.",
        ],
      },
      {
        heading: "3. Taqiqlangan harakatlar",
        list: [
          "Tizimlar yoki ma'lumotlarga ruxsatsiz kirish.",
          "Aniq yozma ruxsatsiz xizmat ko'rsatishni rad etish (DoS), yuklama yoki stress testlari.",
          "Minimal isbotdan ortiq ma'lumotlarni olib chiqish, o'zgartirish yoki o'chirish.",
          "Bunga rozilik bermagan odamlarga nisbatan ijtimoiy muhandislik yoki fishing.",
          "Mas'ul organning yozma ruxsatisiz muhim infratuzilma, davlat yoki harbiy tizimlarni nishonga olish.",
          "Nishon shunchaki foydalanadigan uchinchi tomon xizmatlarini (to'lov, pochta, bulut yoki SaaS provayderlari) ularning o'z ruxsatisiz test qilish.",
          "Xizmatdan tovlamachilik, ransomware, zararli dastur, spam uchun yoki Xizmatning o'ziga hujum qilish uchun foydalanish.",
          "Hisobingizni boshqalarga berish yoki Xizmatga kirish huquqini qayta sotish.",
        ],
      },
      {
        heading: "4. O'rnatilgan himoya choralari",
        paragraphs: [
          "Faol skanerlash uchun nishonda amal qiluvchi, muddati o'tmagan ruxsat bo'lishi shart. Xizmat xususiy yoki ichki tarmoq diapazonlari, localhost va bulut metadata manzillarini faol skanerlamaydi hamda sukut bo'yicha ayrim davlat va harbiy domenlarni rad etadi. Bunday aktivni test qilishi kerak bo'lgan egalar biz bilan bog'lanishi mumkin. Bu choralar xatolarni kamaytiradi, lekin sizning ruxsatingiz o'rnini bosmaydi.",
        ],
      },
      {
        heading: "5. Agar biror narsa noto'g'ri ketsa",
        paragraphs: [
          "Agar tasodifan shaxsiy yoki maxfiy ma'lumotlarga kirib qolsangiz, to'xtang, nusxasini saqlamang va egasiga xabar bering. Agar ishlamay qolishga sabab bo'lsangiz, testni to'xtating va darhol egasi bilan bog'laning.",
        ],
      },
      {
        heading: "6. Choralar ko'rish",
        paragraphs: [
          "Qoidabuzarliklar skanerlashlarning bloklanishiga, hisobingizning to'xtatilishi yoki bekor qilinishiga, zarur yoki o'rinli hollarda esa vakolatli organlarga xabar berilishiga olib kelishi mumkin. Suiiste'mollarni tekshirish uchun biz audit yozuvlarini saqlaymiz.",
        ],
      },
      {
        heading: "7. Suiiste'mol haqida xabar berish",
        paragraphs: [`Xizmatdan suiiste'mol qilinishi haqida xabar berish uchun ${S} manziliga yozing.`],
      },
    ],
  },
  privacy: {
    title: "Maxfiylik siyosati",
    intro:
      "Ushbu siyosat Secora AI qanday shaxsiy ma'lumotlarni qayta ishlashini, nima uchun va sizning qanday huquqlaringiz borligini tushuntiradi. (LEGAL REVIEW: O'zbekiston Respublikasining \"Shaxsga doir ma'lumotlar to'g'risida\"gi qonuni va ma'lumotlarni mahalliylashtirish talablariga muvofiqligini tasdiqlash.)",
    sections: [
      {
        heading: "1. Biz yig'adigan ma'lumotlar",
        list: [
          "Hisob ma'lumotlari: ism, email manzil, parol xeshi, kirish provayderi (Google yoki GitHub) identifikatorlari, MFA sozlamalari.",
          "Ishchi maydon ma'lumotlari: loyihalar, nishonlar, eslatmalar, dalillar, topilmalar, hisobotlar va jamoa a'zoligi.",
          "Skanerlash ma'lumotlari: siz ishga tushirgan razvedka va zaiflik skanerlashlari natijalari.",
          "Xavfsizlik va audit yozuvlari: kirishlar, IP manzillar, user agent, huquqiy hujjatlarni qabul qilish, nishonlar uchun ruxsat deklaratsiyalari va skanerlash boshlanishlari.",
          "Xizmatni ishlatish uchun zarur texnik ma'lumotlar, masalan loglar va xato hisobotlari.",
        ],
      },
      {
        heading: "2. Nima uchun foydalanamiz",
        list: [
          "Xizmatni va hisobingizni taqdim etish va himoya qilish uchun.",
          "Shartlar va Maqbul foydalanish siyosatiga rioya qilinishini ta'minlash va suiiste'mollarni tekshirish uchun.",
          "Qonuniy majburiyatlar va vakolatli organlarning qonuniy so'rovlarini bajarish uchun.",
          "Hisobingiz va muhim o'zgarishlar haqida siz bilan bog'lanish uchun.",
        ],
      },
      {
        heading: "3. Qayta ishlovchilar va uchinchi tomonlar",
        paragraphs: [
          "Xizmatni ishlatish uchun biz infratuzilma va xizmat provayderlaridan foydalanamiz. Google yoki GitHub orqali kirganingizda, kirishni o'sha provayderlar qayta ishlaydi. O'z API kalitingiz bilan Cloud yoki Hybrid AI rejimini yoqsangiz, AI yordamchiga yuborgan kontentingiz siz tanlagan AI provayder (masalan OpenAI, Anthropic, Google yoki OpenRouter) tomonidan uning shartlariga ko'ra qayta ishlanadi. Local rejimda AI so'rovlari faqat siz joylashtirgan modelga yuboriladi.",
          "Biz shaxsiy ma'lumotlaringizni sotmaymiz.",
        ],
      },
      {
        heading: "4. Ma'lumotlar qayerda saqlanadi",
        paragraphs: [
          "Xizmat ma'lumotlari hosting provayderimiz tomonidan Secora AI uchun boshqariladigan serverlarda saqlanadi. Uchinchi tomon AI provayderlariga yuborgan ma'lumotlaringiz boshqa mamlakatlarda qayta ishlanishi mumkin. (LEGAL REVIEW: hosting hududini va transchegaraviy uzatishning huquqiy asosini ko'rsatish.)",
        ],
      },
      {
        heading: "5. Saqlash muddati",
        paragraphs: [
          "Hisobingiz faol bo'lgan davrda hisob va ishchi maydon ma'lumotlarini saqlaymiz. Hisobingizni o'chirganingizda, ma'lumotlaringizni oqilona muddat ichida o'chiramiz yoki anonimlashtiramiz. Bundan audit yozuvlari (huquqiy hujjatlarni qabul qilish, nishonlar uchun ruxsatlar, skanerlash boshlanishlari) mustasno: ular suiiste'mollarni tekshirish va qonuniy majburiyatlarni bajarish uchun zarur muddat davomida saqlanadi. (LEGAL REVIEW: aniq saqlash muddatlarini belgilash.)",
        ],
      },
      {
        heading: "6. Sizning huquqlaringiz",
        paragraphs: [
          `Siz shaxsiy ma'lumotlaringizga kirish, ularni tuzatish, eksport qilish yoki o'chirishni so'rashingiz mumkin. Ma'lumotlarni eksport qilish va hisobni o'chirish API orqali mavjud yoki ${S} manziliga yozing. So'rovni bajarishdan oldin shaxsingizni tasdiqlashimiz kerak bo'lishi mumkin.`,
        ],
      },
      {
        heading: "7. Xavfsizlik",
        paragraphs: [
          `Biz ma'lumotlarni uzatishda shifrlash, API kalitlar kabi maxfiy ma'lumotlarni saqlashda shifrlash, kirishni boshqarish va audit loglari bilan himoya qilamiz. Zaifliklar haqida ${SEC} manziliga xabar bering.`,
        ],
      },
      {
        heading: "8. Aloqa",
        paragraphs: [`Maxfiylik bo'yicha savollar va so'rovlar: ${S}.`],
      },
    ],
  },
  security: {
    title: "Zaifliklarni oshkor qilish siyosati",
    intro:
      "Biz xavfsizlik tadqiqotchilarining xabarlarini mamnuniyat bilan qabul qilamiz. Ushbu siyosat Secora AI dagi zaiflik haqida qanday xabar berish va bizdan nima kutish mumkinligini tushuntiradi.",
    sections: [
      {
        heading: "Qanday xabar berish kerak",
        paragraphs: [
          `${SEC} manziliga yozing yoki GitHub repozitoriyamizdagi "Report a vulnerability" (yopiq advisory) funksiyasidan foydalaning. Iltimos, ochiq issue yaratmang. Ta'sirlangan URL yoki komponent, takrorlash qadamlari, ta'siri va mavjud bo'lsa isbotni ilova qiling. Mashina o'qiy oladigan aloqa ma'lumotlarimiz /.well-known/security.txt manzilida e'lon qilingan.`,
        ],
      },
      {
        heading: "Bizning majburiyatlarimiz",
        list: [
          "Xabaringizni 5 ish kuni ichida qabul qilganimizni tasdiqlaymiz.",
          "Muammoni tekshirish va tuzatish jarayonida sizni xabardor qilib boramiz.",
          "Tuzatish tayyor bo'lgach, ommaviy oshkor qilishni siz bilan kelishamiz.",
          "Xohlasangiz, advisory'da sizni muallif sifatida ko'rsatamiz.",
        ],
      },
      {
        heading: "Platformamizni test qilish qoidalari",
        list: [
          "Faqat o'z hisoblaringiz va ma'lumotlaringizdan foydalaning.",
          "Xodimlarimiz yoki foydalanuvchilarimizga nisbatan DoS, spam yoki ijtimoiy muhandislik qo'llamang.",
          "Boshqa foydalanuvchilarning ma'lumotlariga kirmang, ularni o'zgartirmang yoki o'chirmang. Ta'sirni ko'rsata olishingiz bilan to'xtang.",
          "Ommaviy oshkor qilishdan oldin bizga muammoni tuzatish uchun oqilona vaqt bering.",
        ],
      },
      {
        heading: "Safe harbor",
        paragraphs: [
          "Agar siz vijdonan harakat qilsangiz va ushbu siyosatga rioya qilsangiz, tadqiqotingizni ruxsat etilgan deb hisoblaymiz va shu sababli sizga qarshi sudga murojaat qilmaymiz. (LEGAL REVIEW)",
        ],
      },
      {
        heading: "Qamrovdan tashqari",
        list: [
          "Ta'siri ko'rsatilmagan avtomatik skaner natijalari.",
          "Aniq ekspluatatsiyasiz eng yaxshi amaliyot sarlavhalari yoki sozlamalarining yo'qligi.",
          "Biz foydalanadigan uchinchi tomon xizmatlaridagi muammolar — ular haqida o'sha yetkazib beruvchilarga xabar bering.",
        ],
      },
    ],
  },
};
