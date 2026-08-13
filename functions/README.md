# Push мэдэгдэл — Cloud Functions

Апп хаалттай, утас түгжээтэй байхад ч мэдэгдэл ирүүлэх сервер тал.

Дөрвөн мэдэгдэл:

| Хэзээ | Хэнд | Суваг |
| --- | --- | --- |
| Шинэ захиалга бүртгэгдэхэд | Бүртгэсэн төхөөрөмжөөс бусад бүгдэд | `orders` |
| Чатад зурвас ирэхэд | Илгээгчээс бусад бүгдэд | `chat` |
| Барааны үлдэгдэл 5-аас доошлоход | Зөвхөн менежерт | `stock` |
| Ажлын хугацаа 30 мин дотор дөхөхөд | Бүгдэд | `deadline` |

---

## 1. Firebase Blaze төлөвлөгөө

Cloud Functions нь Blaze (pay-as-you-go) шаарддаг — карт холбоно.

[console.firebase.google.com](https://console.firebase.google.com) → төслөө сонго →
зүүн доод буланд **Upgrade** → **Blaze**.

Танай хэмжээнд (өдөрт хэдэн арван захиалга) **үнэгүй квотоос хэтрэхгүй** —
сард 2 сая дуудалт үнэгүй. Санаа амар байхын тулд Budget alert-ыг $1 дээр тавь.

## 2. Android-д FCM тохируулах

iOS-ын push түлхүүрийг EAS аль хэдийн үүсгэсэн. Android-д:

1. Firebase console → Project settings → **Your apps** → Android апп нэмэх,
   package name: `mn.printmn.konica`
2. `google-services.json` татаж аваад `printmn-expo/google-services.json` болгож хадгал
3. `app.json` дотор `expo.android` хэсэгт нэм:

   ```json
   "googleServicesFile": "./google-services.json"
   ```

4. Firebase console → Project settings → **Cloud Messaging** → Firebase Cloud
   Messaging API (V1) хэсгээс **Manage Service Accounts** → JSON түлхүүр үүсгэ
5. Түүнийгээ EAS-д өг:

   ```bash
   npx eas-cli@latest credentials -p android
   # → Google Service Account → FCM V1 → Set up
   ```

6. Android build дахин хийнэ (`--platform android`). iOS-д дахин build хэрэггүй,
   push эрх нь сүүлийн build дээр аль хэдийн орсон.

## 3. Deploy

```bash
cd printmn-expo
npm --prefix functions install
npx firebase-tools@latest login
npx firebase-tools@latest use printmn-c0d28
npx firebase-tools@latest deploy --only functions,database
```

`database` нь `/pmn/devices` зангилааны шинэ дүрмийг ачаална — үүнгүйгээр апп
push token-оо бичиж чадахгүй.

## 4. Шалгах

```bash
npm --prefix functions test          # 27 тест, сервер шаардахгүй
npx firebase-tools@latest functions:log
```

Бодит шалгалт: нэг төхөөрөмж дээр захиалга бүртгэ, нөгөө төхөөрөмжийн аппыг
**бүрэн хаа** (санах ойноос гарга). Мэдэгдэл ирэх ёстой. Ирэхгүй бол:

1. `/pmn/devices` дотор тухайн төхөөрөмжийн token байгаа эсэх — байхгүй бол апп
   мэдэгдлийн эрх аваагүй, эсвэл дүрэм deploy хийгдээгүй.
2. `functions:log` дотор алдаа байгаа эсэх.
3. Android дээр FCM тохируулгагүй build ажиллаж байгаа эсэх.

---

## Файлын бүтэц

| Файл | Үүрэг |
| --- | --- |
| `src/messages.ts` | Мэдэгдлийн текст, хэн юунд багтахыг шийдэх дүрмүүд. Цэвэр функцууд. |
| `src/push.ts` | Expo-ийн push API руу илгээх, хэнд илгээхийг шүүх. Firebase-ээс хамааралгүй. |
| `src/notify.ts` | Төхөөрөмжийн жагсаалтыг уншиж, илгээж, үхсэн token-уудыг устгах. |
| `src/index.ts` | Дөрвөн trigger. |
| `src/messages.test.ts` | 27 тест — `node --test`, emulator шаардахгүй. |

## Санаж байх зүйлс

- **Өөрийн үйлдэлд мэдэгдэл ирэхгүй.** Захиалга бүртгэсэн төхөөрөмжийн `deviceId`
  бичлэг дээр үлддэг, функц түүнийг алгасдаг.
- **Барааны мэдэгдэл зөвхөн ирмэг дээр.** Үлдэгдэл 6→4 болоход мэдэгдэнэ, 4→3
  болоход мэдэгдэхгүй. Эс тэгвээс нэг хайрцаг цаасны тухай минут тутам сануулна.
- **Хоцорсон ажилд сануулахгүй.** Зөвхөн урд нь байгаа 30 минутыг хардаг.
- **Апп нээлттэй үед push дуугарахгүй** — тухайн үед аппын өөрийн мэдэгдэл аль
  хэдийн ажилласан байдаг тул давхардахгүй.
- **60 хоног холбогдоогүй төхөөрөмж** жагсаалтаас автоматаар унана.
