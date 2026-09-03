import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder } from 'lucide-react';
import { Icon } from '@/lib/icons';
import { Button } from './Button';
import { Chip } from './Chip';
import { Input } from './Input';
import { Modal, ModalContent } from './Modal';
import { Select } from './Select';

/**
 * Канон — R14: «Подтверждение действия» (440), «Массовые действия» (440),
 * «Похоже, уже есть» (720). Проверять стоит поле 24, зазор 16, заголовок 20/26
 * и то, что в подтверждении подвал идёт без линии — так в макете.
 */
const meta = {
  title: 'Примитивы/Модалка',
  component: ModalContent,
  /* У `ModalContent` заголовок обязателен; истории рисуют своё через `render`. */
  args: { title: 'Модалка' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ModalContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Необратимое: сплошная опасная справа, «Отмена» — вторичная. */
export const Подтверждение: Story = {
  render: () => (
    <Modal defaultOpen>
      <ModalContent
        title="Удалить навсегда?"
        description="Файл исчезнет из библиотеки и с диска. Отменить это действие нельзя."
        footer={
          <>
            <Button variant="secondary">Отмена</Button>
            <Button variant="danger-solid">Удалить навсегда</Button>
          </>
        }
      />
    </Modal>
  ),
};

/** Массовое действие: между описанием и подвалом — контрол выбора папки. */
export const ПереместитьВПапку: Story = {
  name: 'Переместить в папку',
  render: () => (
    <Modal defaultOpen>
      <ModalContent
        title="Переместить в папку"
        description="12 файлов переедут в выбранную папку. Из текущей они исчезнут."
        footerDivider={false}
        footer={
          <>
            <Button variant="secondary">Отмена</Button>
            <Button variant="primary">Переместить</Button>
          </>
        }
      >
        <Select
          value="refs"
          onValueChange={() => {}}
          icon={<Icon icon={Folder} />}
          options={[
            { value: 'refs', label: 'Референсы' },
            { value: 'ui', label: 'Интерфейсы' },
          ]}
        />
      </ModalContent>
    </Modal>
  ),
};

/** Ввод и подсказки: поле 34 px и чипы `control` под ним. */
export const ДобавитьТег: Story = {
  name: 'Добавить тег',
  render: () => (
    <Modal defaultOpen>
      <ModalContent
        title="Добавить тег"
        description="Тег получат все 12 выбранных файлов. Уже проставленные теги останутся."
        footerDivider={false}
        footer={
          <>
            <Button variant="secondary">Отмена</Button>
            <Button variant="primary">Добавить</Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Input defaultValue="типогра" autoFocus />
          <div className="flex flex-wrap gap-1.5">
            <Chip as="button">типографика</Chip>
            <Chip as="button">типографика · крупная</Chip>
            <Chip as="button">типо-эксперимент</Chip>
          </div>
        </div>
      </ModalContent>
    </Modal>
  ),
};

/** Широкая (720): два превью рядом — «Похоже, уже есть» из R14. */
export const Широкая: Story = {
  name: 'Широкая · 720',
  render: () => (
    <Modal defaultOpen>
      <ModalContent
        size="lg"
        title="Похоже, это уже есть"
        description="В библиотеке нашёлся близкий файл. Слева — тот, что уже лежит, справа — новый."
        footer={
          <>
            <Button variant="ghost">Пропустить</Button>
            <Button variant="secondary">Оставить оба</Button>
            <Button variant="primary">Заменить</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="h-[200px] rounded-card bg-linear-to-br from-[#E7E8EB] to-[#C4C7CE]" />
          <div className="h-[200px] rounded-card bg-linear-to-br from-[#EAE3E6] to-[#CBBFC5]" />
        </div>
      </ModalContent>
    </Modal>
  ),
};

/** Линия подвала: от края до края, цветом обводки — правило Сергея. */
export const ЛинияПодвала: Story = {
  name: 'Линия подвала · длинное тело',
  render: () => (
    <Modal defaultOpen>
      <ModalContent
        size="md"
        title="Длинный список"
        footerDivider
        className="max-h-[420px]"
        footer={
          <>
            <Button variant="secondary">Отмена</Button>
            <Button variant="primary">Сохранить</Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {Array.from({ length: 14 }, (_, index) => (
            <div key={index} className="rounded-md bg-control px-2.5 py-2 text-md text-ink">
              Строка {index + 1}
            </div>
          ))}
        </div>
      </ModalContent>
    </Modal>
  ),
};
