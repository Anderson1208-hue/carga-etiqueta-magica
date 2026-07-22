export interface MonitoramentoRota {
  id: string;
  veiculo_id: string;
  motorista: string | null;
  placa: string;
  data: string;
  status: string;
  ultima_lat: number | null;
  ultima_lng: number | null;
  ultima_atualizacao: string | null;
  total_paradas: number;
  paradas_concluidas: number;
}

export interface MonitoramentoParada {
  id: string;
  monitoramento_rota_id: string;
  ordem: number;
  cnpj_destinatario: string | null;
  razao_social: string | null;
  endereco_completo: string | null;
  latitude: number | null;
  longitude: number | null;
  raio_geofence_metros: number;
  horario_previsto: string | null;
  horario_chegada: string | null;
  horario_saida: string | null;
  tempo_permanencia_min: number | null;
  status: string;
  is_excecao: boolean;
  justificativa: string | null;
  justificativa_tipo: string | null;
  total_nfs: number | null;
  total_caixas: number | null;
  peso_total_kg: number | null;
  volume_total_m3: number | null;
}

export interface Alerta {
  id: string;
  monitoramento_rota_id: string;
  monitoramento_parada_id: string | null;
  tipo: string;
  mensagem: string;
  lido: boolean;
  created_at: string;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: any;
}

export interface MonitoramentoConfig {
  raio_padrao_metros: number;
  tempo_minimo_atendimento_min: number;
  tempo_maximo_cliente_min: number;
  tolerancia_gps_metros: number;
  tempo_max_sem_atualizacao_min: number;
  intervalo_padrao_segundos: number;
  intervalo_critico_segundos: number;
  distance_filter_metros: number;
  geofence_ativo: boolean;
  batch_sync_ativo: boolean;
  batch_max_posicoes: number;
  raio_aproximacao_metros: number;
}

export const JUSTIFICATIVA_TIPOS = [
  "Cliente fechado",
  "Fila para descarga",
  "Dificuldade de acesso",
  "Recusa",
  "Reentrega autorizada",
  "Erro de GPS",
  "Outros",
];
