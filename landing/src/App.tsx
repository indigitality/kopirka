/**
 * Лендинг «Копирки». Девять секций фрейма «Лендинг · A · Чёрная галерея»
 * (Paper, страница «лендинг», артборд H0E-0) в порядке макета.
 */
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { FiveWays } from './components/FiveWays';
import { Order } from './components/Order';
import { Files } from './components/Files';
import { Download } from './components/Download';
import { Donate } from './components/Donate';
import { Instat } from './components/Instat';
import { Footer } from './components/Footer';

export function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <FiveWays />
        <Order />
        <Files />
        <Download />
        <Donate />
        <Instat />
      </main>
      <Footer />
    </>
  );
}
