import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Monitor } from "lucide-react";
import { Link } from "react-router-dom";

export function MobileLogoutButton() {
  const { signOut } = useAuth();

  return (
    <div className="flex items-center gap-2">
      <Link to="/">
        <Button
          variant="ghost"
          size="sm"
          className="text-sidebar-foreground/90 hover:text-sidebar-foreground hover:bg-sidebar-accent gap-1.5"
        >
          <Monitor className="w-4 h-4" />
          Desktop
        </Button>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        className="text-sidebar-foreground/90 hover:text-sidebar-foreground hover:bg-sidebar-accent gap-1.5"
        onClick={signOut}
      >
        <LogOut className="w-4 h-4" />
        Sair
      </Button>
    </div>
  );
}
