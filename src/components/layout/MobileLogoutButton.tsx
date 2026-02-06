import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function MobileLogoutButton() {
  const { signOut } = useAuth();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-sidebar-foreground/90 hover:text-sidebar-foreground hover:bg-sidebar-accent gap-2"
      onClick={signOut}
    >
      <LogOut className="w-4 h-4" />
      Sair
    </Button>
  );
}
