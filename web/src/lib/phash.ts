/**
 * Сравнение перцептивных хэшей на стороне интерфейса.
 * Сервер отдаёт `phash` в записи файла, но не отдаёт расстояние, —
 * а блоку «Похоже на уже имеющийся» (§3 спеки) нужен процент совпадения.
 */

const BITS = 64;

/** Расстояние Хэмминга между двумя hex-хэшами. null — хэшей нет или они разной длины. */
export function hammingDistance(a: string | null, b: string | null): number | null {
  if (!a || !b || a.length !== b.length) return null;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = Number.parseInt(a[i] ?? '', 16);
    const right = Number.parseInt(b[i] ?? '', 16);
    if (Number.isNaN(left) || Number.isNaN(right)) return null;
    let diff = left ^ right;
    while (diff !== 0) {
      distance += diff & 1;
      diff >>= 1;
    }
  }
  return distance;
}

/** «92%» — доля совпавших бит. null, если сравнить нечего. */
export function similarityPercent(a: string | null, b: string | null): number | null {
  const distance = hammingDistance(a, b);
  if (distance === null) return null;
  return Math.round(((BITS - distance) / BITS) * 100);
}
