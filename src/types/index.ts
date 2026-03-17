// Types partagés pour SoarX Voice

/** Statut d'un pilote dans le canal */
export type PilotStatus = 'speaking' | 'listening' | 'muted';

/** Représentation d'un pilote connecté */
export interface Pilot {
  /** UID Agora unique */
  uid: number;
  /** Nom affiché */
  name: string;
  /** Statut actuel */
  status: PilotStatus;
  /** Volume audio (0-255, pour détecter "speaking") */
  audioVolume: number;
}

/** État de connexion au canal */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Paramètres de connexion */
export interface ChannelConfig {
  channelName: string;
  pilotName: string;
}
