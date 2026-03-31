import React, { createContext, useContext, useState } from "react";
import { QuickClientModal } from "../components/modals/QuickClientModal";
import { QuickProductModal } from "../components/modals/QuickProductModal";

interface QuickActionsContextType {
  openQuickClient: () => void;
  openQuickProduct: () => void;
}

const QuickActionsContext = createContext<QuickActionsContextType | undefined>(undefined);

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const [isClientOpen, setIsClientOpen] = useState(false);
  const [isProductOpen, setIsProductOpen] = useState(false);

  const openQuickClient = () => setIsClientOpen(true);
  const openQuickProduct = () => setIsProductOpen(true);

  return (
    <QuickActionsContext.Provider value={{ openQuickClient, openQuickProduct }}>
      {children}
      <QuickClientModal isOpen={isClientOpen} onClose={() => setIsClientOpen(false)} />
      <QuickProductModal isOpen={isProductOpen} onClose={() => setIsProductOpen(false)} />
    </QuickActionsContext.Provider>
  );
}

export const useQuickActions = () => {
  const context = useContext(QuickActionsContext);
  if (!context) throw new Error("useQuickActions must be used within QuickActionsProvider");
  return context;
};
