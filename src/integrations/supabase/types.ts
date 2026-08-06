export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          created_at: string
          created_by: string | null
          data_agendamento: string | null
          id: string
          nf_id: string
          observacao: string | null
          ocorrencia: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_agendamento?: string | null
          id?: string
          nf_id: string
          observacao?: string | null
          ocorrencia?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_agendamento?: string | null
          id?: string
          nf_id?: string
          observacao?: string | null
          ocorrencia?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_monitoramento: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          lido: boolean
          lido_em: string | null
          lido_por: string | null
          longitude: number | null
          mensagem: string
          metadata: Json | null
          monitoramento_parada_id: string | null
          monitoramento_rota_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          lido?: boolean
          lido_em?: string | null
          lido_por?: string | null
          longitude?: number | null
          mensagem: string
          metadata?: Json | null
          monitoramento_parada_id?: string | null
          monitoramento_rota_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          lido?: boolean
          lido_em?: string | null
          lido_por?: string | null
          longitude?: number | null
          mensagem?: string
          metadata?: Json | null
          monitoramento_parada_id?: string | null
          monitoramento_rota_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_monitoramento_monitoramento_parada_id_fkey"
            columns: ["monitoramento_parada_id"]
            isOneToOne: false
            referencedRelation: "monitoramento_paradas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_monitoramento_monitoramento_parada_id_fkey"
            columns: ["monitoramento_parada_id"]
            isOneToOne: false
            referencedRelation: "vw_diagnostico_paradas_v3"
            referencedColumns: ["parada_id"]
          },
          {
            foreignKeyName: "alertas_monitoramento_monitoramento_rota_id_fkey"
            columns: ["monitoramento_rota_id"]
            isOneToOne: false
            referencedRelation: "monitoramento_rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      apk_heartbeats: {
        Row: {
          app_version: string | null
          bateria_pct: number | null
          created_at: string
          id: string
          meta: Json | null
          motorista_user_id: string | null
          otimizacao_bateria: string | null
          permissao_localizacao: string | null
          placa: string
          recebido_em: string
          ultimo_gps_em: string | null
        }
        Insert: {
          app_version?: string | null
          bateria_pct?: number | null
          created_at?: string
          id?: string
          meta?: Json | null
          motorista_user_id?: string | null
          otimizacao_bateria?: string | null
          permissao_localizacao?: string | null
          placa: string
          recebido_em?: string
          ultimo_gps_em?: string | null
        }
        Update: {
          app_version?: string | null
          bateria_pct?: number | null
          created_at?: string
          id?: string
          meta?: Json | null
          motorista_user_id?: string | null
          otimizacao_bateria?: string | null
          permissao_localizacao?: string | null
          placa?: string
          recebido_em?: string
          ultimo_gps_em?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_04: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_05: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_06: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_07: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_08: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_09: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_10: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      baixas_entrega: {
        Row: {
          conferencia_motivo: string | null
          conferencia_status: string | null
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          foto_path: string | null
          id: string
          imagem_ibac_enviada_em: string | null
          imagem_ibac_queue_id: string | null
          imagem_ibac_tentativas: number
          imagem_ibac_ultimo_erro: string | null
          latitude: number | null
          longitude: number | null
          nf_id: string
          observacao: string | null
          ocorrencia: string | null
          recebedor_nome: string | null
          registrado_em: string | null
          registrado_por: string | null
          status: string
          updated_at: string
          validacao_em: string | null
          validacao_em_v1: string | null
          validacao_problemas: Json | null
          validacao_problemas_v1: Json | null
          validacao_score: number | null
          validacao_score_v1: number | null
          validacao_status: string | null
          validacao_status_v1: string | null
          veiculo_id: string
        }
        Insert: {
          conferencia_motivo?: string | null
          conferencia_status?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          foto_path?: string | null
          id?: string
          imagem_ibac_enviada_em?: string | null
          imagem_ibac_queue_id?: string | null
          imagem_ibac_tentativas?: number
          imagem_ibac_ultimo_erro?: string | null
          latitude?: number | null
          longitude?: number | null
          nf_id: string
          observacao?: string | null
          ocorrencia?: string | null
          recebedor_nome?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          status?: string
          updated_at?: string
          validacao_em?: string | null
          validacao_em_v1?: string | null
          validacao_problemas?: Json | null
          validacao_problemas_v1?: Json | null
          validacao_score?: number | null
          validacao_score_v1?: number | null
          validacao_status?: string | null
          validacao_status_v1?: string | null
          veiculo_id: string
        }
        Update: {
          conferencia_motivo?: string | null
          conferencia_status?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          foto_path?: string | null
          id?: string
          imagem_ibac_enviada_em?: string | null
          imagem_ibac_queue_id?: string | null
          imagem_ibac_tentativas?: number
          imagem_ibac_ultimo_erro?: string | null
          latitude?: number | null
          longitude?: number | null
          nf_id?: string
          observacao?: string | null
          ocorrencia?: string | null
          recebedor_nome?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          status?: string
          updated_at?: string
          validacao_em?: string | null
          validacao_em_v1?: string | null
          validacao_problemas?: Json | null
          validacao_problemas_v1?: Json | null
          validacao_score?: number | null
          validacao_score_v1?: number | null
          validacao_status?: string | null
          validacao_status_v1?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baixas_entrega_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baixas_entrega_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      carga_operadores: {
        Row: {
          carga_id: string
          created_at: string
          id: string
          operador_id: string
        }
        Insert: {
          carga_id: string
          created_at?: string
          id?: string
          operador_id: string
        }
        Update: {
          carga_id?: string
          created_at?: string
          id?: string
          operador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carga_operadores_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
        ]
      }
      cargas: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          id: string
          import_batch_id: string | null
          motorista: string
          observacao: string | null
          operador_responsavel: string | null
          placa: string
          status: Database["public"]["Enums"]["load_status"]
          tipo_carga: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          import_batch_id?: string | null
          motorista: string
          observacao?: string | null
          operador_responsavel?: string | null
          placa: string
          status?: Database["public"]["Enums"]["load_status"]
          tipo_carga?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          import_batch_id?: string | null
          motorista?: string
          observacao?: string | null
          operador_responsavel?: string | null
          placa?: string
          status?: Database["public"]["Enums"]["load_status"]
          tipo_carga?: string
          updated_at?: string
        }
        Relationships: []
      }
      cnpj_agenda_automatica: {
        Row: {
          cnpj: string
          created_at: string
          emitente: string | null
          id: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          emitente?: string | null
          id?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          emitente?: string | null
          id?: string
        }
        Relationships: []
      }
      cnpj_envio_canhoto_auto: {
        Row: {
          ativo: boolean
          cnpj: string
          created_at: string
          descricao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj: string
          created_at?: string
          descricao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string
          created_at?: string
          descricao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      componentes_frete_catalogo: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          nome_dacte: string | null
          ordem: number
          tipo_calculo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          nome_dacte?: string | null
          ordem?: number
          tipo_calculo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          nome_dacte?: string | null
          ordem?: number
          tipo_calculo?: string
          updated_at?: string
        }
        Relationships: []
      }
      configuracao_fiscal_emitente: {
        Row: {
          ambiente: string
          ativo: boolean
          bairro: string | null
          cep: string | null
          cfop_inter: string | null
          cfop_intra: string | null
          ciot_api_key: string | null
          ciot_provedor: string | null
          cnae: string | null
          cnpj: string
          codigo_municipio_ibge: string
          complemento: string | null
          created_at: string
          created_by: string | null
          email: string | null
          emissor_api: string
          id: string
          ie: string
          ie_st: string | null
          logradouro: string | null
          municipio: string
          nome_fantasia: string | null
          numero: string | null
          observacao_padrao: string | null
          provedor_ambiente: string | null
          provedor_api_key_homolog: string | null
          provedor_api_key_prod: string | null
          provedor_nome: string | null
          proximo_numero_cte: number
          proximo_numero_mdfe: number
          razao_social: string
          regime_tributario: string
          rntrc: string | null
          seguradora_api_endpoint: string | null
          seguradora_api_key: string | null
          seguradora_apolice: string | null
          seguradora_averbacao_mae: string | null
          seguradora_cnpj: string | null
          seguradora_razao: string | null
          serie_cte: number
          serie_mdfe: number
          telefone: string | null
          tomador_padrao: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          ambiente?: string
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cfop_inter?: string | null
          cfop_intra?: string | null
          ciot_api_key?: string | null
          ciot_provedor?: string | null
          cnae?: string | null
          cnpj: string
          codigo_municipio_ibge: string
          complemento?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          emissor_api?: string
          id?: string
          ie: string
          ie_st?: string | null
          logradouro?: string | null
          municipio: string
          nome_fantasia?: string | null
          numero?: string | null
          observacao_padrao?: string | null
          provedor_ambiente?: string | null
          provedor_api_key_homolog?: string | null
          provedor_api_key_prod?: string | null
          provedor_nome?: string | null
          proximo_numero_cte?: number
          proximo_numero_mdfe?: number
          razao_social: string
          regime_tributario: string
          rntrc?: string | null
          seguradora_api_endpoint?: string | null
          seguradora_api_key?: string | null
          seguradora_apolice?: string | null
          seguradora_averbacao_mae?: string | null
          seguradora_cnpj?: string | null
          seguradora_razao?: string | null
          serie_cte?: number
          serie_mdfe?: number
          telefone?: string | null
          tomador_padrao?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          ambiente?: string
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cfop_inter?: string | null
          cfop_intra?: string | null
          ciot_api_key?: string | null
          ciot_provedor?: string | null
          cnae?: string | null
          cnpj?: string
          codigo_municipio_ibge?: string
          complemento?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          emissor_api?: string
          id?: string
          ie?: string
          ie_st?: string | null
          logradouro?: string | null
          municipio?: string
          nome_fantasia?: string | null
          numero?: string | null
          observacao_padrao?: string | null
          provedor_ambiente?: string | null
          provedor_api_key_homolog?: string | null
          provedor_api_key_prod?: string | null
          provedor_nome?: string | null
          proximo_numero_cte?: number
          proximo_numero_mdfe?: number
          razao_social?: string
          regime_tributario?: string
          rntrc?: string | null
          seguradora_api_endpoint?: string | null
          seguradora_api_key?: string | null
          seguradora_apolice?: string | null
          seguradora_averbacao_mae?: string | null
          seguradora_cnpj?: string | null
          seguradora_razao?: string | null
          serie_cte?: number
          serie_mdfe?: number
          telefone?: string | null
          tomador_padrao?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      convenios_fiscais: {
        Row: {
          aliquota_icms: number | null
          ativo: boolean
          base_legal: string | null
          cfop_forcado: string | null
          cnpj_root_embarcador: string | null
          created_at: string
          cst_icms: string | null
          descricao: string | null
          id: string
          nome: string
          reducao_base: number | null
          texto_infadfisco: string | null
          texto_infcpl: string | null
          uf_destino: string | null
          uf_origem: string | null
          updated_at: string
        }
        Insert: {
          aliquota_icms?: number | null
          ativo?: boolean
          base_legal?: string | null
          cfop_forcado?: string | null
          cnpj_root_embarcador?: string | null
          created_at?: string
          cst_icms?: string | null
          descricao?: string | null
          id?: string
          nome: string
          reducao_base?: number | null
          texto_infadfisco?: string | null
          texto_infcpl?: string | null
          uf_destino?: string | null
          uf_origem?: string | null
          updated_at?: string
        }
        Update: {
          aliquota_icms?: number | null
          ativo?: boolean
          base_legal?: string | null
          cfop_forcado?: string | null
          cnpj_root_embarcador?: string | null
          created_at?: string
          cst_icms?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          reducao_base?: number | null
          texto_infadfisco?: string | null
          texto_infcpl?: string | null
          uf_destino?: string | null
          uf_origem?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ctes: {
        Row: {
          carga_id: string
          chave_cte: string
          chave_nf_referenciada: string | null
          cnpj_emitente: string | null
          created_at: string
          data_emissao: string | null
          id: string
          identificador_interno: string | null
          nf_id: string | null
          numero_cte: string
          numero_nf_referenciada: string | null
          razao_social_emitente: string | null
          tipo_documento: string
          valor_frete: number | null
        }
        Insert: {
          carga_id: string
          chave_cte: string
          chave_nf_referenciada?: string | null
          cnpj_emitente?: string | null
          created_at?: string
          data_emissao?: string | null
          id?: string
          identificador_interno?: string | null
          nf_id?: string | null
          numero_cte: string
          numero_nf_referenciada?: string | null
          razao_social_emitente?: string | null
          tipo_documento?: string
          valor_frete?: number | null
        }
        Update: {
          carga_id?: string
          chave_cte?: string
          chave_nf_referenciada?: string | null
          cnpj_emitente?: string | null
          created_at?: string
          data_emissao?: string | null
          id?: string
          identificador_interno?: string | null
          nf_id?: string | null
          numero_cte?: string
          numero_nf_referenciada?: string | null
          razao_social_emitente?: string | null
          tipo_documento?: string
          valor_frete?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ctes_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ctes_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
        ]
      }
      destinatario_apelidos_busca: {
        Row: {
          cnpj_raiz: string
          created_at: string
          created_by: string | null
          id: string
          nome_busca: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          cnpj_raiz: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome_busca: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          cnpj_raiz?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome_busca?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      destinatario_enderecos: {
        Row: {
          apelido: string | null
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          confianca_coordenada: number | null
          coordenada_atualizada_em: string | null
          coordenada_atualizada_por: string | null
          created_at: string
          destinatario_id: string
          id: string
          latitude: number | null
          logradouro: string | null
          longitude: number | null
          numero: string | null
          observacao: string | null
          origem_coordenada:
            | Database["public"]["Enums"]["origem_coordenada"]
            | null
          principal: boolean
          tipo_endereco: Database["public"]["Enums"]["tipo_endereco"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          confianca_coordenada?: number | null
          coordenada_atualizada_em?: string | null
          coordenada_atualizada_por?: string | null
          created_at?: string
          destinatario_id: string
          id?: string
          latitude?: number | null
          logradouro?: string | null
          longitude?: number | null
          numero?: string | null
          observacao?: string | null
          origem_coordenada?:
            | Database["public"]["Enums"]["origem_coordenada"]
            | null
          principal?: boolean
          tipo_endereco?: Database["public"]["Enums"]["tipo_endereco"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          confianca_coordenada?: number | null
          coordenada_atualizada_em?: string | null
          coordenada_atualizada_por?: string | null
          created_at?: string
          destinatario_id?: string
          id?: string
          latitude?: number | null
          logradouro?: string | null
          longitude?: number | null
          numero?: string | null
          observacao?: string | null
          origem_coordenada?:
            | Database["public"]["Enums"]["origem_coordenada"]
            | null
          principal?: boolean
          tipo_endereco?: Database["public"]["Enums"]["tipo_endereco"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "destinatario_enderecos_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "destinatarios"
            referencedColumns: ["id"]
          },
        ]
      }
      destinatario_restricoes: {
        Row: {
          agendamento_obrigatorio: boolean
          altura_max_veiculo_m: number | null
          created_at: string
          destinatario_id: string
          dias_semana: number[] | null
          documentos_canhoto: string[] | null
          exige_escolta: boolean
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          agendamento_obrigatorio?: boolean
          altura_max_veiculo_m?: number | null
          created_at?: string
          destinatario_id: string
          dias_semana?: number[] | null
          documentos_canhoto?: string[] | null
          exige_escolta?: boolean
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_obrigatorio?: boolean
          altura_max_veiculo_m?: number | null
          created_at?: string
          destinatario_id?: string
          dias_semana?: number[] | null
          documentos_canhoto?: string[] | null
          exige_escolta?: boolean
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "destinatario_restricoes_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: true
            referencedRelation: "destinatarios"
            referencedColumns: ["id"]
          },
        ]
      }
      destinatarios: {
        Row: {
          ativo: boolean
          cnpj_cpf: string
          created_at: string
          created_by: string | null
          id: string
          ie: string | null
          ie_st: string | null
          indicador_ie: number | null
          nome_fantasia: string | null
          observacao: string | null
          orgao_publico: boolean
          raio_geofence_metros: number | null
          rascunho: boolean
          razao_social: string
          regime_tributario: string | null
          suframa: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj_cpf: string
          created_at?: string
          created_by?: string | null
          id?: string
          ie?: string | null
          ie_st?: string | null
          indicador_ie?: number | null
          nome_fantasia?: string | null
          observacao?: string | null
          orgao_publico?: boolean
          raio_geofence_metros?: number | null
          rascunho?: boolean
          razao_social: string
          regime_tributario?: string | null
          suframa?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj_cpf?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ie?: string | null
          ie_st?: string | null
          indicador_ie?: number | null
          nome_fantasia?: string | null
          observacao?: string | null
          orgao_publico?: boolean
          raio_geofence_metros?: number | null
          rascunho?: boolean
          razao_social?: string
          regime_tributario?: string | null
          suframa?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      embarcador_regiao_cidades: {
        Row: {
          codigo_municipio_ibge: string | null
          created_at: string
          id: string
          municipio: string
          municipio_norm: string | null
          regiao_id: string
          uf: string
        }
        Insert: {
          codigo_municipio_ibge?: string | null
          created_at?: string
          id?: string
          municipio: string
          municipio_norm?: string | null
          regiao_id: string
          uf: string
        }
        Update: {
          codigo_municipio_ibge?: string | null
          created_at?: string
          id?: string
          municipio?: string
          municipio_norm?: string | null
          regiao_id?: string
          uf?: string
        }
        Relationships: [
          {
            foreignKeyName: "embarcador_regiao_cidades_regiao_id_fkey"
            columns: ["regiao_id"]
            isOneToOne: false
            referencedRelation: "embarcador_regioes"
            referencedColumns: ["id"]
          },
        ]
      }
      embarcador_regiao_sla: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          observacao: string | null
          prazo_dias_uteis: number
          regiao_id: string
          updated_at: string
          vigente_ate: string | null
          vigente_de: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          prazo_dias_uteis: number
          regiao_id: string
          updated_at?: string
          vigente_ate?: string | null
          vigente_de?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          prazo_dias_uteis?: number
          regiao_id?: string
          updated_at?: string
          vigente_ate?: string | null
          vigente_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "embarcador_regiao_sla_regiao_id_fkey"
            columns: ["regiao_id"]
            isOneToOne: false
            referencedRelation: "embarcador_regioes"
            referencedColumns: ["id"]
          },
        ]
      }
      embarcador_regiao_tarifas: {
        Row: {
          adicional_cte: number | null
          advalorem_percentual: number | null
          ativo: boolean
          componentes_extra: Json
          created_at: string
          created_by: string | null
          frete_minimo: number | null
          gris_percentual: number | null
          id: string
          observacao: string | null
          pedagio_por_100kg: number | null
          regiao_id: string
          tarifa_fixa: number | null
          tarifa_por_ton: number | null
          updated_at: string
          vigente_ate: string | null
          vigente_de: string
        }
        Insert: {
          adicional_cte?: number | null
          advalorem_percentual?: number | null
          ativo?: boolean
          componentes_extra?: Json
          created_at?: string
          created_by?: string | null
          frete_minimo?: number | null
          gris_percentual?: number | null
          id?: string
          observacao?: string | null
          pedagio_por_100kg?: number | null
          regiao_id: string
          tarifa_fixa?: number | null
          tarifa_por_ton?: number | null
          updated_at?: string
          vigente_ate?: string | null
          vigente_de?: string
        }
        Update: {
          adicional_cte?: number | null
          advalorem_percentual?: number | null
          ativo?: boolean
          componentes_extra?: Json
          created_at?: string
          created_by?: string | null
          frete_minimo?: number | null
          gris_percentual?: number | null
          id?: string
          observacao?: string | null
          pedagio_por_100kg?: number | null
          regiao_id?: string
          tarifa_fixa?: number | null
          tarifa_por_ton?: number | null
          updated_at?: string
          vigente_ate?: string | null
          vigente_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "embarcador_regiao_tarifas_regiao_id_fkey"
            columns: ["regiao_id"]
            isOneToOne: false
            referencedRelation: "embarcador_regioes"
            referencedColumns: ["id"]
          },
        ]
      }
      embarcador_regioes: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          embarcador_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          embarcador_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          embarcador_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "embarcador_regioes_embarcador_id_fkey"
            columns: ["embarcador_id"]
            isOneToOne: false
            referencedRelation: "embarcadores"
            referencedColumns: ["id"]
          },
        ]
      }
      embarcadores: {
        Row: {
          ativo: boolean
          centro_custo: string | null
          cnae: string | null
          cnpj: string
          codigo_municipio_ibge: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string
          created_by: string | null
          id: string
          ie: string | null
          ie_st: string | null
          indicador_ie: number | null
          municipio: string | null
          nome_fantasia: string | null
          observacao_operacional: string | null
          rascunho: boolean
          razao_social: string
          regime_tributario: string | null
          sla_padrao_horas: number | null
          suframa: string | null
          tabela_frete_id: string | null
          tipo_operacao_padrao: string | null
          tomador_servico: number | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          centro_custo?: string | null
          cnae?: string | null
          cnpj: string
          codigo_municipio_ibge?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ie?: string | null
          ie_st?: string | null
          indicador_ie?: number | null
          municipio?: string | null
          nome_fantasia?: string | null
          observacao_operacional?: string | null
          rascunho?: boolean
          razao_social: string
          regime_tributario?: string | null
          sla_padrao_horas?: number | null
          suframa?: string | null
          tabela_frete_id?: string | null
          tipo_operacao_padrao?: string | null
          tomador_servico?: number | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          centro_custo?: string | null
          cnae?: string | null
          cnpj?: string
          codigo_municipio_ibge?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ie?: string | null
          ie_st?: string | null
          indicador_ie?: number | null
          municipio?: string | null
          nome_fantasia?: string | null
          observacao_operacional?: string | null
          rascunho?: boolean
          razao_social?: string
          regime_tributario?: string | null
          sla_padrao_horas?: number | null
          suframa?: string | null
          tabela_frete_id?: string | null
          tipo_operacao_padrao?: string | null
          tomador_servico?: number | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "embarcadores_tabela_frete_id_fkey"
            columns: ["tabela_frete_id"]
            isOneToOne: false
            referencedRelation: "tabelas_frete"
            referencedColumns: ["id"]
          },
        ]
      }
      etiquetas: {
        Row: {
          c_prod: string
          carga_id: string
          chave_acesso: string
          conferido_em: string | null
          conferido_interno_em: string | null
          conferido_interno_por: string | null
          conferido_por: string | null
          created_at: string
          divergencia_em: string | null
          divergencia_motivo: string | null
          divergencia_por: string | null
          id: string
          nf_id: string
          numero_nf: string
          qr_payload: string
          seq: number
          status: Database["public"]["Enums"]["label_status"]
          total: number
          x_prod: string
        }
        Insert: {
          c_prod: string
          carga_id: string
          chave_acesso: string
          conferido_em?: string | null
          conferido_interno_em?: string | null
          conferido_interno_por?: string | null
          conferido_por?: string | null
          created_at?: string
          divergencia_em?: string | null
          divergencia_motivo?: string | null
          divergencia_por?: string | null
          id?: string
          nf_id: string
          numero_nf: string
          qr_payload: string
          seq: number
          status?: Database["public"]["Enums"]["label_status"]
          total: number
          x_prod: string
        }
        Update: {
          c_prod?: string
          carga_id?: string
          chave_acesso?: string
          conferido_em?: string | null
          conferido_interno_em?: string | null
          conferido_interno_por?: string | null
          conferido_por?: string | null
          created_at?: string
          divergencia_em?: string | null
          divergencia_motivo?: string | null
          divergencia_por?: string | null
          id?: string
          nf_id?: string
          numero_nf?: string
          qr_payload?: string
          seq?: number
          status?: Database["public"]["Enums"]["label_status"]
          total?: number
          x_prod?: string
        }
        Relationships: [
          {
            foreignKeyName: "etiquetas_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etiquetas_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          address_input: string
          cache_key: string
          created_at: string
          formatted_address: string | null
          hit_count: number
          id: string
          latitude: number
          location_type: string | null
          longitude: number
          place_id: string | null
          source: string
          updated_at: string
        }
        Insert: {
          address_input: string
          cache_key: string
          created_at?: string
          formatted_address?: string | null
          hit_count?: number
          id?: string
          latitude: number
          location_type?: string | null
          longitude: number
          place_id?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          address_input?: string
          cache_key?: string
          created_at?: string
          formatted_address?: string | null
          hit_count?: number
          id?: string
          latitude?: number
          location_type?: string | null
          longitude?: number
          place_id?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      ibac_alertas: {
        Row: {
          created_at: string
          id: string
          lido: boolean
          lido_em: string | null
          lido_por: string | null
          limite: number | null
          mensagem: string
          tipo: string
          valor_atual: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          lido?: boolean
          lido_em?: string | null
          lido_por?: string | null
          limite?: number | null
          mensagem: string
          tipo: string
          valor_atual?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          lido?: boolean
          lido_em?: string | null
          lido_por?: string | null
          limite?: number | null
          mensagem?: string
          tipo?: string
          valor_atual?: number | null
        }
        Relationships: []
      }
      ibac_config_alertas: {
        Row: {
          ativo: boolean
          cooldown_minutos: number
          id: boolean
          limite_erros_15min: number
          limite_pendentes: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cooldown_minutos?: number
          id?: boolean
          limite_erros_15min?: number
          limite_pendentes?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cooldown_minutos?: number
          id?: boolean
          limite_erros_15min?: number
          limite_pendentes?: number
          updated_at?: string
        }
        Relationships: []
      }
      ibac_config_envio: {
        Row: {
          codigo_evento_entrega: string
          created_at: string
          envio_ativo: boolean
          id: boolean
          max_imagem_kb: number
          modo_imagem: string
          updated_at: string
          whitelist_nfs: string[]
        }
        Insert: {
          codigo_evento_entrega?: string
          created_at?: string
          envio_ativo?: boolean
          id?: boolean
          max_imagem_kb?: number
          modo_imagem?: string
          updated_at?: string
          whitelist_nfs?: string[]
        }
        Update: {
          codigo_evento_entrega?: string
          created_at?: string
          envio_ativo?: boolean
          id?: boolean
          max_imagem_kb?: number
          modo_imagem?: string
          updated_at?: string
          whitelist_nfs?: string[]
        }
        Relationships: []
      }
      ibac_config_retry: {
        Row: {
          ativo: boolean
          backoff_base_segundos: number
          backoff_max_segundos: number
          id: boolean
          max_tentativas: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          backoff_base_segundos?: number
          backoff_max_segundos?: number
          id?: boolean
          max_tentativas?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          backoff_base_segundos?: number
          backoff_max_segundos?: number
          id?: boolean
          max_tentativas?: number
          updated_at?: string
        }
        Relationships: []
      }
      ibac_de_para_eventos: {
        Row: {
          ativo: boolean
          codigo_ibac: string | null
          created_at: string
          descricao_ibac: string | null
          descricao_interna: string
          evento_interno: string
          id: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_ibac?: string | null
          created_at?: string
          descricao_ibac?: string | null
          descricao_interna: string
          evento_interno: string
          id?: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_ibac?: string | null
          created_at?: string
          descricao_ibac?: string | null
          descricao_interna?: string
          evento_interno?: string
          id?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ibac_eventos_queue: {
        Row: {
          baixa_id: string | null
          carga_id: string | null
          chave_acesso: string | null
          created_at: string
          enviado_em: string | null
          erro_mensagem: string | null
          evento_interno: string
          id: string
          nf_id: string | null
          payload: Json
          status: string
          tentativas: number
          ultima_tentativa_em: string | null
          updated_at: string
        }
        Insert: {
          baixa_id?: string | null
          carga_id?: string | null
          chave_acesso?: string | null
          created_at?: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          evento_interno: string
          id?: string
          nf_id?: string | null
          payload?: Json
          status?: string
          tentativas?: number
          ultima_tentativa_em?: string | null
          updated_at?: string
        }
        Update: {
          baixa_id?: string | null
          carga_id?: string | null
          chave_acesso?: string | null
          created_at?: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          evento_interno?: string
          id?: string
          nf_id?: string | null
          payload?: Json
          status?: string
          tentativas?: number
          ultima_tentativa_em?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ibac_log_envios: {
        Row: {
          created_at: string
          duracao_ms: number | null
          endpoint: string | null
          id: string
          queue_id: string | null
          request_body: Json | null
          response_body: Json | null
          response_status: number | null
          sucesso: boolean
        }
        Insert: {
          created_at?: string
          duracao_ms?: number | null
          endpoint?: string | null
          id?: string
          queue_id?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_status?: number | null
          sucesso?: boolean
        }
        Update: {
          created_at?: string
          duracao_ms?: number | null
          endpoint?: string | null
          id?: string
          queue_id?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_status?: number | null
          sucesso?: boolean
        }
        Relationships: []
      }
      itens_nf: {
        Row: {
          c_prod: string
          created_at: string
          id: string
          nf_id: string
          peso_bruto: number | null
          peso_liquido: number | null
          q_com: number
          u_com: string
          x_prod: string
        }
        Insert: {
          c_prod: string
          created_at?: string
          id?: string
          nf_id: string
          peso_bruto?: number | null
          peso_liquido?: number | null
          q_com: number
          u_com: string
          x_prod: string
        }
        Update: {
          c_prod?: string
          created_at?: string
          id?: string
          nf_id?: string
          peso_bruto?: number | null
          peso_liquido?: number | null
          q_com?: number
          u_com?: string
          x_prod?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_nf_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoramento_config: {
        Row: {
          batch_max_posicoes: number
          batch_sync_ativo: boolean
          distance_filter_metros: number
          geofence_ativo: boolean
          id: string
          intervalo_critico_segundos: number
          intervalo_padrao_segundos: number
          raio_aproximacao_metros: number
          raio_padrao_metros: number
          tempo_max_sem_atualizacao_min: number
          tempo_maximo_cliente_min: number
          tempo_minimo_atendimento_min: number
          tolerancia_gps_metros: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batch_max_posicoes?: number
          batch_sync_ativo?: boolean
          distance_filter_metros?: number
          geofence_ativo?: boolean
          id?: string
          intervalo_critico_segundos?: number
          intervalo_padrao_segundos?: number
          raio_aproximacao_metros?: number
          raio_padrao_metros?: number
          tempo_max_sem_atualizacao_min?: number
          tempo_maximo_cliente_min?: number
          tempo_minimo_atendimento_min?: number
          tolerancia_gps_metros?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batch_max_posicoes?: number
          batch_sync_ativo?: boolean
          distance_filter_metros?: number
          geofence_ativo?: boolean
          id?: string
          intervalo_critico_segundos?: number
          intervalo_padrao_segundos?: number
          raio_aproximacao_metros?: number
          raio_padrao_metros?: number
          tempo_max_sem_atualizacao_min?: number
          tempo_maximo_cliente_min?: number
          tempo_minimo_atendimento_min?: number
          tolerancia_gps_metros?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      monitoramento_paradas: {
        Row: {
          cnpj_destinatario: string | null
          confianca_coordenada: number | null
          created_at: string
          endereco_completo: string | null
          horario_chegada: string | null
          horario_previsto: string | null
          horario_saida: string | null
          id: string
          is_excecao: boolean
          justificativa: string | null
          justificativa_em: string | null
          justificativa_por: string | null
          justificativa_tipo: string | null
          latitude: number | null
          longitude: number | null
          monitoramento_rota_id: string
          ordem: number
          origem_coordenada:
            | Database["public"]["Enums"]["origem_coordenada"]
            | null
          peso_total_kg: number | null
          raio_geofence_metros: number
          razao_social: string | null
          status: string
          tempo_permanencia_min: number | null
          total_caixas: number | null
          total_nfs: number | null
          volume_total_m3: number | null
        }
        Insert: {
          cnpj_destinatario?: string | null
          confianca_coordenada?: number | null
          created_at?: string
          endereco_completo?: string | null
          horario_chegada?: string | null
          horario_previsto?: string | null
          horario_saida?: string | null
          id?: string
          is_excecao?: boolean
          justificativa?: string | null
          justificativa_em?: string | null
          justificativa_por?: string | null
          justificativa_tipo?: string | null
          latitude?: number | null
          longitude?: number | null
          monitoramento_rota_id: string
          ordem: number
          origem_coordenada?:
            | Database["public"]["Enums"]["origem_coordenada"]
            | null
          peso_total_kg?: number | null
          raio_geofence_metros?: number
          razao_social?: string | null
          status?: string
          tempo_permanencia_min?: number | null
          total_caixas?: number | null
          total_nfs?: number | null
          volume_total_m3?: number | null
        }
        Update: {
          cnpj_destinatario?: string | null
          confianca_coordenada?: number | null
          created_at?: string
          endereco_completo?: string | null
          horario_chegada?: string | null
          horario_previsto?: string | null
          horario_saida?: string | null
          id?: string
          is_excecao?: boolean
          justificativa?: string | null
          justificativa_em?: string | null
          justificativa_por?: string | null
          justificativa_tipo?: string | null
          latitude?: number | null
          longitude?: number | null
          monitoramento_rota_id?: string
          ordem?: number
          origem_coordenada?:
            | Database["public"]["Enums"]["origem_coordenada"]
            | null
          peso_total_kg?: number | null
          raio_geofence_metros?: number
          razao_social?: string | null
          status?: string
          tempo_permanencia_min?: number | null
          total_caixas?: number | null
          total_nfs?: number | null
          volume_total_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoramento_paradas_monitoramento_rota_id_fkey"
            columns: ["monitoramento_rota_id"]
            isOneToOne: false
            referencedRelation: "monitoramento_rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoramento_rotas: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          id: string
          motorista: string | null
          paradas_concluidas: number
          placa: string
          status: string
          total_paradas: number
          ultima_atualizacao: string | null
          ultima_lat: number | null
          ultima_lng: number | null
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          motorista?: string | null
          paradas_concluidas?: number
          placa: string
          status?: string
          total_paradas?: number
          ultima_atualizacao?: string | null
          ultima_lat?: number | null
          ultima_lng?: number | null
          veiculo_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          motorista?: string | null
          paradas_concluidas?: number
          placa?: string
          status?: string
          total_paradas?: number
          ultima_atualizacao?: string | null
          ultima_lat?: number | null
          ultima_lng?: number | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoramento_rotas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      motoristas: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          cnh_categoria: string | null
          cnh_numero: string | null
          cnh_validade: string | null
          conta: string | null
          cpf: string
          created_at: string
          created_by: string | null
          eh_tac: boolean
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          pix_chave: string | null
          pix_tipo: string | null
          rntrc: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          cnh_categoria?: string | null
          cnh_numero?: string | null
          cnh_validade?: string | null
          conta?: string | null
          cpf: string
          created_at?: string
          created_by?: string | null
          eh_tac?: boolean
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          pix_chave?: string | null
          pix_tipo?: string | null
          rntrc?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          cnh_categoria?: string | null
          cnh_numero?: string | null
          cnh_validade?: string | null
          conta?: string | null
          cpf?: string
          created_at?: string
          created_by?: string | null
          eh_tac?: boolean
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          pix_chave?: string | null
          pix_tipo?: string | null
          rntrc?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nf_enderecamento: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          nf_id: string
          posicao: string
          principal: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          nf_id: string
          posicao: string
          principal?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          nf_id?: string
          posicao?: string
          principal?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      nf_eventos: {
        Row: {
          ator_id: string | null
          ator_nome: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          nf_id: string
          ocorrido_em: string
          origem: string
          payload: Json
          tipo: string
        }
        Insert: {
          ator_id?: string | null
          ator_nome?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          nf_id: string
          ocorrido_em?: string
          origem?: string
          payload?: Json
          tipo: string
        }
        Update: {
          ator_id?: string | null
          ator_nome?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          nf_id?: string
          ocorrido_em?: string
          origem?: string
          payload?: Json
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "nf_eventos_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          carga_id: string
          chave_acesso: string
          cnpj_destinatario: string | null
          cnpj_emitente: string
          created_at: string
          data_emissao: string | null
          dest_bairro: string | null
          dest_cep: string | null
          dest_cidade: string | null
          dest_logradouro: string | null
          dest_numero: string | null
          dest_razao_social: string | null
          dest_uf: string | null
          id: string
          numero_nf: string
          pernoite: boolean
          pernoite_em: string | null
          peso_bruto: number | null
          peso_liquido: number | null
          razao_social_emitente: string
          serie: string | null
          status_entrega: string
          valor_nf: number | null
          volume_m3: number | null
        }
        Insert: {
          carga_id: string
          chave_acesso: string
          cnpj_destinatario?: string | null
          cnpj_emitente: string
          created_at?: string
          data_emissao?: string | null
          dest_bairro?: string | null
          dest_cep?: string | null
          dest_cidade?: string | null
          dest_logradouro?: string | null
          dest_numero?: string | null
          dest_razao_social?: string | null
          dest_uf?: string | null
          id?: string
          numero_nf: string
          pernoite?: boolean
          pernoite_em?: string | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          razao_social_emitente: string
          serie?: string | null
          status_entrega?: string
          valor_nf?: number | null
          volume_m3?: number | null
        }
        Update: {
          carga_id?: string
          chave_acesso?: string
          cnpj_destinatario?: string | null
          cnpj_emitente?: string
          created_at?: string
          data_emissao?: string | null
          dest_bairro?: string | null
          dest_cep?: string | null
          dest_cidade?: string | null
          dest_logradouro?: string | null
          dest_numero?: string | null
          dest_razao_social?: string | null
          dest_uf?: string | null
          id?: string
          numero_nf?: string
          pernoite?: boolean
          pernoite_em?: string | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          razao_social_emitente?: string
          serie?: string | null
          status_entrega?: string
          valor_nf?: number | null
          volume_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
        ]
      }
      posicoes_gps: {
        Row: {
          accuracy: number | null
          client_ts: string | null
          heartbeat: boolean
          id: string
          latitude: number
          longitude: number
          monitoramento_rota_id: string
          registrado_em: string
          source: string
        }
        Insert: {
          accuracy?: number | null
          client_ts?: string | null
          heartbeat?: boolean
          id?: string
          latitude: number
          longitude: number
          monitoramento_rota_id: string
          registrado_em?: string
          source?: string
        }
        Update: {
          accuracy?: number | null
          client_ts?: string | null
          heartbeat?: boolean
          id?: string
          latitude?: number
          longitude?: number
          monitoramento_rota_id?: string
          registrado_em?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "posicoes_gps_monitoramento_rota_id_fkey"
            columns: ["monitoramento_rota_id"]
            isOneToOne: false
            referencedRelation: "monitoramento_rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      prefatura_auditoria: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json | null
          id: string
          prefatura_id: string
          prefatura_item_id: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          prefatura_id: string
          prefatura_item_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          prefatura_id?: string
          prefatura_item_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prefatura_auditoria_prefatura_id_fkey"
            columns: ["prefatura_id"]
            isOneToOne: false
            referencedRelation: "prefaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prefatura_auditoria_prefatura_item_id_fkey"
            columns: ["prefatura_item_id"]
            isOneToOne: false
            referencedRelation: "prefatura_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      prefatura_conciliacao: {
        Row: {
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          cte_id: string | null
          divergencias: Json
          id: string
          matched_by: string | null
          nf_id: string | null
          observacao_manual: string | null
          prefatura_id: string
          prefatura_item_id: string
          status_conciliacao: string
          tolerancia_aplicada: Json | null
          updated_at: string
        }
        Insert: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          cte_id?: string | null
          divergencias?: Json
          id?: string
          matched_by?: string | null
          nf_id?: string | null
          observacao_manual?: string | null
          prefatura_id: string
          prefatura_item_id: string
          status_conciliacao?: string
          tolerancia_aplicada?: Json | null
          updated_at?: string
        }
        Update: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          cte_id?: string | null
          divergencias?: Json
          id?: string
          matched_by?: string | null
          nf_id?: string | null
          observacao_manual?: string | null
          prefatura_id?: string
          prefatura_item_id?: string
          status_conciliacao?: string
          tolerancia_aplicada?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prefatura_conciliacao_prefatura_id_fkey"
            columns: ["prefatura_id"]
            isOneToOne: false
            referencedRelation: "prefaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prefatura_conciliacao_prefatura_item_id_fkey"
            columns: ["prefatura_item_id"]
            isOneToOne: true
            referencedRelation: "prefatura_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      prefatura_itens: {
        Row: {
          chave_acesso_cliente: string | null
          cnpj_destinatario_cliente: string | null
          cnpj_emitente_cliente: string | null
          created_at: string
          data_emissao_cliente: string | null
          documento_transporte_cliente: string | null
          id: string
          linha_arquivo: number | null
          numero_nf_cliente: string | null
          peso_cliente: number | null
          prefatura_id: string
          raw_jsonb: Json | null
          referencia_interna_cliente: string | null
          serie_cliente: string | null
          valor_frete_cliente: number | null
          valor_nf_cliente: number | null
          volumes_cliente: number | null
        }
        Insert: {
          chave_acesso_cliente?: string | null
          cnpj_destinatario_cliente?: string | null
          cnpj_emitente_cliente?: string | null
          created_at?: string
          data_emissao_cliente?: string | null
          documento_transporte_cliente?: string | null
          id?: string
          linha_arquivo?: number | null
          numero_nf_cliente?: string | null
          peso_cliente?: number | null
          prefatura_id: string
          raw_jsonb?: Json | null
          referencia_interna_cliente?: string | null
          serie_cliente?: string | null
          valor_frete_cliente?: number | null
          valor_nf_cliente?: number | null
          volumes_cliente?: number | null
        }
        Update: {
          chave_acesso_cliente?: string | null
          cnpj_destinatario_cliente?: string | null
          cnpj_emitente_cliente?: string | null
          created_at?: string
          data_emissao_cliente?: string | null
          documento_transporte_cliente?: string | null
          id?: string
          linha_arquivo?: number | null
          numero_nf_cliente?: string | null
          peso_cliente?: number | null
          prefatura_id?: string
          raw_jsonb?: Json | null
          referencia_interna_cliente?: string | null
          serie_cliente?: string | null
          valor_frete_cliente?: number | null
          valor_nf_cliente?: number | null
          volumes_cliente?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prefatura_itens_prefatura_id_fkey"
            columns: ["prefatura_id"]
            isOneToOne: false
            referencedRelation: "prefaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      prefaturas: {
        Row: {
          arquivo_origem_nome: string | null
          cliente_cnpj: string
          cliente_nome: string | null
          created_at: string
          criado_por: string | null
          data_recebimento: string
          id: string
          import_batch_id: string | null
          numero_prefatura_cliente: string | null
          observacao: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          status: string
          total_itens: number
          total_valor_frete_cliente: number
          total_valor_nf_cliente: number
          updated_at: string
        }
        Insert: {
          arquivo_origem_nome?: string | null
          cliente_cnpj: string
          cliente_nome?: string | null
          created_at?: string
          criado_por?: string | null
          data_recebimento?: string
          id?: string
          import_batch_id?: string | null
          numero_prefatura_cliente?: string | null
          observacao?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          total_itens?: number
          total_valor_frete_cliente?: number
          total_valor_nf_cliente?: number
          updated_at?: string
        }
        Update: {
          arquivo_origem_nome?: string | null
          cliente_cnpj?: string
          cliente_nome?: string | null
          created_at?: string
          criado_por?: string | null
          data_recebimento?: string
          id?: string
          import_batch_id?: string | null
          numero_prefatura_cliente?: string | null
          observacao?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          total_itens?: number
          total_valor_frete_cliente?: number
          total_valor_nf_cliente?: number
          updated_at?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          altura_mm: number | null
          altura_pallet_mm: number | null
          ativo: boolean
          caixas_por_pallet: number | null
          camadas: number | null
          categoria: string | null
          cest: string | null
          classe_risco: string | null
          cnpj_embarcador: string | null
          codigo: string
          codigo_alternativo: string | null
          comprimento_mm: number | null
          controla_lote: boolean
          controla_validade: boolean
          created_at: string
          created_by: string | null
          descricao: string
          dun14: string | null
          ean_mcu: string | null
          ean_rsu: string | null
          ean_tdu: string | null
          embarcador_id: string | null
          empilhamento_max: number | null
          empilhavel: boolean
          faixa_temperatura: string
          fragil: boolean
          hierarquia_produto: string | null
          id: string
          largura_mm: number | null
          lastro: number | null
          marca: string | null
          ncm: string | null
          observacao: string | null
          onu_numero: string | null
          origem_cadastro: string
          peso_bruto_cx_kg: number | null
          peso_bruto_un_kg: number | null
          peso_liquido_cx_kg: number | null
          peso_pallet_kg: number | null
          produto_perigoso: boolean
          qtd_mcu_por_tdu: number | null
          qtd_rsu_por_tdu: number | null
          rascunho: boolean
          regra_giro: string
          segmento: string | null
          sensivel_furto: boolean
          shelf_life_dias: number | null
          shelf_life_min_expedicao_dias: number | null
          shelf_life_min_recebimento_dias: number | null
          status_comercial: string | null
          temperatura_max_c: number | null
          temperatura_min_c: number | null
          tipo_pallet: string | null
          unidade: string | null
          updated_at: string
          valor_unitario_ref: number | null
          volume_calculado: boolean
          volume_m3: number | null
        }
        Insert: {
          altura_mm?: number | null
          altura_pallet_mm?: number | null
          ativo?: boolean
          caixas_por_pallet?: number | null
          camadas?: number | null
          categoria?: string | null
          cest?: string | null
          classe_risco?: string | null
          cnpj_embarcador?: string | null
          codigo: string
          codigo_alternativo?: string | null
          comprimento_mm?: number | null
          controla_lote?: boolean
          controla_validade?: boolean
          created_at?: string
          created_by?: string | null
          descricao: string
          dun14?: string | null
          ean_mcu?: string | null
          ean_rsu?: string | null
          ean_tdu?: string | null
          embarcador_id?: string | null
          empilhamento_max?: number | null
          empilhavel?: boolean
          faixa_temperatura?: string
          fragil?: boolean
          hierarquia_produto?: string | null
          id?: string
          largura_mm?: number | null
          lastro?: number | null
          marca?: string | null
          ncm?: string | null
          observacao?: string | null
          onu_numero?: string | null
          origem_cadastro?: string
          peso_bruto_cx_kg?: number | null
          peso_bruto_un_kg?: number | null
          peso_liquido_cx_kg?: number | null
          peso_pallet_kg?: number | null
          produto_perigoso?: boolean
          qtd_mcu_por_tdu?: number | null
          qtd_rsu_por_tdu?: number | null
          rascunho?: boolean
          regra_giro?: string
          segmento?: string | null
          sensivel_furto?: boolean
          shelf_life_dias?: number | null
          shelf_life_min_expedicao_dias?: number | null
          shelf_life_min_recebimento_dias?: number | null
          status_comercial?: string | null
          temperatura_max_c?: number | null
          temperatura_min_c?: number | null
          tipo_pallet?: string | null
          unidade?: string | null
          updated_at?: string
          valor_unitario_ref?: number | null
          volume_calculado?: boolean
          volume_m3?: number | null
        }
        Update: {
          altura_mm?: number | null
          altura_pallet_mm?: number | null
          ativo?: boolean
          caixas_por_pallet?: number | null
          camadas?: number | null
          categoria?: string | null
          cest?: string | null
          classe_risco?: string | null
          cnpj_embarcador?: string | null
          codigo?: string
          codigo_alternativo?: string | null
          comprimento_mm?: number | null
          controla_lote?: boolean
          controla_validade?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string
          dun14?: string | null
          ean_mcu?: string | null
          ean_rsu?: string | null
          ean_tdu?: string | null
          embarcador_id?: string | null
          empilhamento_max?: number | null
          empilhavel?: boolean
          faixa_temperatura?: string
          fragil?: boolean
          hierarquia_produto?: string | null
          id?: string
          largura_mm?: number | null
          lastro?: number | null
          marca?: string | null
          ncm?: string | null
          observacao?: string | null
          onu_numero?: string | null
          origem_cadastro?: string
          peso_bruto_cx_kg?: number | null
          peso_bruto_un_kg?: number | null
          peso_liquido_cx_kg?: number | null
          peso_pallet_kg?: number | null
          produto_perigoso?: boolean
          qtd_mcu_por_tdu?: number | null
          qtd_rsu_por_tdu?: number | null
          rascunho?: boolean
          regra_giro?: string
          segmento?: string | null
          sensivel_furto?: boolean
          shelf_life_dias?: number | null
          shelf_life_min_expedicao_dias?: number | null
          shelf_life_min_recebimento_dias?: number | null
          status_comercial?: string | null
          temperatura_max_c?: number | null
          temperatura_min_c?: number | null
          tipo_pallet?: string | null
          unidade?: string | null
          updated_at?: string
          valor_unitario_ref?: number | null
          volume_calculado?: boolean
          volume_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_embarcador_id_fkey"
            columns: ["embarcador_id"]
            isOneToOne: false
            referencedRelation: "embarcadores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          pode_divergencia: boolean
          promovido_por: string | null
          role: Database["public"]["Enums"]["app_role"]
          role_anterior: Database["public"]["Enums"]["app_role"] | null
          role_expira_em: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          pode_divergencia?: boolean
          promovido_por?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          role_anterior?: Database["public"]["Enums"]["app_role"] | null
          role_expira_em?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          pode_divergencia?: boolean
          promovido_por?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          role_anterior?: Database["public"]["Enums"]["app_role"] | null
          role_expira_em?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      roteirizacao_paradas: {
        Row: {
          cnpj_destinatario: string
          confianca_coordenada: number | null
          distancia_anterior_km: number | null
          endereco_completo: string | null
          id: string
          latitude: number | null
          longitude: number | null
          ordem: number
          origem_coordenada:
            | Database["public"]["Enums"]["origem_coordenada"]
            | null
          peso_total_kg: number | null
          razao_social: string | null
          roteirizacao_id: string
          tempo_anterior_min: number | null
          total_caixas: number | null
          total_nfs: number | null
          volume_total_m3: number | null
        }
        Insert: {
          cnpj_destinatario: string
          confianca_coordenada?: number | null
          distancia_anterior_km?: number | null
          endereco_completo?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          ordem: number
          origem_coordenada?:
            | Database["public"]["Enums"]["origem_coordenada"]
            | null
          peso_total_kg?: number | null
          razao_social?: string | null
          roteirizacao_id: string
          tempo_anterior_min?: number | null
          total_caixas?: number | null
          total_nfs?: number | null
          volume_total_m3?: number | null
        }
        Update: {
          cnpj_destinatario?: string
          confianca_coordenada?: number | null
          distancia_anterior_km?: number | null
          endereco_completo?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          ordem?: number
          origem_coordenada?:
            | Database["public"]["Enums"]["origem_coordenada"]
            | null
          peso_total_kg?: number | null
          razao_social?: string | null
          roteirizacao_id?: string
          tempo_anterior_min?: number | null
          total_caixas?: number | null
          total_nfs?: number | null
          volume_total_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "roteirizacao_paradas_roteirizacao_id_fkey"
            columns: ["roteirizacao_id"]
            isOneToOne: false
            referencedRelation: "roteirizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      roteirizacoes: {
        Row: {
          carga_id: string
          created_at: string
          created_by: string | null
          distancia_total_km: number | null
          id: string
          peso_total_kg: number | null
          ponto_inicial_lat: number | null
          ponto_inicial_lng: number | null
          ponto_inicial_nome: string | null
          status: string | null
          tempo_estimado_min: number | null
          volume_total_m3: number | null
        }
        Insert: {
          carga_id: string
          created_at?: string
          created_by?: string | null
          distancia_total_km?: number | null
          id?: string
          peso_total_kg?: number | null
          ponto_inicial_lat?: number | null
          ponto_inicial_lng?: number | null
          ponto_inicial_nome?: string | null
          status?: string | null
          tempo_estimado_min?: number | null
          volume_total_m3?: number | null
        }
        Update: {
          carga_id?: string
          created_at?: string
          created_by?: string | null
          distancia_total_km?: number | null
          id?: string
          peso_total_kg?: number | null
          ponto_inicial_lat?: number | null
          ponto_inicial_lng?: number | null
          ponto_inicial_nome?: string | null
          status?: string | null
          tempo_estimado_min?: number | null
          volume_total_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "roteirizacoes_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
        ]
      }
      sugestoes_coordenada: {
        Row: {
          ambigua: boolean
          clientes_vizinhos_200m: Json | null
          cluster_lat: number
          cluster_lng: number
          confianca_atual: number | null
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          destinatario_id: string
          distancia_atual_metros: number | null
          endereco_id: string | null
          id: string
          motivo_ambiguidade: string | null
          motivo_rejeicao: string | null
          num_pings: number
          num_placas_distintas: number | null
          num_rotas_distintas: number
          observacao: string | null
          origem_atual: Database["public"]["Enums"]["origem_coordenada"] | null
          primeira_visita: string
          raio_cluster_metros: number
          status: string
          ultima_visita: string
          updated_at: string
        }
        Insert: {
          ambigua?: boolean
          clientes_vizinhos_200m?: Json | null
          cluster_lat: number
          cluster_lng: number
          confianca_atual?: number | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          destinatario_id: string
          distancia_atual_metros?: number | null
          endereco_id?: string | null
          id?: string
          motivo_ambiguidade?: string | null
          motivo_rejeicao?: string | null
          num_pings: number
          num_placas_distintas?: number | null
          num_rotas_distintas: number
          observacao?: string | null
          origem_atual?: Database["public"]["Enums"]["origem_coordenada"] | null
          primeira_visita: string
          raio_cluster_metros: number
          status?: string
          ultima_visita: string
          updated_at?: string
        }
        Update: {
          ambigua?: boolean
          clientes_vizinhos_200m?: Json | null
          cluster_lat?: number
          cluster_lng?: number
          confianca_atual?: number | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          destinatario_id?: string
          distancia_atual_metros?: number | null
          endereco_id?: string | null
          id?: string
          motivo_ambiguidade?: string | null
          motivo_rejeicao?: string | null
          num_pings?: number
          num_placas_distintas?: number | null
          num_rotas_distintas?: number
          observacao?: string | null
          origem_atual?: Database["public"]["Enums"]["origem_coordenada"] | null
          primeira_visita?: string
          raio_cluster_metros?: number
          status?: string
          ultima_visita?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sugestoes_coordenada_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "destinatarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestoes_coordenada_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "destinatario_enderecos"
            referencedColumns: ["id"]
          },
        ]
      }
      tabelas_frete: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          embarcador_id: string
          frete_minimo: number | null
          id: string
          moeda: string
          nome: string
          observacoes: string | null
          updated_at: string
          vigente_ate: string | null
          vigente_de: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          embarcador_id: string
          frete_minimo?: number | null
          id?: string
          moeda?: string
          nome: string
          observacoes?: string | null
          updated_at?: string
          vigente_ate?: string | null
          vigente_de: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          embarcador_id?: string
          frete_minimo?: number | null
          id?: string
          moeda?: string
          nome?: string
          observacoes?: string | null
          updated_at?: string
          vigente_ate?: string | null
          vigente_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "tabelas_frete_embarcador_id_fkey"
            columns: ["embarcador_id"]
            isOneToOne: false
            referencedRelation: "embarcadores"
            referencedColumns: ["id"]
          },
        ]
      }
      tabelas_frete_faixas: {
        Row: {
          adicional_cte: number | null
          advalorem_percentual: number | null
          created_at: string
          gris_percentual: number | null
          id: string
          observacoes: string | null
          pedagio_por_100kg: number | null
          peso_max_kg: number | null
          peso_min_kg: number
          tabela_id: string
          tarifa_fixa: number | null
          tarifa_por_ton: number | null
          tipo_carga: string
          zona: string
        }
        Insert: {
          adicional_cte?: number | null
          advalorem_percentual?: number | null
          created_at?: string
          gris_percentual?: number | null
          id?: string
          observacoes?: string | null
          pedagio_por_100kg?: number | null
          peso_max_kg?: number | null
          peso_min_kg?: number
          tabela_id: string
          tarifa_fixa?: number | null
          tarifa_por_ton?: number | null
          tipo_carga: string
          zona: string
        }
        Update: {
          adicional_cte?: number | null
          advalorem_percentual?: number | null
          created_at?: string
          gris_percentual?: number | null
          id?: string
          observacoes?: string | null
          pedagio_por_100kg?: number | null
          peso_max_kg?: number | null
          peso_min_kg?: number
          tabela_id?: string
          tarifa_fixa?: number | null
          tarifa_por_ton?: number | null
          tipo_carga?: string
          zona?: string
        }
        Relationships: [
          {
            foreignKeyName: "tabelas_frete_faixas_tabela_id_fkey"
            columns: ["tabela_id"]
            isOneToOne: false
            referencedRelation: "tabelas_frete"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculo_nfs: {
        Row: {
          carga_origem_id: string
          created_at: string
          id: string
          nf_id: string
          veiculo_id: string
        }
        Insert: {
          carga_origem_id: string
          created_at?: string
          id?: string
          nf_id: string
          veiculo_id: string
        }
        Update: {
          carga_origem_id?: string
          created_at?: string
          id?: string
          nf_id?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculo_nfs_carga_origem_id_fkey"
            columns: ["carga_origem_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_nfs_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: true
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_nfs_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos: {
        Row: {
          access_code: string | null
          capacidade_kg: number | null
          capacidade_m3: number | null
          combustivel: string | null
          created_at: string
          created_by: string | null
          data: string
          id: string
          motorista: string | null
          pernoite: boolean
          pernoite_origem_id: string | null
          placa: string
          prestacao_contas_em: string | null
          prestacao_contas_obs: string | null
          prestacao_contas_por: string | null
          proprietario_cnpj_cpf: string | null
          proprietario_ie: string | null
          proprietario_razao: string | null
          proprietario_rntrc: string | null
          proprietario_tipo: string | null
          proprietario_uf: string | null
          renavam: string | null
          status: string
          tara_kg: number | null
          tipo_carroceria: string | null
          tipo_rodado: string | null
          uf_licenciamento: string | null
          updated_at: string
        }
        Insert: {
          access_code?: string | null
          capacidade_kg?: number | null
          capacidade_m3?: number | null
          combustivel?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          motorista?: string | null
          pernoite?: boolean
          pernoite_origem_id?: string | null
          placa: string
          prestacao_contas_em?: string | null
          prestacao_contas_obs?: string | null
          prestacao_contas_por?: string | null
          proprietario_cnpj_cpf?: string | null
          proprietario_ie?: string | null
          proprietario_razao?: string | null
          proprietario_rntrc?: string | null
          proprietario_tipo?: string | null
          proprietario_uf?: string | null
          renavam?: string | null
          status?: string
          tara_kg?: number | null
          tipo_carroceria?: string | null
          tipo_rodado?: string | null
          uf_licenciamento?: string | null
          updated_at?: string
        }
        Update: {
          access_code?: string | null
          capacidade_kg?: number | null
          capacidade_m3?: number | null
          combustivel?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          motorista?: string | null
          pernoite?: boolean
          pernoite_origem_id?: string | null
          placa?: string
          prestacao_contas_em?: string | null
          prestacao_contas_obs?: string | null
          prestacao_contas_por?: string | null
          proprietario_cnpj_cpf?: string | null
          proprietario_ie?: string | null
          proprietario_razao?: string | null
          proprietario_rntrc?: string | null
          proprietario_tipo?: string | null
          proprietario_uf?: string | null
          renavam?: string | null
          status?: string
          tara_kg?: number | null
          tipo_carroceria?: string | null
          tipo_rodado?: string | null
          uf_licenciamento?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      zonas_entrega: {
        Row: {
          ativo: boolean
          codigo_municipio_ibge: string | null
          created_at: string
          embarcador_id: string | null
          id: string
          municipio: string
          uf: string
          updated_at: string
          zona: string
        }
        Insert: {
          ativo?: boolean
          codigo_municipio_ibge?: string | null
          created_at?: string
          embarcador_id?: string | null
          id?: string
          municipio: string
          uf: string
          updated_at?: string
          zona: string
        }
        Update: {
          ativo?: boolean
          codigo_municipio_ibge?: string | null
          created_at?: string
          embarcador_id?: string | null
          id?: string
          municipio?: string
          uf?: string
          updated_at?: string
          zona?: string
        }
        Relationships: [
          {
            foreignKeyName: "zonas_entrega_embarcador_id_fkey"
            columns: ["embarcador_id"]
            isOneToOne: false
            referencedRelation: "embarcadores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_apk_heartbeat_atual: {
        Row: {
          app_version: string | null
          bateria_pct: number | null
          estado: string | null
          motorista_user_id: string | null
          otimizacao_bateria: string | null
          permissao_localizacao: string | null
          placa: string | null
          recebido_em: string | null
          segundos_desde_ultimo: number | null
          ultimo_gps_em: string | null
        }
        Relationships: []
      }
      vw_diagnostico_paradas_v3: {
        Row: {
          classificacao_v3: string | null
          monitoramento_rota_id: string | null
          parada_id: string | null
          pings_dentro: number | null
          total_pings: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoramento_paradas_monitoramento_rota_id_fkey"
            columns: ["monitoramento_rota_id"]
            isOneToOne: false
            referencedRelation: "monitoramento_rotas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adicionar_nfs_carga: { Args: { payload: Json }; Returns: Json }
      aplicar_cubagem_produtos_nf: {
        Args: { p_dias?: number; p_simular?: boolean }
        Returns: Json
      }
      aprovar_sugestao_coordenada: {
        Args: { p_sugestao_id: string }
        Returns: Json
      }
      can_view_veiculo: { Args: { p_veiculo_id: string }; Returns: boolean }
      confianca_origem: {
        Args: { origem: Database["public"]["Enums"]["origem_coordenada"] }
        Returns: number
      }
      detectar_paradas_nao_programadas: { Args: never; Returns: Json }
      detectar_paradas_suspeitas: {
        Args: { p_rota_id: string }
        Returns: {
          classificacao: string
          cluster_num: number
          distancia_parada_m: number
          duracao_min: number
          fim: string
          inicio: string
          latitude: number
          longitude: number
          parada_ordem: number
          parada_planejada_id: string
          parada_razao_social: string
          pontos: number
        }[]
      }
      enriquecer_cadastros_fiscais_lote: {
        Args: { payload: Json }
        Returns: Json
      }
      ensure_audit_log_partition: { Args: never; Returns: undefined }
      fn_ibac_enqueue: {
        Args: {
          p_baixa_id: string
          p_carga_id: string
          p_chave_acesso: string
          p_evento: string
          p_nf_id: string
          p_payload: Json
        }
        Returns: undefined
      }
      fn_nfev_actor: {
        Args: never
        Returns: {
          ator_id: string
          ator_nome: string
        }[]
      }
      fn_nfev_insert: {
        Args: {
          p_ator_id: string
          p_ator_nome: string
          p_dedupe_key: string
          p_nf_id: string
          p_ocorrido_em: string
          p_origem: string
          p_payload: Json
          p_tipo: string
        }
        Returns: undefined
      }
      gerar_sugestoes_dwell_factual: {
        Args: never
        Returns: {
          ambiguas: number
          descartadas_accuracy: number
          descartadas_confianca: number
          descartadas_consistencia: number
          descartadas_dwell: number
          descartadas_recorrencia: number
          geradas: number
        }[]
      }
      get_cargas_com_contagens: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          data: string
          id: string
          import_batch_id: string
          itens_count: number
          motorista: string
          nfs_count: number
          observacao: string
          operador_responsavel: string
          placa: string
          status: Database["public"]["Enums"]["load_status"]
          tipo_carga: string
          updated_at: string
        }[]
      }
      get_conferencia_progress: { Args: { p_carga_id: string }; Returns: Json }
      has_profile: { Args: never; Returns: boolean }
      haversine_metros: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      importar_carga_xml_lote: { Args: { payload: Json }; Returns: Json }
      importar_produtos_lote: { Args: { payload: Json }; Returns: Json }
      is_active_operator: { Args: never; Returns: boolean }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_carga_operator: { Args: { p_carga_id: string }; Returns: boolean }
      listar_audit_log: {
        Args: {
          p_action?: string
          p_data_fim?: string
          p_data_inicio?: string
          p_entity_id?: string
          p_entity_type?: string
          p_limit?: number
          p_offset?: number
          p_user_id?: string
        }
        Returns: Json
      }
      pings_sugestao_coordenada: {
        Args: { p_sugestao_id: string }
        Returns: {
          accuracy: number
          lat: number
          lng: number
          registrado_em: string
        }[]
      }
      pode_gestao_comercial: { Args: never; Returns: boolean }
      pode_sobrescrever_coordenada: {
        Args: {
          origem_atual: Database["public"]["Enums"]["origem_coordenada"]
          origem_nova: Database["public"]["Enums"]["origem_coordenada"]
        }
        Returns: boolean
      }
      produtos_pendentes_cadastro: {
        Args: { p_cnpj?: string; p_dias?: number }
        Returns: {
          c_prod: string
          cnpj_emitente: string
          ocorrencias: number
          qtd_total: number
          razao_social_emitente: string
          u_com: string
          ultima_data: string
          x_prod: string
        }[]
      }
      promover_admin_temporario: {
        Args: { _dias: number; _user_id: string }
        Returns: undefined
      }
      provisionar_torre_dia: { Args: { p_data?: string }; Returns: Json }
      provisionar_torre_veiculo: {
        Args: { p_veiculo_id: string }
        Returns: Json
      }
      registrar_chegada_cd_manual: {
        Args: { p_nf_id: string; p_observacao?: string }
        Returns: Json
      }
      rejeitar_sugestao_coordenada: {
        Args: { p_motivo: string; p_sugestao_id: string }
        Returns: undefined
      }
      resolver_endereco_operacional: {
        Args: { _destinatario_id: string }
        Returns: {
          confianca: number
          endereco_id: string
          latitude: number
          longitude: number
          origem: Database["public"]["Enums"]["origem_coordenada"]
          tipo: Database["public"]["Enums"]["tipo_endereco"]
        }[]
      }
      resolver_sla_tarifa: {
        Args: {
          p_data?: string
          p_embarcador_id: string
          p_municipio: string
          p_uf: string
        }
        Returns: {
          adicional_cte: number
          advalorem_percentual: number
          frete_minimo: number
          gris_percentual: number
          pedagio_por_100kg: number
          prazo_dias_uteis: number
          regiao_id: string
          regiao_nome: string
          tarifa_fixa: number
          tarifa_por_ton: number
        }[]
      }
      reverter_admins_expirados: { Args: never; Returns: number }
      revogar_admin_temporario: {
        Args: { _user_id: string }
        Returns: undefined
      }
      rota_baixa_aderencia: {
        Args: { _min_pings?: number; _monitoramento_rota_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operador"
      label_status:
        | "pendente"
        | "conferido_interno"
        | "conferido"
        | "divergencia"
      load_status: "aberta" | "fechada" | "em_rota" | "entregue" | "expedida"
      origem_coordenada:
        | "manual"
        | "google_places_nome"
        | "google_geocode"
        | "brasilapi_cep"
        | "nominatim"
        | "baixa_motorista"
        | "legado_desconhecido"
        | "google_geocode_rooftop"
        | "google_geocode_range"
        | "dwell_factual_aprovado"
        | "amostra_insuficiente"
        | "dwell_factual_sugerido"
      tipo_endereco: "fiscal" | "entrega" | "doca" | "coleta"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operador"],
      label_status: [
        "pendente",
        "conferido_interno",
        "conferido",
        "divergencia",
      ],
      load_status: ["aberta", "fechada", "em_rota", "entregue", "expedida"],
      origem_coordenada: [
        "manual",
        "google_places_nome",
        "google_geocode",
        "brasilapi_cep",
        "nominatim",
        "baixa_motorista",
        "legado_desconhecido",
        "google_geocode_rooftop",
        "google_geocode_range",
        "dwell_factual_aprovado",
        "amostra_insuficiente",
        "dwell_factual_sugerido",
      ],
      tipo_endereco: ["fiscal", "entrega", "doca", "coleta"],
    },
  },
} as const
