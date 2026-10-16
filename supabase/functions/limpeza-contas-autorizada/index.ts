import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// One-off cleanup explicitly authorized by Anderson on 2026-10-16.
const actorId = "55754d78-fc6c-4a8c-847c-04998dc661d8";
const preservedId = "4bb83212-21f4-4652-b1b0-3002c7b6f8bf";
const targets = [
  ["d55b188d-60b2-404e-b8d6-2654b34c235b", "gilson.vasck@tllogistica.com.br"],
  ["41ee5fa6-5dea-41aa-9ee9-72932daf34da", "bayerc92@gmail.com"],
  ["95ceccd7-a4aa-4e57-8bcc-93f5df5f45a5", "crislovevicto@hotimail.com"],
  ["75e67319-4d79-456f-b50c-32443903c036", "joaoldebossan@gmail.com"],
  ["5abb9f7a-272f-4f8b-a404-2bc267d3f09c", "lhenriquebb1@gmail.com"],
  ["67be28b0-f2bc-464a-afbb-e2b2e3944e36", "narcipinto65@gmail.com"],
  ["8b5fa524-aedd-4a91-a4a0-5d1d25f5db14", "operador2@wmsrecebimento.com"],
  ["57b04be9-047a-4a44-99a7-803221bc4bc2", "teste@wmsrecebimento.com"],
];

Deno.serve(async (req) => {
  const respond = (status: number, body: object) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
  if (req.method !== "POST") return respond(405, { error: "POST required" });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return respond(500, { error: "Missing server configuration" });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return respond(401, { error: "Authentication required" });
  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || auth.user?.id !== actorId) return respond(403, { error: "Not authorized" });
  const { data: actor, error: actorError } = await sb.from("profiles").select("role,ativo").eq("id", actorId).single();
  if (actorError || actor?.role !== "admin" || actor.ativo !== true) return respond(403, { error: "Admin required" });
  const body = await req.json().catch(() => null);
  if (body?.confirmation !== "Anderson autorizou excluir 8 contas em 16/10/2026") return respond(400, { error: "Confirmation required" });
  const { data: current, error: currentError } = await sb.auth.admin.getUserById(preservedId);
  if (currentError || current.user?.email !== "gilson.vasck@tlmlogistica.com.br") return respond(409, { error: "Preserved account mismatch" });
  // Validate the entire immutable list before deleting anything.
  for (const [id, email] of targets) {
    const { data, error } = await sb.auth.admin.getUserById(id);
    if (error || data.user?.email !== email) return respond(409, { error: "Target mismatch", id });
    const { data: profile, error: profileError } = await sb.from("profiles").select("ativo").eq("id", id).maybeSingle();
    if (profileError || (id !== targets[0][0] && profile?.ativo === true)) return respond(409, { error: "Target now active", id });
    if (id === targets[0][0] && data.user.last_sign_in_at !== "2026-05-28T20:46:52.595723Z") {
      // Compare instants, as the auth API may normalize the timestamp format.
      if (Date.parse(data.user.last_sign_in_at ?? "") !== Date.parse("2026-05-28T20:46:52.595Z")) return respond(409, { error: "Old Gilson account used again" });
    }
  }
  const deleted: string[] = [];
  for (const [id] of targets) {
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) return respond(409, { error: error.message, deleted });
    deleted.push(id);
  }
  return respond(200, { deleted, preserved: preservedId });
});