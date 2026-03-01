import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { ArrowLeft, User, Shield, LogOut } from "lucide-react";
import { APP_VERSION } from "@/const";

export default function Perfil() {
  const [, setLocation] = useLocation();
  // FIX: usar useAuth oficial em vez de useAuthSimple (hook obsoleto)
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    if (confirm("Deseja realmente sair do sistema?")) {
      await logout();
      // useAuth já redireciona para /login via setLocation
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          className="text-white/70 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-white">Meu Perfil</h1>
          <p className="text-sm text-white/50">Informações da sua conta</p>
        </div>
      </div>

      {/* Card principal */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 mb-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-amber-300">
              {user && user.name ? user.name.slice(0, 1).toUpperCase() : "U"}
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{user && user.name ? user.name : "Usuário"}</h2>
            <p className="text-sm text-white/50">
              {user?.role === "admin" ? "👑 Administrador" : "👤 Vendedor"}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5">
            <Shield className="h-5 w-5 text-amber-400/70" />
            <div>
              <p className="text-xs text-white/50">Nível de Acesso</p>
              <p className="font-semibold text-white/90">
                {user?.role === "admin"
                  ? "Administrador (acesso total)"
                  : "Vendedor (acesso limitado)"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5">
            <User className="h-5 w-5 text-amber-400/70" />
            <div>
              <p className="text-xs text-white/50">ID do Usuário</p>
              <p className="font-semibold text-white/90">{user?.openId || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <h3 className="font-semibold text-white/80 mb-4">Ações da Conta</h3>
        <Button
          variant="destructive"
          onClick={handleLogout}
          className="w-full gap-2"
        >
          <LogOut className="h-4 w-4" />
          Sair do Sistema
        </Button>
      </div>

      <div className="mt-4 text-center text-xs text-white/30">
        Sistema GRS MÓVEIS • {APP_VERSION}
      </div>
    </div>
  );
}
