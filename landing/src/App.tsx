/**
 * Лендинг «Копирки». Девять секций фрейма «Лендинг · A · Чёрная галерея»
 * (Paper, страница «лендинг», артборд H0E-0) в порядке макета.
 *
 * Первый экран существует в двух вариантах — со снимком приложения и с
 * видеофоном; какой показать, решает адрес страницы (`heroVariant.ts`).
 * Без параметра — прежний, со снимком.
 */
import { useState } from 'react';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { FiveWays } from './components/FiveWays';
import { Order } from './components/Order';
import { Files } from './components/Files';
import { Download } from './components/Download';
import { Donate } from './components/Donate';
import { Instat } from './components/Instat';
import { Footer } from './components/Footer';
import { VariantSwitch } from './components/VariantSwitch';
import { isVariantPreview, readHeroVariant } from './heroVariant';

export function App() {
  // Адрес за время жизни страницы не меняется — читаем один раз.
  const [variant] = useState(readHeroVariant);
  const [preview] = useState(isVariantPreview);

  return (
    <>
      <Nav />
      <main>
        <Hero variant={variant} showSecondaryButton={preview} />
        <FiveWays />
        <Order />
        <Files />
        <Download />
        <Donate />
        <Instat />
      </main>
      <Footer />
      {preview && <VariantSwitch current={variant} />}
    </>
  );
}
