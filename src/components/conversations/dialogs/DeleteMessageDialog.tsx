import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** Quantidade de mensagens a apagar. >1 ativa o texto plural (seleção em massa). */
  count?: number;
}

export function DeleteMessageDialog({
  open,
  onOpenChange,
  onConfirm,
  count = 1,
}: DeleteMessageDialogProps) {
  const plural = count > 1;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {plural ? `Apagar ${count} mensagens` : 'Apagar Mensagem'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {plural
              ? `Tem certeza que deseja apagar ${count} mensagens? Esta ação não pode ser desfeita.`
              : 'Tem certeza que deseja apagar esta mensagem? Esta ação não pode ser desfeita.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Apagar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
