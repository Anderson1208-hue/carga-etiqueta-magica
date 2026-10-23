import { describe, expect, it } from "vitest";
import { prepararReenvio } from "../../supabase/functions/_shared/okentrega-reenvio";

describe("Correção de imagem recusada", () => {
  it("só permite reenviar recusadas", () => {
    expect(() => prepararReenvio({ status: "aprovado", payload: { nova_foto_path: "okentrega-correcoes/q/nova.jpg" } }, "q")).toThrow("Somente notas recusadas");
  });
  it("exige anexar uma imagem nova", () => {
    expect(() => prepararReenvio({ status: "recusado", payload: { foto_path: "original.jpg" } }, "q")).toThrow("Anexe uma nova foto");
  });
  it("envia a nova foto e preserva os demais dados sem modificar o original", () => {
    const item = { status: "recusado", payload: { foto_path: "original.jpg", nova_foto_path: "okentrega-correcoes/q/nova.jpg", dtentrega: "2026-10-22T12:00:00-03:00" } };
    expect(prepararReenvio(item, "q")).toEqual({ foto_path: "okentrega-correcoes/q/nova.jpg", dtentrega: "2026-10-22T12:00:00-03:00" });
    expect(item.payload.foto_path).toBe("original.jpg");
  });
  it("não permite imagem de outra nota", () => {
    expect(() => prepararReenvio({ status: "recusado", payload: { nova_foto_path: "okentrega-correcoes/outra/nova.jpg" } }, "q")).toThrow("Anexe uma nova foto");
  });
});