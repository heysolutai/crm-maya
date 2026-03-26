import React, { createContext, useContext, useState, useCallback } from 'react';

interface UnsavedChangesContextType {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  confirmIfDirty: (onConfirm: () => void) => void;
  showDialog: boolean;
  pendingAction: (() => void) | null;
  handleConfirm: () => void;
  handleCancel: () => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType>({
  isDirty: false,
  setDirty: () => {},
  confirmIfDirty: () => {},
  showDialog: false,
  pendingAction: null,
  handleConfirm: () => {},
  handleCancel: () => {},
});

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const setDirty = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  const confirmIfDirty = useCallback((onConfirm: () => void) => {
    if (isDirty) {
      setPendingAction(() => onConfirm);
      setShowDialog(true);
    } else {
      onConfirm();
    }
  }, [isDirty]);

  const handleConfirm = useCallback(() => {
    setShowDialog(false);
    setIsDirty(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    setPendingAction(null);
  }, []);

  return (
    <UnsavedChangesContext.Provider value={{ isDirty, setDirty, confirmIfDirty, showDialog, pendingAction, handleConfirm, handleCancel }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}
