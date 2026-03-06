import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { MobileRedirect } from "@/components/layout/MobileRedirect";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Cargas from "./pages/Cargas";
import Romaneio from "./pages/Romaneio";
import Etiquetas from "./pages/Etiquetas";
import ConferenciaInterna from "./pages/ConferenciaInterna";
import ConferenciaExterna from "./pages/ConferenciaExterna";
import Roteirizacao from "./pages/Roteirizacao";
import Programacao from "./pages/Programacao";
import BaixaEntrega from "./pages/BaixaEntrega";
import HistoricoEntregas from "./pages/HistoricoEntregas";
import Agendamento from "./pages/Agendamento";
import ConsultaNF from "./pages/ConsultaNF";
import Operadores from "./pages/Operadores";
import MotoristaAcesso from "./pages/MotoristaAcesso";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cargas"
        element={
          <ProtectedRoute>
            <Cargas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/romaneio"
        element={
          <ProtectedRoute>
            <Romaneio />
          </ProtectedRoute>
        }
      />
      <Route
        path="/etiquetas"
        element={
          <ProtectedRoute>
            <Etiquetas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/conferencia-interna"
        element={
          <ProtectedRoute>
            <ConferenciaInterna />
          </ProtectedRoute>
        }
      />
      <Route
        path="/conferencia-externa"
        element={
          <ProtectedRoute>
            <ConferenciaExterna />
          </ProtectedRoute>
        }
      />
      <Route
        path="/roteirizacao"
        element={
          <ProtectedRoute>
            <Roteirizacao />
          </ProtectedRoute>
        }
      />
      <Route
        path="/programacao"
        element={
          <ProtectedRoute>
            <Programacao />
          </ProtectedRoute>
        }
      />
      <Route
        path="/baixa-entrega"
        element={
          <ProtectedRoute>
            <BaixaEntrega />
          </ProtectedRoute>
        }
      />
      <Route
        path="/historico-entregas"
        element={
          <ProtectedRoute>
            <HistoricoEntregas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/agendamento"
        element={
          <ProtectedRoute>
            <Agendamento />
          </ProtectedRoute>
        }
      />
      <Route
        path="/consulta-nf"
        element={
          <ProtectedRoute>
            <ConsultaNF />
          </ProtectedRoute>
        }
      />
      <Route
        path="/operadores"
        element={
          <ProtectedRoute>
            <Operadores />
          </ProtectedRoute>
        }
      />
      <Route path="/motorista" element={<MotoristaAcesso />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <MobileRedirect>
            <AppRoutes />
          </MobileRedirect>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
