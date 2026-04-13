import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [signUpData, setSignUpData] = useState({
    email: "",
    password: "",
    fullName: "",
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(loginData.email, loginData.password);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao entrar",
        description: error.message,
      });
    } else {
      navigate("/");
    }

    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signUp(
      signUpData.email,
      signUpData.password,
      signUpData.fullName
    );

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao cadastrar",
        description: error.message,
      });
    } else {
      toast({
        title: "Cadastro realizado!",
        description: "Verifique seu e-mail para confirmar a conta.",
      });
    }

    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!forgotEmail) {
      return;
    }

    setIsForgotLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } else {
      toast({
        title: "E-mail enviado!",
        description: "Verifique sua caixa de entrada para redefinir a senha.",
      });
      setShowForgot(false);
      setForgotEmail("");
    }

    setIsForgotLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary mx-auto mb-4 flex items-center justify-center">
            <Truck className="w-9 h-9 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">WMS Recebimento</CardTitle>
          <CardDescription>
            Sistema de recebimento de mercadorias via NF-e
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-mail</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginData.email}
                    onChange={(e) =>
                      setLoginData({ ...loginData, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData({ ...loginData, password: e.target.value })
                    }
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Entrar
                </Button>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="w-full text-sm text-primary underline hover:no-underline mt-2"
                >
                  Esqueci minha senha
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome completo</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Seu nome"
                    value={signUpData.fullName}
                    onChange={(e) =>
                      setSignUpData({ ...signUpData, fullName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">E-mail</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={signUpData.email}
                    onChange={(e) =>
                      setSignUpData({ ...signUpData, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={signUpData.password}
                    onChange={(e) =>
                      setSignUpData({ ...signUpData, password: e.target.value })
                    }
                    minLength={6}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {showForgot && (
            <form onSubmit={handleForgotPassword} className="mt-6 border-t pt-6 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Redefinir senha</h3>
              <p className="text-xs text-muted-foreground">
                Informe seu e-mail para receber o link de redefinição.
              </p>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForgot(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isForgotLoading || !forgotEmail}
                >
                  {isForgotLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Enviar link
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
