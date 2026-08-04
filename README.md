# Printmn Konica — React Native (Expo)

React + Vite дээр байсан 4,374 мөрийн нэг файлт вэб аппыг Expo SDK 57 дээрх
production түвшний React Native апп болгож хөрвүүлсэн хувилбар.

**Бизнес логик 1:1 хадгалагдсан.** Firebase-ийн `/pmn/*` бүтэц, тооцоолол,
эрхийн дүрэм, өгөгдлийн формат бүгд өмнөх хэвээрээ — тиймээс вэб хувилбар болон
энэ апп *нэг өгөгдөл дээр зэрэг* ажиллана.

---

## Эхлүүлэх

```bash
npm install
npx expo start
```

Хэрэв хамаарлын хувилбарт анхааруулга гарвал:

```bash
npx expo install --fix
npx expo-doctor@latest
```

Төхөөрөмж дээр:

```bash
npx expo run:android
npx expo run:ios
```

> `expo-secure-store`, `expo-notifications`, `expo-camera` зэрэг нь native модуль
> тул **Expo Go дээр бүрэн ажиллахгүй**. Development build (`expo run:*` эсвэл
> EAS Build) ашиглана уу.

---

## Технологи

| Давхарга | Сонголт |
|---|---|
| Framework | Expo SDK 57, React Native 0.86, React 19.2 |
| Хэл | TypeScript (`strict` + `noUncheckedIndexedAccess`) |
| Навигац | React Navigation 7 (bottom tabs + native stack) |
| UI | React Native Paper 5 (Material Design 3) |
| Анимаци | Reanimated 4.5, Gesture Handler 2.32 |
| Өгөгдөл | Firebase Realtime Database (REST) |
| Хадгалалт | AsyncStorage (кэш) + SecureStore (нууц) |
| Excel | `xlsx-js-style` (өнгө хадгалагдана) |
| PDF | `expo-print` (жинхэнэ вектор текст) |

---

## Архитектур

```
src/
├── authentication/   PIN нэвтрэлт, эрхийн матриц, сессийн context
├── navigation/       Root stack, role-аар шүүгдсэн tab bar
├── screens/          Дэлгэц бүр — зөвхөн render, логикгүй
├── components/       ui / layout / feedback дахин ашиглагдах компонент
├── features/         Цэвэр бизнес логик (UI-гүй, I/O-гүй)
├── hooks/            useToast, useResponsive, useDebouncedValue, useConfirmAction
├── services/         storage · network · export · media · notifications · sync
├── firebase/         RTDB client + Repository давхарга
├── utils/            date · price · result · logger
├── types/            Домэйн төрлүүд
├── constants/        Тохиргоо, seed каталог, emoji
└── theme/            MD3 light/dark, брэндийн өнгө
```

**Гол зарчим:** тооцоолол `features/*` дотор, гаднын харилцаа `services/*` дотор,
`screens/*` нь зөвхөн харуулна. Тиймээс урамшууллын томьёог дэлгэц нээхгүйгээр
тестлэх боломжтой.

### Өгөгдлийн урсгал

```
Screen → useData() → DataContext
                        ├── Repository → AsyncStorage   (шууд, offline)
                        └── Repository → writeQueue → RTDB (retry-тэй)
```

Вэб хувилбар `fetch(...).catch(() => {})` гэж бичсэн тул сүлжээ тасрахад
захиалга **чимээгүй алга болдог** байсан. Энд бичилт бүр дараалалд орж,
холболт сэргэмэгц автоматаар илгээгдэнэ.

---

## Web API → Native

| Өмнө (вэб) | Одоо (native) |
|---|---|
| `localStorage` | AsyncStorage / SecureStore |
| `window.XLSX` (CDN) | `xlsx-js-style` (bundled) |
| `html2canvas` + `jsPDF` | `expo-print` |
| `<input type="file">` | `expo-image-picker` / `expo-document-picker` |
| `link.click()` татах | `expo-file-system` + `expo-sharing` |
| `AudioContext` дуу | `expo-notifications` |
| `alert()` | Paper `Snackbar` (`useToast`) |
| `window.location.hash` | React Navigation route params |
| Tailwind classNames | `StyleSheet` + MD3 theme |

`window`, `document`, `localStorage` кодод **нэг ч удаа** үлдээгүй.

---

## Эрхийн систем

Вэб хувилбартай адил **3 role** (2 биш): `manager`, `ipad`, `worker`.
Бүх дүрэм `src/authentication/permissions.ts`-д нэг дор цугларсан.

| Боломж | manager | ipad | worker |
|---|:--:|:--:|:--:|
| Захиалга, ажлын бүртгэл | ✓ | ✓ | — |
| Тайлан, үзүүлэлт | ✓ | ✓ | — |
| Үнийн санал / нэхэмжлэх | ✓ | ✓ | — |
| Каталог засах | ✓ | ✓ | харах |
| Цаг & дадал бүртгэх | ✓ | ✓ | ✓ |
| Ажилтан удирдах | ✓ | — | — |

