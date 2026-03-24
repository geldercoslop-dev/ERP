import { useEffect } from "react";
import { useLocation } from "wouter";

export default function LeoPanel() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/assistente");
  }, [setLocation]);

  return (
    <div className="flex min-h-[200px] items-center justify-center p-6">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
