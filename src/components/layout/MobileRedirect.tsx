import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

const ALLOWED_MOBILE_ROUTES = ["/conferencia-interna", "/conferencia-externa", "/login", "/baixa-entrega", "/reset-password", "/motorista"];

export function MobileRedirect({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isMobile && !ALLOWED_MOBILE_ROUTES.includes(location.pathname)) {
      navigate("/conferencia-interna", { replace: true });
    }
  }, [isMobile, location.pathname, navigate]);

  return <>{children}</>;
}
