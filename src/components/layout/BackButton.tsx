import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// Rotas onde o botão de voltar não faz sentido (raiz, login, app do motorista)
const HIDDEN_PATHS = ["/", "/login", "/reset-password", "/motorista"];

export function BackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const path = location.pathname;
  const hidden =
    HIDDEN_PATHS.includes(path) || path.startsWith("/motorista");

  if (hidden) return null;

  const handleBack = () => {
    // Se não há histórico dentro do app, volta para a home.
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={handleBack}
      aria-label="Voltar"
      className={cn(
        "fixed right-4 z-50 shadow-lg border gap-2 print:hidden",
        isMobile ? "bottom-20" : "bottom-6"
      )}
    >
      <ArrowLeft className="w-4 h-4" />
      Voltar
    </Button>
  );
}
