import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "operador";
  ativo: boolean;
  pode_divergencia: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let lastUserId: string | null = null;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        const newUserId = session?.user?.id ?? null;

        // Ignora TOKEN_REFRESHED e USER_UPDATED para evitar refetch + re-render do spinner
        // que causam o "white screen + restart" quando o token é renovado ou a aba volta ao foco.
        if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          return;
        }

        if (session?.user) {
          // Só refaz o fetch se o usuário mudou (login real, não refresh)
          if (newUserId !== lastUserId) {
            lastUserId = newUserId;
            setTimeout(async () => {
              try {
                const { data: profileData, error: profileError } = await supabase
                  .from("profiles")
                  .select("*")
                  .eq("id", session.user.id)
                  .maybeSingle();

                if (profileError) {
                  console.error("[Auth] Erro ao buscar perfil (onAuthStateChange):", profileError);
                } else if (profileData) {
                  setProfile(profileData as Profile);
                } else {
                  console.warn("[Auth] Perfil não encontrado para user:", session.user.id);
                }
              } catch (err) {
                console.error("[Auth] Exceção ao buscar perfil:", err);
              }
            }, 0);
          }
        } else {
          lastUserId = null;
          setProfile(null);
        }
        setIsLoading(false);
      }
    );

    // THEN get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        lastUserId = session.user.id;
        supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle()
          .then(({ data: profileData, error: profileError }) => {
            if (profileError) {
              console.error("[Auth] Erro ao buscar perfil (getSession):", profileError);
            } else if (profileData) {
              setProfile(profileData as Profile);
            } else {
              console.warn("[Auth] Perfil não encontrado (getSession) para user:", session.user.id);
            }
            setIsLoading(false);
          });
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (err) {
      console.error("[Auth] Exceção no signIn:", err);
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const isAdmin = profile?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        isAdmin,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