Эрхгүй дэлгэц нь зөвхөн нуугддаггүй — navigator-т **бүртгэгддэггүй**.

---

## Хадгалагдсан тооцоолол

Дараах томьёо бүр вэб хувилбартай яг ижил (52 тестээр баталгаажсан):

- **Хоцролт** — `arrival - startTime` минутаар; яг цагтаа ирвэл хоцроогүйд тооцно
- **Дадлын оноо** — цагтаа ирсэн бол `id: 4` ("Цагтаа ирэх") автоматаар тэмдэглэгдэнэ
- **Ажлын өдөр** — сарын хоног хасах тухайн ажилтны амрах гараг
- **Урамшуулал** — `round(min(оноо ÷ (ажлын өдөр × өдрийн макс), 1) × 100,000)`
- **Өдрийн орлого** — зөвхөн workLogs, НӨАТ-тай мөр `× 1.1`
- **Үнийн санал** — мөрүүдийн нийлбэр дээр 10% НӨАТ
- **м² тооцоо** — `round(өргөн × өндөр × суурь үнэ)`
- **Дуусаагүй ажил** — өмнөх өдрийн "Болсон"/"Болсон аваагүй" биш ажил маргааш дахин гарна
- **Түргэн захиалга** — `Order` + `WorkLog` **хоёуланг** үүсгэнэ (тайланд орохын тулд)

---

## Шинээр нэмэгдсэн

- **Offline mode** — кэшээс шууд уншиж, бичилтийг дараалалд хийнэ
- **Retry sync** — exponential backoff, холболт сэргэхэд автоматаар
- **PDF export** — вектор текст (өмнө нь зургаар дарагдсан)
- **Excel import** — барааны жагсаалтыг файлаас оруулах (нэрээр тааруулна)
- **Backup / Restore** — бүх өгөгдлийг нэг JSON файлаар
- **Low stock warning** — үлдэгдэл ≤ 5 бол сануулга
- **Notification** — шинэ захиалга, бага үлдэгдэл, чат
- **Dark mode** — систем дагах эсвэл гараар
- **Tablet layout** — 768px-с дээш өргөн grid, том gutter
- **Error boundary** — цагаан дэлгэц гарахгүй

---

## ⚠️ Аюулгүй байдлын анхааруулга

Вэб хувилбарын кодод **Telegram bot token ил бичээстэй** байсан
(`bot8726777257:AAETxpz...`). Сайтыг нээсэн хэн ч уншиж, дэлгүүрийн ботоор
мессеж илгээх боломжтой байсан.

**Энэ токеныг хуулаагүй.** `src/services/telegram/telegramService.ts` доторх
`TELEGRAM_BOT_TOKEN` хоосон байгаа — утга оруулах хүртэл мэдэгдэл илгээхгүй,
бусад бүх зүйл хэвийн ажиллана.

**Хийх зүйл:**
1. @BotFather дээр хуучин токеныг **устгах** (compromised гэж үзнэ үү)
2. Шинэ токеныг EAS secret эсвэл `.env`-ээр өгөх — кодод бүү бич

Мөн RTDB нь одоо ч **нээлттэй** (auth-гүй REST). URL мэдэх хэн ч бүх захиалга,
цалин, ажилтны PIN-г уншиж/бичиж чадна. Firebase Console → Rules хэсэгт
хамгаалалт тавихыг зөвлөж байна.

PIN кодууд одоо bundle дотор биш, **Keychain / Keystore**-д хадгалагдана
(Тохиргоо дэлгэцээс солих боломжтой).

---

## Мэдэж байх зүйлс

- **Чат нь төхөөрөмж бүрт тусдаа** — вэб хувилбарт ч ижил байсан, Firebase рүү
  явдаггүй. Зураг нь хэмжээ хэтрэхээс сэргийлж хадгалагдахгүй (session дотор л харагдана).
- **Менежерээр нэвтрэх** — логон дээр **удаан дарна**. Вэб дээрх `#manager`
  hash утсан дээр байхгүй тул ингэж сольсон.
- **Сессийн хадгалалт** — вэб хувилбар refresh бүрт дахин нэвтрүүлдэг байсан;
  утсан дээр өдөрт олон удаа нээдэг тул сесс хадгалагдана ("Гарах" дарвал арилна).
- **Сарын орлого НӨАТ-гүй** — өдрийн тайлан НӨАТ нэмдэг, сарын нэгтгэл нэмдэггүй.
  Энэ зөрүү вэб хувилбарт байсан тул санаатайгаар хэвээр үлдээв.

---

## Assets

`assets/` дотор `icon.png` (1024×1024), `adaptive-icon.png` (1024×1024),
`splash.png` нэмнэ үү. Байхгүй бол Expo анхдагчийг ашиглана.

---

## Чанарын шалгалт

```bash
npm run typecheck   # tsc --noEmit (strict) — 0 алдаа
npm run doctor      # expo-doctor
```
