import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function SemPermissao() {
  return (
    <div className="container mx-auto p-6 max-w-lg">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <ShieldAlert className="w-10 h-10 text-muted-foreground" />
          <p className="font-semibold">Sem permissão</p>
          <p className="text-sm text-muted-foreground">
            Esta função é restrita à administração e aos usuários autorizados da
            gestão comercial.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
