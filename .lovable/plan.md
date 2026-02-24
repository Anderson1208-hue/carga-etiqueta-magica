

## Diagnóstico do Problema

O problema é uma **condição de corrida** no `CameraScanner.tsx`. Veja a sequência do código atual:

1. `startNativeScanner()` obtém o stream da câmera
2. Tenta fazer `videoRef.current.srcObject = stream` (linha 80) — mas o `<video>` **ainda não existe no DOM** porque ele só é renderizado quando `cameraActive && useNative` são `true` (linha 257)
3. Só DEPOIS seta `setCameraActive(true)` e `setUseNative(true)` (linhas 83-84) — agora o `<video>` aparece, mas **nunca recebeu o stream**

Resultado: a câmera aparece preta (sem imagem) e o detector nunca lê nada porque `videoRef.current.readyState` fica menor que 2.

## Plano de Correção

### Arquivo: `src/components/conferencia/CameraScanner.tsx`

1. **Renderizar o `<video>` sempre** (com `display: none` quando inativo), para que `videoRef.current` nunca seja null quando o stream for atribuído.

2. **Alternativamente** (abordagem mais limpa): separar a lógica em duas etapas:
   - Primeiro setar os estados `cameraActive` e `useNative` para que o `<video>` renderize
   - Usar um `useEffect` que observa esses estados + o stream para atribuir o `srcObject` ao vídeo quando ambos estiverem prontos

3. **Aumentar resolução da câmera** de volta para `1280x720` — a resolução 640x480 pode ser insuficiente para leitura de códigos de barras em celulares modernos.

4. **Adicionar `autoPlay` ao elemento `<video>`** como fallback para garantir que o vídeo inicie em todos os dispositivos mobile.

### Detalhes Técnicos

A correção principal será:

```text
startNativeScanner():
  1. getUserMedia → salva stream no ref
  2. setCameraActive(true), setUseNative(true)  ← estados primeiro
  3. NÃO tenta setar srcObject aqui

useEffect([cameraActive, useNative]):
  se cameraActive && useNative && streamRef.current && videoRef.current:
    videoRef.current.srcObject = streamRef.current
    videoRef.current.play()
    iniciar loop do BarcodeDetector
```

O `<video>` na seção nativa continuará condicional, mas agora o stream será atribuído **depois** que o elemento existir no DOM.

Também vou:
- Voltar a resolução para `1280x720` para melhor leitura
- Manter o intervalo de 400ms para economia de CPU
- Adicionar log de debug temporário para facilitar diagnóstico futuro

