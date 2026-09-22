import type { CalcType, ColorLabel, HabitTask, InventoryItem, ServiceItem, TimeSettings } from '@/types';

/**
 * Seed data imported verbatim from the original web build.
 *
 * These values are only used the first time the app runs on a device and finds
 * neither a cached copy nor a remote copy. Prices stay as display strings
 * (e.g. `'8,500\u20ae'`) because that is exactly how Firebase stores them.
 */

export const INVENTORY_DEFAULT: readonly InventoryItem[] = [
    { id: 1, name: 'Жааз А5', price: '8,500₮', stock: '0', image: null, category: 'Жааз' },
    { id: 2, name: 'Жааз А4 /нарийн/', price: '8,500₮', stock: '0', image: null, category: 'Жааз' },
    { id: 3, name: 'Жааз А4 /хээтэй/', price: '10,000₮', stock: '1', image: null, category: 'Жааз' },
    { id: 4, name: 'Жааз А3', price: '22,000₮', stock: '0', image: null, category: 'Жааз' },
    { id: 5, name: 'Жааз 60х40', price: '35,000₮', stock: '0', image: null, category: 'Жааз' },
    { id: 6, name: 'Жааз 60х80', price: '75,000₮', stock: '0', image: null, category: 'Жааз' },
    { id: 7, name: 'Бичгийн цаас А4', price: '17,000₮', stock: '0', image: null, category: 'Цаас' },
    { id: 8, name: 'Бичгийн цаас А3', price: '35,000₮', stock: '0', image: null, category: 'Цаас' },
    { id: 9, name: 'Фото цаас А4 157гр (2 талтай)', price: '10,000₮', stock: '2', image: null, category: 'Цаас' },
    { id: 10, name: 'Фото цаас А4 200гр (2 талтай)', price: '11,000₮', stock: '15', image: null, category: 'Цаас' },
    { id: 11, name: 'Фото цаас А4 300гр (2 талтай)', price: '12,000₮', stock: '22', image: null, category: 'Цаас' },
    { id: 12, name: 'Фото цаас А3 (2 талтай)', price: '19,000₮', stock: '2', image: null, category: 'Цаас' },
    { id: 13, name: 'Фото шар А4', price: '5,500₮', stock: '2', image: null, category: 'Цаас' },
    { id: 41, name: 'Фото цаас 10x15', price: '1,000₮', stock: '0', image: null, category: 'Цаас' },
    { id: 42, name: 'Фото цаас 16x22', price: '2,500₮', stock: '0', image: null, category: 'Цаас' },
    { id: 14, name: 'Цагаан аяга', price: '2,200₮', stock: '0', image: null, category: 'Бусад' },
    { id: 15, name: 'Стикер цаас А4 гялгар', price: '11,000₮', stock: '0', image: null, category: 'Цаас' },
    { id: 16, name: 'Ламинатор А4', price: '27,000₮', stock: '0', image: null, category: 'Ламинатор' },
    { id: 17, name: 'Ламинатор А3', price: '42,000₮', stock: '0', image: null, category: 'Ламинатор' },
    { id: 18, name: 'Өргөмжлөл модон А4', price: '12,000₮', stock: '0', image: null, category: 'Өргөмжлөл' },
    { id: 19, name: 'Мандат гэр оосортой (Саарал/Шар)', price: '2,500₮', stock: '200', image: null, category: 'Мандат' },
    { id: 20, name: 'Мандат гэр өнгөгүй', price: '1,500₮', stock: '170', image: null, category: 'Мандат' },
    { id: 21, name: 'Энгэрийн тууз (Цагаан/Цэнхэр)', price: '1,500₮', stock: '5', image: null, category: 'Тууз' },
    { id: 22, name: 'Медаль Шилэн', price: '3,500₮', stock: '90', image: null, category: 'Медаль' },
    { id: 23, name: 'Медаль Төмөр (Сагс/Волейбол)', price: '3,000₮', stock: '121', image: null, category: 'Медаль' },
    { id: 24, name: 'Улаан хавтас А4', price: '10,000₮', stock: '0', image: null, category: 'Хавтас' },
    { id: 25, name: 'Улаан цэнхэр хавтас А4', price: '12,000₮', stock: '0', image: null, category: 'Хавтас' },
    { id: 26, name: 'Усны сав Балтай', price: '25,000₮', stock: '57', image: null, category: 'Бусад' },
    { id: 27, name: 'Бал Тосон хар', price: '1,500₮', stock: '500', image: null, category: 'Бусад' },
    { id: 28, name: 'Тэмдэглэлийн дэвтэр', price: '7,500₮', stock: '36', image: null, category: 'Бусад' },
    { id: 29, name: 'Альбом 800 зураг', price: '80,000₮', stock: '9', image: null, category: 'Альбом' },
    { id: 30, name: 'Альбом 500 зураг', price: '50,000₮', stock: '17', image: null, category: 'Альбом' },
    { id: 31, name: 'Альбом 200 зураг (Арьсан)', price: '32,000₮', stock: '39', image: null, category: 'Альбом' },
    { id: 32, name: 'Альбом 200 зураг (Цэцэгтэй)', price: '27,000₮', stock: '34', image: null, category: 'Альбом' },
    { id: 33, name: 'Альбом 100 зураг', price: '13,000₮', stock: '53', image: null, category: 'Альбом' },
    { id: 34, name: 'Альбом 40 зураг', price: '5,000₮', stock: '43', image: null, category: 'Альбом' },
    { id: 35, name: 'Усны сав, дэвтэр, балны ком', price: '42,000₮', stock: '64', image: null, category: 'Бусад' },
    { id: 36, name: 'Урилга том', price: '1,500₮', stock: '0', image: null, category: 'Урилга' },
    { id: 37, name: 'Урилга жижиг', price: '1,000₮', stock: '0', image: null, category: 'Урилга' },
    { id: 38, name: 'Номын тавиур 1 үетэй', price: '70,000₮', stock: '0', image: null, category: 'Бусад' },
    { id: 39, name: 'Номын тавиур 2 үетэй', price: '85,000₮', stock: '0', image: null, category: 'Бусад' },
    { id: 40, name: 'Хамбан хавтас А4', price: '10,000₮', stock: '0', image: null, category: 'Хавтас' }
];

