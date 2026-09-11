import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, MailX } from "lucide-react";

type Estado = "validando" | "valido" | "invalido" | "processando" | "sucesso" | "erro";

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [estado, setEstado] = useState<Estado>("validando");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const validar = async () => {
      if (!token) {
        setEstado("invalido");
        return;
      }
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: supabaseAnonKey } }
        );
        const data = await response.json();
        if (response.ok && data?.valid) {
          setEmail(data.email || "");
          setEstado("valido");
        } else {
          setEstado("invalido");
        }
      } catch {
        setEstado("invalido");
      }
    };
    validar();
  }, [token]);

  const confirmar = async () => {
    setEstado("processando");
    try {
      const { error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      setEstado(error ? "erro" : "sucesso");
    } catch {
      setEstado("erro");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <MailX className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Cancelar recebimento de e-mails</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {estado === "validando" && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando link...
            </div>
          )}

          {estado === "valido" && (
            <>
              <p className="text-sm text-muted-foreground">
                Deseja parar de receber e-mails automáticos do Carga Fácil
                {email ? (
                  <>
                    {" "}no endereço <strong>{email}</strong>
                  </>
                ) : null}
                ?
              </p>
              <Button onClick={confirmar} variant="destructive" className="w-full">
                Confirmar cancelamento
              </Button>
            </>
          )}

          {estado === "processando" && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Processando...
            </div>
          )}

          {estado === "sucesso" && (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <p className="text-sm">
                Pronto! Você não receberá mais esses e-mails.
              </p>
            </div>
          )}

          {(estado === "invalido" || estado === "erro") && (
            <div className="flex flex-col items-center gap-2">
              <XCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">
                {estado === "invalido"
                  ? "Este link é inválido ou já foi utilizado."
                  : "Não foi possível concluir. Tente novamente mais tarde."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
