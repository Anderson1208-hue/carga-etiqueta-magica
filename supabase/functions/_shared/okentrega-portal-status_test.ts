import { assertEquals } from "jsr:@std/assert";
import { portalConsultationStatus } from "./okentrega-portal-parser.ts";
Deno.test("aprovado (validação cliente) conta como aprovado", () => assertEquals(portalConsultationStatus(["aprovado (validação cliente)"])?.status, "aprovado"));
Deno.test("registrado continua aprovado", () => assertEquals(portalConsultationStatus("Registrado")?.status, "aprovado"));
Deno.test("em análise continua pendente", () => assertEquals(portalConsultationStatus("Em análise")?.status, "aguardando_aprovacao"));
Deno.test("texto desconhecido não aprova", () => assertEquals(portalConsultationStatus("aprovado parcialmente"), null));
