import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { MobileRedirect } from "@/components/layout/MobileRedirect";

const IS_NATIVE_APK = Capacitor.isNativePlatform();
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
import Enderecamento from "./pages/Enderecamento";
import ConsultaNF from "./pages/ConsultaNF";
import MonitoramentoRotas from "./pages/MonitoramentoRotas";
import TorreControle from "./pages/TorreControle";
import AcompanhamentoRotas from "./pages/AcompanhamentoRotas";
import Operadores from "./pages/Operadores";
import AuditoriaLog from "./pages/AuditoriaLog";

import RelatorioBaixas from "./pages/RelatorioBaixas";
import RelatorioPendentesBaixa from "./pages/RelatorioPendentesBaixa";
import RelatorioAgendamentosFornecedor from "./pages/RelatorioAgendamentosFornecedor";
import PrestacaoContas from "./pages/PrestacaoContas";
import DesfazerBaixa from "./pages/DesfazerBaixa";
import RomaneioPorNf from "./pages/RomaneioPorNf";

import MotoristaAcesso from "./pages/MotoristaAcesso";
import MotoristaDiagnostico from "./pages/MotoristaDiagnostico";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import Embarcadores from "./pages/Embarcadores";
import Destinatarios from "./pages/Destinatarios";
import IntegracaoIbac from "./pages/IntegracaoIbac";
import PreCte from "./pages/PreCte";
import ImportarOcoren from "./pages/ImportarOcoren";
import FiscalConfiguracao from "./pages/FiscalConfiguracao";
import MotoristasFiscal from "./pages/fiscal/Motoristas";
import ConveniosFiscais from "./pages/fiscal/Convenios";
import TabelasFrete from "./pages/fiscal/TabelasFrete";
import RevisaoCoordenadas from "./pages/RevisaoCoordenadas";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, isLoading, isAdmin, signOut } = useAuth();

  // No APK do motorista, qualquer rota protegida cai direto na tela de código.
  // Nunca mostrar login de operador no app nativo.
  if (IS_NATIVE_APK) {
    return <Navigate to="/motorista" replace />;
  }

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

  // Inactive non-admin operators see a pending screen
  if (profile && !isAdmin && !profile.ativo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <span className="text-3xl">⏳</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">Acesso Pendente</h1>
          <p className="text-muted-foreground">
            Seu cadastro foi recebido. Aguarde a liberação de um administrador para acessar o sistema.
          </p>
          <button
            onClick={signOut}
            className="text-sm text-primary underline hover:no-underline"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  // No APK, /login não existe — redireciona para /motorista.
  if (IS_NATIVE_APK) {
    return <Navigate to="/motorista" replace />;
  }

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

// Operadores de galpão: sempre abrem direto na Conferência Interna.
const CONFERENCIA_FIRST_EMAILS = [
  "pedro.martins@tlmlogistica.com.br",
  "deposito@tlmlogistica.com.br",
  "arquivostlm@tlmlogistica.com.br",
];

function HomeRoute() {
  const { profile } = useAuth();
  const email = profile?.email?.toLowerCase() ?? "";

  if (email && CONFERENCIA_FIRST_EMAILS.includes(email)) {
    return <Navigate to="/conferencia-interna" replace />;
  }

  return <Dashboard />;
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
            <HomeRoute />
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
        path="/enderecamento"
        element={
          <ProtectedRoute>
            <Enderecamento />
          </ProtectedRoute>
        }
      />
      <Route
        path="/monitoramento-rotas"
        element={
          <ProtectedRoute>
            <MonitoramentoRotas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/torre-controle"
        element={
          <ProtectedRoute>
            <TorreControle />
          </ProtectedRoute>
        }
      />
      <Route
        path="/acompanhamento-rotas"
        element={
          <ProtectedRoute>
            <AcompanhamentoRotas />
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
      <Route
        path="/auditoria"
        element={
          <ProtectedRoute>
            <AuditoriaLog />
          </ProtectedRoute>
        }
      />
      <Route
        path="/relatorios/baixas"
        element={
          <ProtectedRoute>
            <RelatorioBaixas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/relatorios/pendentes-baixa"
        element={
          <ProtectedRoute>
            <RelatorioPendentesBaixa />
          </ProtectedRoute>
        }
      />
      <Route
        path="/relatorios/agendamentos-fornecedor"
        element={
          <ProtectedRoute>
            <RelatorioAgendamentosFornecedor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/prestacao-contas"
        element={
          <ProtectedRoute>
            <PrestacaoContas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/prestacao-contas/desfazer-baixa"
        element={
          <ProtectedRoute>
            <DesfazerBaixa />
          </ProtectedRoute>
        }
      />
      <Route path="/romaneio-por-nf" element={<ProtectedRoute><RomaneioPorNf /></ProtectedRoute>} />
      <Route path="/totalizado-nf" element={<ProtectedRoute><RomaneioPorNf /></ProtectedRoute>} />
      <Route path="/embarcadores" element={<ProtectedRoute><Embarcadores /></ProtectedRoute>} />
      <Route path="/destinatarios" element={<ProtectedRoute><Destinatarios /></ProtectedRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/integracoes/ibac" element={<ProtectedRoute><IntegracaoIbac /></ProtectedRoute>} />
      <Route path="/pre-cte" element={<ProtectedRoute><PreCte /></ProtectedRoute>} />
      <Route path="/integracoes/ocoren" element={<ProtectedRoute><ImportarOcoren /></ProtectedRoute>} />
      <Route path="/fiscal/configuracao" element={<ProtectedRoute><FiscalConfiguracao /></ProtectedRoute>} />
      <Route path="/fiscal/motoristas" element={<ProtectedRoute><MotoristasFiscal /></ProtectedRoute>} />
      <Route path="/fiscal/convenios" element={<ProtectedRoute><ConveniosFiscais /></ProtectedRoute>} />
      <Route path="/fiscal/tabelas-frete" element={<ProtectedRoute><TabelasFrete /></ProtectedRoute>} />
      <Route path="/motorista" element={<ErrorBoundary><MotoristaAcesso /></ErrorBoundary>} />

      <Route path="/motorista/diagnostico" element={<ErrorBoundary><MotoristaDiagnostico /></ErrorBoundary>} />
      <Route path="/monitoramento/revisao-coordenadas" element={<ProtectedRoute><RevisaoCoordenadas /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
};

export default App;
