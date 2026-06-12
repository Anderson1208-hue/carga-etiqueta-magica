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
          lido: boolean
          lido_em: string | null
          lido_por: string | null
          mensagem: string
          monitoramento_parada_id: string | null
          monitoramento_rota_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          lido?: boolean
          lido_em?: string | null
          lido_por?: string | null
          mensagem: string
          monitoramento_parada_id?: string | null
          monitoramento_rota_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          lido?: boolean
          lido_em?: string | null
          lido_por?: string | null
          mensagem?: string
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
            foreignKeyName: "alertas_monitoramento_monitoramento_rota_id_fkey"
            columns: ["monitoramento_rota_id"]
            isOneToOne: false
            referencedRelation: "monitoramento_rotas"
            referencedColumns: ["id"]
          },
        ]
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
          validacao_problemas: Json | null
          validacao_score: number | null
          validacao_status: string | null
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
          validacao_problemas?: Json | null
          validacao_score?: number | null
          validacao_status?: string | null
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
          validacao_problemas?: Json | null
          validacao_score?: number | null
          validacao_status?: string | null
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
      destinatario_enderecos: {
        Row: {
          apelido: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string
          destinatario_id: string
          id: string
          latitude: number | null
          logradouro: string | null
          longitude: number | null
          numero: string | null
          principal: boolean
          uf: string | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          destinatario_id: string
          id?: string
          latitude?: number | null
          logradouro?: string | null
          longitude?: number | null
          numero?: string | null
          principal?: boolean
          uf?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          destinatario_id?: string
          id?: string
          latitude?: number | null
          logradouro?: string | null
          longitude?: number | null
          numero?: string | null
          principal?: boolean
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
          nome_fantasia: string | null
          observacao: string | null
          rascunho: boolean
          razao_social: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj_cpf: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome_fantasia?: string | null
          observacao?: string | null
          rascunho?: boolean
          razao_social: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj_cpf?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome_fantasia?: string | null
          observacao?: string | null
          rascunho?: boolean
          razao_social?: string
          updated_at?: string
        }
        Relationships: []
      }
      embarcadores: {
        Row: {
          ativo: boolean
          centro_custo: string | null
          cnpj: string
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string
          created_by: string | null
          id: string
          nome_fantasia: string | null
          observacao_operacional: string | null
          rascunho: boolean
          razao_social: string
          sla_padrao_horas: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          centro_custo?: string | null
          cnpj: string
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome_fantasia?: string | null
          observacao_operacional?: string | null
          rascunho?: boolean
          razao_social: string
          sla_padrao_horas?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          centro_custo?: string | null
          cnpj?: string
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome_fantasia?: string | null
          observacao_operacional?: string | null
          rascunho?: boolean
          razao_social?: string
          sla_padrao_horas?: number | null
          updated_at?: string
        }
        Relationships: []
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
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          pode_divergencia: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          pode_divergencia?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          pode_divergencia?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      roteirizacao_paradas: {
        Row: {
          cnpj_destinatario: string
          distancia_anterior_km: number | null
          endereco_completo: string | null
          id: string
          latitude: number | null
          longitude: number | null
          ordem: number
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
          distancia_anterior_km?: number | null
          endereco_completo?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          ordem: number
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
          distancia_anterior_km?: number | null
          endereco_completo?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          ordem?: number
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
          status: string
          updated_at: string
        }
        Insert: {
          access_code?: string | null
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
          status?: string
          updated_at?: string
        }
        Update: {
          access_code?: string | null
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
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adicionar_nfs_carga: { Args: { payload: Json }; Returns: Json }
      can_view_veiculo: { Args: { p_veiculo_id: string }; Returns: boolean }
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
      importar_carga_xml_lote: { Args: { payload: Json }; Returns: Json }
      is_active_operator: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
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
      registrar_chegada_cd_manual: {
        Args: { p_nf_id: string; p_observacao?: string }
        Returns: Json
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
    },
  },
} as const
