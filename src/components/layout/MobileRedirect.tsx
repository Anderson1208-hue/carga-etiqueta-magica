import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useIsMobile } from "@/hooks/use-mobile";

const ALLOWED_MOBILE_ROUTES = [
  "/conferencia-interna",
  "/conferencia-externa",
  "/login",
  "/baixa-entrega",
  "/reset-password",
  "/motorista",
];

// No APK nativo (motorista na rua), só pode acessar a tela do código de acesso.
// Nada de login de operador, nada de conferência interna.
const ALLOWED_NATIVE_ROUTES = ["/motorista"];

const isNative = Capacitor.isNativePlatform();

export function MobileRedirect({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // /motorista e /motorista/* (ex.: /motorista/diagnostico) são sempre permitidos
    const isMotoristaRoute = location.pathname.startsWith("/motorista");

    if (isNative) {
      if (!isMotoristaRoute && !ALLOWED_NATIVE_ROUTES.includes(location.pathname)) {
        navigate("/motorista", { replace: true });
      }
      return;
    }

    if (isMobile && !isMotoristaRoute && !ALLOWED_MOBILE_ROUTES.includes(location.pathname)) {
      navigate("/conferencia-interna", { replace: true });
    }
  }, [isMobile, location.pathname, navigate]);

  return <>{children}</>;
}
