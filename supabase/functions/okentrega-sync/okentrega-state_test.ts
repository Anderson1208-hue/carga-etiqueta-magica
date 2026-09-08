import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classificarRetornoOkEntrega } from "../_shared/okentrega-state.ts";

Deno.test("HTTP 200 em análise não é aprovação", () => {
  assertEquals(classificarRetornoOkEntrega({ sucessoHttp: true, httpStatus: 200, statusComprovante: null, tentativasAtuais: 0, maxTentativas: 5 }), "aguardando_aprovacao");
});

Deno.test("aprovação e recusa dependem do status definitivo", () => {
  assertEquals(classificarRetornoOkEntrega({ sucessoHttp: true, httpStatus: 200, statusComprovante: "1", tentativasAtuais: 0, maxTentativas: 5 }), "aprovado");
  assertEquals(classificarRetornoOkEntrega({ sucessoHttp: true, httpStatus: 200, statusComprovante: "2", tentativasAtuais: 0, maxTentativas: 5 }), "recusado");
});

Deno.test("HTTP 409 é terminal e exige revisão", () => {
  assertEquals(classificarRetornoOkEntrega({ sucessoHttp: false, httpStatus: 409, tentativasAtuais: 1, maxTentativas: 5 }), "revisao");
});

Deno.test("somente falhas transitórias voltam à fila", () => {
  assertEquals(classificarRetornoOkEntrega({ sucessoHttp: false, httpStatus: 503, tentativasAtuais: 0, maxTentativas: 5 }), "pendente");
  assertEquals(classificarRetornoOkEntrega({ sucessoHttp: false, httpStatus: 400, tentativasAtuais: 0, maxTentativas: 5 }), "erro");
});