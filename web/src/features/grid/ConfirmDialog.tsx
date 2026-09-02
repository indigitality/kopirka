/** Подтверждение необратимого действия: очистка корзины, удаление навсегда, удаление папки. */
import { Button } from '@/components/ui/Button';
import { Modal, ModalContent } from '@/components/ui/Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <ModalContent
        title={title}
        description={description}
        footer={
          <>
            <Button variant="secondary" onClick={onCancel}>
              Отмена
            </Button>
            {/* Действие необратимо — сплошная опасная кнопка, а не мягкая (02 §4.22). */}
            <Button variant="danger-solid" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        }
      />
    </Modal>
  );
}
