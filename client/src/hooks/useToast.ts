import { toast } from "sonner";

export interface ToastProps {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

export function useToast() {
  return {
    toast: ({ title, description, variant }: ToastProps) => {
      if (variant === "destructive") {
        return toast.error(title, {
          description,
        });
      } else if (variant === "success") {
        return toast.success(title, {
          description,
        });
      } else {
        return toast(title, {
          description,
        });
      }
    },
  };
}