/**
 * Шейдерный слой первого экрана. Отдельный модуль ради ленивой загрузки:
 * `@paper-design/shaders-react` тащит за собой WebGL-обвязку, и в первом
 * чанке ей делать нечего (`HeroBackdrop` подключает файл через `lazy`).
 *
 * Параметры выбраны так, чтобы это читалось как дыхание света за заголовком:
 * фон — холст #050505, два почти чёрных зелёных тона и крошечная доля лайма,
 * скорость медленная, зерно заметное. Прозрачность слоя и маска к краям —
 * снаружи, чтобы пик не выходил за ~10 %.
 */
import { useEffect } from 'react';
import { GrainGradient } from '@paper-design/shaders-react';

export interface HeroShaderProps {
  /** Сообщить наверх, что WebGL всё-таки не поднялся — включится canvas 2D. */
  onError: () => void;
}

export default function HeroShader({ onError }: HeroShaderProps) {
  useEffect(() => {
    // Потеря контекста на слабой машине: молча падаем на запасной фон.
    const onLost = () => onError();
    window.addEventListener('webglcontextlost', onLost, true);
    return () => window.removeEventListener('webglcontextlost', onLost, true);
  }, [onError]);

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: 0.32,
        // Маска: свет живёт в середине верхней трети, к краям уходит в ноль.
        maskImage: 'radial-gradient(62% 52% at 50% 32%, #000 0%, transparent 78%)',
        WebkitMaskImage: 'radial-gradient(62% 52% at 50% 32%, #000 0%, transparent 78%)',
      }}
    >
      <GrainGradient
        style={{ width: '100%', height: '100%' }}
        colorBack="#050505"
        colors={['#0a0d06', '#16220a', '#c5fd63']}
        shape="wave"
        softness={0.9}
        intensity={0.28}
        noise={0.45}
        speed={0.14}
      />
    </div>
  );
}