export const SERVICES_DEFAULT: readonly ServiceItem[] = [
    { id: 101, name: 'Зураг угаалт 6*9 - 2%', price: '1,000₮', category: 'Угаалт', image: null },
    { id: 102, name: 'Зураг угаалт 9*12', price: '500₮', category: 'Угаалт', image: null },
    { id: 103, name: 'Зураг угаалт 10*15', price: '500₮', category: 'Угаалт', image: null },
    { id: 104, name: 'Зураг угаалт 13*18', price: '1,000₮', category: 'Угаалт', image: null },
    { id: 105, name: 'Зураг угаалт 16*22', price: '1,500₮', category: 'Угаалт', image: null },
    { id: 106, name: 'Зураг угаалт 20*25', price: '4,000₮', category: 'Угаалт', image: null },
    { id: 107, name: 'Зураг угаалт 20*30', price: '5,000₮', category: 'Угаалт', image: null },
    { id: 108, name: 'Зураг угаалт 30*40', price: '18,000₮', category: 'Угаалт', image: null },
    { id: 109, name: 'Зураг угаалт 60*40-50*40', price: '45,000₮', category: 'Угаалт', image: null },
    { id: 110, name: 'Зураг угаалт 60*80', price: '80,000₮', category: 'Угаалт', image: null },
    { id: 111, name: 'Зураг угаалт 50*70', price: '55,000₮', category: 'Угаалт', image: null },
    { id: 112, name: 'Зураг угаалт 50*100', price: '95,000₮', category: 'Угаалт', image: null },
    { id: 201, name: 'Засвартай зураг 9*12', price: '13,000₮', category: 'Засвар', image: null },
    { id: 202, name: 'Засвартай зураг 10*15', price: '13,000₮', category: 'Засвар', image: null },
    { id: 203, name: 'Засвартай зураг 13*18', price: '18,000₮', category: 'Засвар', image: null },
    { id: 204, name: 'Засвартай зураг 16*22', price: '20,000₮', category: 'Засвар', image: null },
    { id: 205, name: 'Засвартай зураг 20*25', price: '25,000₮', category: 'Засвар', image: null },
    { id: 206, name: 'Засвартай зураг 20*30', price: '28,000₮', category: 'Засвар', image: null },
    { id: 207, name: 'Засвартай зураг 30*40', price: '45,000₮', category: 'Засвар', image: null },
    { id: 301, name: 'Зураг скан/хувилах 10-15 (1ш)', price: '1,000₮', category: 'Хувилах/Скан', image: null },
    { id: 302, name: 'Зураг скан/хувилах 13-18 (1ш)', price: '2,000₮', category: 'Хувилах/Скан', image: null },
    { id: 303, name: 'Зураг скан/хувилах 16-22 (15-20)', price: '3,500₮', category: 'Хувилах/Скан', image: null },
    { id: 304, name: 'Зураг скан/хувилах 20-25', price: '6,000₮', category: 'Хувилах/Скан', image: null },
    { id: 305, name: 'Зураг скан/хувилах 20-30', price: '8,000₮', category: 'Хувилах/Скан', image: null },
    { id: 306, name: 'Зураг скан/хувилах 30-40', price: '30,000₮', category: 'Хувилах/Скан', image: null },
    { id: 401, name: 'Цээж зураг 3*4', price: '4,000₮', category: 'Цээж зураг', image: null },
    { id: 402, name: 'Цээж зураг 3.5*4.5', price: '5,000₮', category: 'Цээж зураг', image: null },
    { id: 403, name: 'Цээж зураг 4*6', price: '5,000₮', category: 'Цээж зураг', image: null },
    { id: 404, name: 'Гадаад пасспорт файл 3.5*4.5', price: '6,000₮', category: 'Цээж зураг', image: null },
    { id: 405, name: 'Файлаар зураг авах', price: '2,000₮', category: 'Цээж зураг', image: null },
    { id: 406, name: 'Самбарын зураг 6*9', price: '9,000₮', category: 'Цээж зураг', image: null },
    { id: 407, name: 'Самбарын зураг 9*12', price: '13,000₮', category: 'Цээж зураг', image: null },
    { id: 501, name: 'Өнгөт канон А4', price: '1,000₮', category: 'Канон', image: null },
    { id: 502, name: 'Өнгөт канон А4 (30 дотор)', price: '700₮', category: 'Канон', image: null },
    { id: 503, name: 'Өнгөт канон А4 (31 дээш)', price: '500₮', category: 'Канон', image: null },
    { id: 504, name: 'Хар канон 1 талдаа', price: '300₮', category: 'Канон', image: null },
    { id: 505, name: 'Хар канон 2 талдаа', price: '600₮', category: 'Канон', image: null },
    { id: 506, name: 'Бичиг баримт канон', price: '500₮', category: 'Канон', image: null },
    { id: 601, name: 'Хэвлэл: Фото цаас А4 200гр', price: '2,500₮', category: 'Хэвлэл', image: null },
    { id: 602, name: 'Хэвлэл: Фото цаас А4 200гр (10ш дээш)', price: '2,000₮', category: 'Хэвлэл', image: null },
    { id: 603, name: 'Хэвлэл: Фото цаас А3 200гр', price: '8,000₮', category: 'Хэвлэл', image: null },
    { id: 701, name: 'Медаль төмөр олон', price: '1,200₮', category: 'Медаль & Цом', image: null },
    { id: 702, name: 'Медаль шилэн (10 дотор)', price: '2,500₮', category: 'Медаль & Цом', image: null },
    { id: 703, name: 'Медаль шилэн олон', price: '1,500₮', category: 'Медаль & Цом', image: null },
    { id: 704, name: 'Медаль оосор (30 доош)', price: '3,500₮', category: 'Медаль & Цом', image: null },
    { id: 705, name: 'Медаль оосор (31 дээш)', price: '2,500₮', category: 'Медаль & Цом', image: null },
    { id: 706, name: 'Медаль оосор логотой', price: '3,500₮', category: 'Медаль & Цом', image: null },
    { id: 707, name: 'Цом', price: '5,000₮', category: 'Медаль & Цом', image: null },
    { id: 801, name: 'Өргөмжлөл цаасан А4', price: '5,000₮', category: 'Өргөмжлөл', image: null },
    { id: 802, name: 'Өргөмжлөл цаасан А4 (10ш дээш)', price: '3,500₮', category: 'Өргөмжлөл', image: null },
    { id: 803, name: 'Өргөмжлөл цаасан А4 (20ш дээш)', price: '3,000₮', category: 'Өргөмжлөл', image: null },
    { id: 804, name: 'Өргөмжлөл А5', price: '2,500₮', category: 'Өргөмжлөл', image: null },
    { id: 805, name: 'Өргөмжлөл А5 (10ш дээш)', price: '1,700₮', category: 'Өргөмжлөл', image: null },
    { id: 806, name: 'Өргөмжлөл модон А4', price: '27,000₮', category: 'Өргөмжлөл', image: null },
    { id: 807, name: 'Өргөмжлөл модон А4 (5ш дээш)', price: '23,000₮', category: 'Өргөмжлөл', image: null },
    { id: 808, name: 'Өргөмжлөл модон А5', price: '20,000₮', category: 'Өргөмжлөл', image: null },
    { id: 809, name: 'Өргөмжлөл модон А5 (5ш дээш)', price: '17,000₮', category: 'Өргөмжлөл', image: null },
    { id: 901, name: 'Дурсгалын үг', price: '5,500₮', category: 'Дурсгалын үг', image: null },
    { id: 902, name: 'Дурсгалын үг (5ш дээш)', price: '4,000₮', category: 'Дурсгалын үг', image: null },
    { id: 1001, name: 'Фудболк: Урд лого энгэр', price: '8,000₮', category: 'Хувцас хэвлэл', image: null },
    { id: 1002, name: 'Фудболк: Ард нэр', price: '10,000₮', category: 'Хувцас хэвлэл', image: null },
    { id: 1003, name: 'Фудболк: Урд энгэр лого, ард нэр', price: '15,000₮', category: 'Хувцас хэвлэл', image: null },
    { id: 1004, name: 'Фудболк: А4 зураг', price: '18,000₮', category: 'Хувцас хэвлэл', image: null },
    { id: 1005, name: 'Фудболк: А3 зураг', price: '25,000₮', category: 'Хувцас хэвлэл', image: null },
    { id: 1006, name: 'Ажлын хувцас хантааз ар (3ш)', price: '15,000₮', category: 'Хувцас хэвлэл', image: null },
    { id: 1007, name: 'Ажлын хувцас хантааз урд (3ш)', price: '10,000₮', category: 'Хувцас хэвлэл', image: null },
    { id: 1008, name: 'Ажлын хувцас хантааз урд, ард (3ш)', price: '19,000₮', category: 'Хувцас хэвлэл', image: null },
    { id: 1101, name: 'Энгэрийн тууз: Цагаанаар бичих (Туузтай)', price: '15,000₮', category: 'Тууз', image: null },
    { id: 1102, name: 'Энгэрийн тууз: Алтлагаар бичих (Туузтай)', price: '17,000₮', category: 'Тууз', image: null },
    { id: 1103, name: 'Энгэрийн тууз: Цагаанаар бичих (Туузгүй)', price: '12,000₮', category: 'Тууз', image: null },
    { id: 1104, name: 'Энгэрийн тууз: Алтлагаар бичих (Туузгүй)', price: '14,000₮', category: 'Тууз', image: null },
    { id: 1105, name: 'Төмөр нарийн шар тэмдэг (5ш дээш)', price: '3,000₮', category: 'Тууз', image: null },
    { id: 1106, name: 'Энгэрийн баантиктай бөөрөнхий', price: '2,500₮', category: 'Тууз', image: null },
    { id: 1107, name: 'Энгэрийн туузтай бөөрөнхий', price: '1,200₮', category: 'Тууз', image: null },
    { id: 1301, name: 'Хулдаас: 3*2 бөгжтэй нүх', price: '118,000₮', category: 'Хулдаас хэвлэл', image: null },
    { id: 1302, name: 'Хулдаас: 4*3 бөгжтэй нүх /нимгэн/', price: '216,000₮', category: 'Хулдаас хэвлэл', image: null },
    { id: 1303, name: 'Хулдаас: 4*3 бөгжтэй нүх /зузаан/', price: '265,000₮', category: 'Хулдаас хэвлэл', image: null },
    { id: 1304, name: 'Хулдаас: 40*60 хэмжээтэй', price: '18,000₮', category: 'Хулдаас хэвлэл', image: null },
    { id: 1305, name: 'Хулдаас: 40*100 хэмжээтэй', price: '25,000₮', category: 'Хулдаас хэвлэл', image: null },
    { id: 1306, name: 'Хулдаас: 2.5*3.5 хэмжээтэй', price: '165,000₮', category: 'Хулдаас хэвлэл', image: null },
    { id: 1307, name: 'Хулдаас: 3*5 хэмжээтэй', price: '325,000₮', category: 'Хулдаас хэвлэл', image: null },
    { id: 1308, name: 'Хулдаас: 4*5 хэмжээтэй', price: '390,000₮', category: 'Хулдаас хэвлэл', image: null }
];

