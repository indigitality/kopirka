/**
 * Слот медиа для блока вкладок.
 *
 * Сейчас внутри картинки — иллюстрации, выгруженные из Paper и подогнанные под
 * панель (`public/media/way-*.webp`): временная замена, пока Сергей не снял
 * записи экрана. Каждый файл уже приведён к 16:10 и добит по краям цветом
 * `--color-panel` #1C1D1F, поэтому слот своего поля не добавляет — иначе поле
 * складывалось бы дважды и иллюстрация тонула в пустоте. Поэтому слот с самого начала умеет `video`: когда записи появятся,
 * меняется только описание вкладки — `{ kind: 'video', src, poster }`, разметка
 * и анимация остаются те же.
 *
 * Смена — кроссфейдом: opacity и scale 0.98 → 1 за 320 мс. При «уменьшить
 * движение» масштаб не участвует.
 */
import { AnimatePresence, motion } from 'motion/react';
import { DUR_SLOW, EASE_OUT } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type Media =
  | { kind: 'image'; src: string; poster?: undefined }
  | { kind: 'video'; src: string; poster?: string };

export interface MediaSlotProps {
  media: Media;
  /** Ключ кадра: по нему `AnimatePresence` понимает, что медиа сменилось. */
  slotKey: string;
  /** Подпись для доступности — описание того, что показано. */
  alt: string;
}

export function MediaSlot({ media, slotKey, alt }: MediaSlotProps) {
  const reduced = useReducedMotion();
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 };
  const shown = reduced ? { opacity: 1 } : { opacity: 1, scale: 1 };

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[14px] bg-panel md:rounded-[24px]">
      <AnimatePresence initial={false}>
        <motion.div
          key={slotKey}
          className="absolute inset-0"
          initial={hidden}
          animate={shown}
          exit={hidden}
          transition={{ duration: DUR_SLOW, ease: EASE_OUT }}
        >
          {media.kind === 'video' ? (
            <video
              src={media.src}
              poster={media.poster}
              autoPlay
              muted
              loop
              playsInline
              aria-label={alt}
              className="h-full w-full object-cover"
            />
          ) : (
            <img
              src={media.src}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
