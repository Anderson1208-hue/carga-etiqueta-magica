import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

export function MobileLogoutButton() {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/80">
        <User className="w-3.5 h-3.5" />
        <span className="max-w-[80px] truncate">
          {profile?.full_name || profile?.email?.split("@")[0]}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-sidebar-foreground/80 hover:text-sidebar-foreground h-8 w-8"
        onClick={signOut}
        title="Sair"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );
}