/**
 * Default habits. Scores drive the monthly bonus, so `id` values are stable:
 * `id: 4` ("Цагтаа ирэх") is auto-completed when an arrival is not late.
 */
export const TASKS_DEFAULT: readonly HabitTask[] = [
  { id: 1, text: 'Ажлаа цэгцлэх цэвэрлэх', done: false, type: 'cleaning', score: 2 },
  { id: 2, text: 'R2 зургийн машин угаах хороо уншуулах', done: false, type: 'habit', score: 2 },
  { id: 3, text: 'Үйлчлүүлэгчидтэй сайн үйлчлэх том захиалга авах', done: false, type: 'habit', score: 3 },
  { id: 4, text: 'Цагтаа ирэх', done: false, type: 'habit', score: 3 },
  { id: 5, text: 'Цагтаа тарах', done: false, type: 'habit', score: 2 },
];

/** Score corrections applied to habits restored from an older cache. */
export const TASK_SCORE_MIGRATION: Readonly<Record<number, number>> = {
  1: 2,
  2: 2,
  3: 3,
  4: 3,
  5: 2,
};

export const COLOR_LABELS_DEFAULT: readonly ColorLabel[] = [
  { id: 1, color: '#dc2626', label: 'Тооцоотой' },
  { id: 2, color: '#f97316', label: 'Болсон, аваагүй' },
  { id: 3, color: '#facc15', label: 'Маргааш авна' },
  { id: 4, color: '#22c55e', label: 'Болсон' },
  { id: 5, color: '#3b82f6', label: 'Хүргэх/Унаанд тавих' },
  { id: 6, color: '#ffffff', label: 'Хүлээгдэж байна' },
];

export const CALC_TYPES_DEFAULT: readonly CalcType[] = [
  { id: 1, name: 'Хулдаас', base: 15000 },
  { id: 2, name: 'Стенд', base: 45000 },
  { id: 3, name: 'Өргөн фото', base: 25000 },
  { id: 4, name: 'Даавуун хэвлэл', base: 35000 },
];

export const TIME_SETTINGS_DEFAULT: TimeSettings = {
  startTime: '10:00',
  endTime: '18:30',
  penaltyPerMin: 500,
  onTimeScore: 5,
  onLeaveScore: 3,
  workingDays: 22,
};
