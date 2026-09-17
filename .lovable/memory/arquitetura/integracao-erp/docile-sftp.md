---
name: Integração Docile (SFTP + canhoto por email)
description: Docile — ocorrência de entrega via SFTP e canhotos por email; conectar por IP 177.153.228.228 (não usar DNS docile.runteccorp.com)
type: feature
---
# Docile — canais de integração

- **Ocorrência de entrega:** enviada via **SFTP** (servidor Hodie / Runtec).
- **Canhotos (comprovantes):** enviados por **email**, não pelo SFTP.

## Mudança comunicada pela Docile (a partir de 28/08)
Nova medida de segurança no servidor Hodie bloqueia conexões SFTP feitas através do DNS
`docile.runteccorp.com`.

- Conectar usando o **IP `177.153.228.228`** na porta SFTP.
- **Não usar** o hostname `docile.runteccorp.com`.

## Pendências para implementar
- Usuário/senha (ou chave) do SFTP Docile — guardar em secrets, nunca em código.
- Pasta de destino no SFTP e layout/nome do arquivo de ocorrência.
- Endereço de email destino dos canhotos e formato esperado (PDF/JPG, 1 nota por email ou lote).
- Confirmar se há liberação de IP de saída necessária do nosso lado.
