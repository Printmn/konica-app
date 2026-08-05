/**
 * Emoji lookups for catalog categories and services.
 *
 * Pure, side-effect-free, and copied across from the web build without any
 * behavioural change — the same input still yields the same emoji.
 */

export const getCategoryEmoji = (cat: string | null | undefined): string => {
  const c = (cat || '').toLowerCase();
  if (c.includes('жааз')) return '🖼️';
  if (c.includes('цаас')) return '📄';
  if (c.includes('ламинат')) return '📋';
  if (c.includes('мандат')) return '📜';
  if (c.includes('тууз') || c.includes('энгэр')) return '🎀';
  if (c.includes('медаль')) return '🏅';
  if (c.includes('цом')) return '🏆';
  if (c.includes('хавтас')) return '📁';
  if (c.includes('альбом')) return '📔';
  if (c.includes('урилга')) return '💌';
  if (c.includes('өргөмж')) return '🎖️';
  if (c.includes('дурсгал')) return '🎁';
  if (c.includes('хувцас')) return '👕';
  if (c.includes('хулдаас')) return '🪧';
  if (c.includes('канон')) return '📠';
  if (c.includes('фото') || c.includes('зураг')) return '📸';
  if (c.includes('хэвлэл')) return '🖨️';
  if (c.includes('хувилах') || c.includes('скан')) return '🖨️';
  if (c.includes('засвар')) return '🔧';
  if (c.includes('усны') || c.includes('сав')) return '💧';
  if (c.includes('бал')) return '🖊️';
  if (c.includes('дэвтэр')) return '📓';
  if (c.includes('аяга')) return '☕';
  if (c.includes('таваг')) return '🍽️';
  if (c.includes('ном')) return '📚';
  return '📦';
};

// Үйлчилгээний emoji — нэр болон категориос хамаарч тодорхой emoji буцаана
export const getServiceEmoji = (name: string | null | undefined, category: string | null | undefined): string => {
  const n = (name || '').toLowerCase();
  const c = (category || '').toLowerCase();

  // === УГААЛТ (Фото зураг хэвлэх) — бүгд адил ===
  if (c === 'угаалт' || n.includes('угаалт')) return '🖼️';

  // === ЗАСВАР (Хуучин зураг сэргээх — old picture restoration) ===
  if (c === 'засвар' || n.includes('засвартай')) return '🕰️';

  // === ХУВИЛАХ / СКАН ===
  if (c.includes('хувилах') || c.includes('скан') || n.includes('скан')) {
    if (n.includes('10') || n.includes('13')) return '🔍';
    if (n.includes('16') || n.includes('20')) return '📠';
    if (n.includes('30')) return '🖨️';
    return '📠';
  }

  // === КАНОН ХЭВЛЭЛ ===
  if (c === 'канон' || n.includes('канон')) {
    if (n.includes('өнгөт')) return '🖨️';
    if (n.includes('хар') && n.includes('2 тал')) return '⬛';
    if (n.includes('хар')) return '◾';
    if (n.includes('бичиг')) return '📄';
    return '🖨️';
  }

  // === ХЭВЛЭЛ (Фото цаас дээрх хэвлэл) ===
  if (c === 'хэвлэл' || (n.includes('хэвлэл') && n.includes('фото'))) {
    if (n.includes('а3')) return '🗃️';
    return '📸';
  }

  // === МЕДАЛЬ & ЦОМ ===
  if (c.includes('медаль') || c.includes('цом')) {
    if (n.includes('цом')) return '🏆';
    if (n.includes('шилэн') && n.includes('оосор')) return '🎗️';
    if (n.includes('шилэн')) return '🏅';
    if (n.includes('төмөр') && n.includes('оосор')) return '🎗️';
    if (n.includes('төмөр')) return '🥉';
    if (n.includes('оосор') && n.includes('лого')) return '🎀';
    if (n.includes('оосор')) return '🎗️';
    return '🏅';
  }

  // === ӨРГӨМЖЛӨЛ ===
  if (c === 'өргөмжлөл' || n.includes('өргөмжлөл')) {
    if (n.includes('модон') && n.includes('а5')) return '🪵';
    if (n.includes('модон')) return '🪵';
    if (n.includes('а5')) return '📃';
    return '📜';
  }

  // === ДУРСГАЛЫН ҮГ ===
  if (c.includes('дурсгал') || n.includes('дурсгалын')) return '🕊️';

  // === ХУВЦАС ХЭВЛЭЛ ===
  if (c.includes('хувцас') || n.includes('фудболк') || n.includes('хантааз')) {
    if (n.includes('хантааз')) return '🦺';
    return '👕';
  }

  // === ЭНГЭРИЙН ТУУЗ ===
  if (c === 'тууз' || n.includes('тууз') || n.includes('энгэр')) {
    if (n.includes('бөөрөнхий') && n.includes('туузтай')) return '🔵';
    if (n.includes('бөөрөнхий')) return '🔵';
    if (n.includes('төмөр') && n.includes('шар')) return '🏷️';
    if (n.includes('алтлага')) return '✨';
    return '🎀';
  }

  // === ХУЛДААС ХЭВЛЭЛ ===
  if (c.includes('хулдаас') || n.includes('хулдаас')) {
    if (n.includes('40*60') || n.includes('40*100')) return '🪧';
    if (n.includes('бөгж') || n.includes('нүх')) return '📌';
    return '🪧';
  }

  // fallback — категориас авна
  return getCategoryEmoji(category);
};
