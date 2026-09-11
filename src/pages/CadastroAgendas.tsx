import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CadastroAgendas() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Cadastro de Agendas</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro e manutenção das agendas de recebimento dos clientes.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Em construção</CardTitle>
          <CardDescription>
            Esta área vai concentrar o cadastro das agendas (janelas, horários e regras por cliente).
            A estrutura do menu já está pronta para receber o cadastro.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
