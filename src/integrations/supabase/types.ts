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
      baixas_entrega: {
        Row: {
          created_at: string
          foto_path: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nf_id: string
          ocorrencia: string | null
          recebedor_nome: string | null
          registrado_em: string | null
          registrado_por: string | null
          status: string
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          foto_path?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nf_id: string
          ocorrencia?: string | null
          recebedor_nome?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          status?: string
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          created_at?: string
          foto_path?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nf_id?: string
          ocorrencia?: string | null
          recebedor_nome?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          status?: string
          updated_at?: string
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
          id: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          id?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
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
          id: string
          nf_id: string | null
          numero_cte: string
          razao_social_emitente: string | null
          valor_frete: number | null
        }
        Insert: {
          carga_id: string
          chave_cte: string
          chave_nf_referenciada?: string | null
          cnpj_emitente?: string | null
          created_at?: string
          id?: string
          nf_id?: string | null
          numero_cte: string
          razao_social_emitente?: string | null
          valor_frete?: number | null
        }
        Update: {
          carga_id?: string
          chave_cte?: string
          chave_nf_referenciada?: string | null
          cnpj_emitente?: string | null
          created_at?: string
          id?: string
          nf_id?: string | null
          numero_cte?: string
          razao_social_emitente?: string | null
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
          peso_bruto: number | null
          peso_liquido: number | null
          razao_social_emitente: string
          status_entrega: string
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
          peso_bruto?: number | null
          peso_liquido?: number | null
          razao_social_emitente: string
          status_entrega?: string
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
          peso_bruto?: number | null
          peso_liquido?: number | null
          razao_social_emitente?: string
          status_entrega?: string
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
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
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
          placa: string
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
          placa: string
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
          placa?: string
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
      get_conferencia_progress: { Args: { p_carga_id: string }; Returns: Json }
      has_profile: { Args: never; Returns: boolean }
      importar_carga_xml_lote: { Args: { payload: Json }; Returns: Json }
      is_active_operator: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_carga_operator: { Args: { p_carga_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "operador"
      label_status:
        | "pendente"
        | "conferido_interno"
        | "conferido"
        | "divergencia"
      load_status: "aberta" | "fechada" | "em_rota" | "entregue"
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
      load_status: ["aberta", "fechada", "em_rota", "entregue"],
    },
  },
} as const
