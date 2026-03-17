import React from 'react';
import {View, Text, StyleSheet, FlatList} from 'react-native';
import {Pilot} from '../types';

const colors = {
  bg: '#0F172A',
  bgCard: '#1E293B',
  bgCardActive: '#334155',
  primary: '#0EA5E9',
  primaryLight: 'rgba(14, 165, 233, 0.12)',
  primaryBorder: 'rgba(14, 165, 233, 0.25)',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  white: '#F8FAFC',
  green: '#22C55E',
  greenLight: 'rgba(34, 197, 94, 0.15)',
  red: '#EF4444',
  redLight: 'rgba(239, 68, 68, 0.12)',
};

const radius = {sm: 8, md: 12, lg: 16};

interface PilotListProps {
  remotePilots: Pilot[];
  localPilotName: string;
  isMuted: boolean;
}

export function PilotList({remotePilots, localPilotName, isMuted}: PilotListProps) {
  const localStatus = isMuted ? 'muted' : 'speaking';
  const totalCount = remotePilots.length + 1;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>Connected Pilots</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{totalCount}</Text>
        </View>
      </View>
      <PilotCard name={localPilotName} status={localStatus} isLocal audioVolume={0} />
      <FlatList
        data={remotePilots}
        keyExtractor={item => String(item.uid)}
        renderItem={({item}) => (
          <PilotCard name={item.name} status={item.status} isLocal={false} audioVolume={item.audioVolume} />
        )}
        scrollEnabled={false}
      />
    </View>
  );
}

interface PilotCardProps {
  name: string;
  status: 'speaking' | 'listening' | 'muted';
  isLocal: boolean;
  audioVolume: number;
}

function PilotCard({name, status, isLocal}: PilotCardProps) {
  const initial = name.charAt(0).toUpperCase();
  const isSpeaking = status === 'speaking';
  const isMutedStatus = status === 'muted';
  const isListening = status === 'listening';

  return (
    <View style={[
      styles.card,
      isSpeaking && styles.cardSpeaking,
      isLocal && isMutedStatus && styles.cardMuted,
    ]}>
      <View style={[
        styles.avatar,
        isSpeaking && styles.avatarSpeaking,
        isListening && styles.avatarListening,
        isMutedStatus && styles.avatarMuted,
      ]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardName}>{name}</Text>
        <Text style={[
          styles.cardStatus,
          isSpeaking && styles.statusSpeaking,
          isMutedStatus && styles.statusMuted,
        ]}>
          {isLocal && !isMutedStatus ? 'You'
            : isLocal && isMutedStatus ? 'Mic off'
            : isSpeaking ? 'Speaking...'
            : isMutedStatus ? 'Muted'
            : 'Listening'}
        </Text>
      </View>
      <Text style={[
        styles.statusIcon,
        isSpeaking && styles.statusIconActive,
        isMutedStatus && styles.statusIconMuted,
      ]}>
        {isSpeaking ? '🎤' : isMutedStatus ? '🔇' : '🎧'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    flex: 1,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  headerLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  countBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },

  // Card base
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
  },
  cardSpeaking: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
  },
  cardMuted: {
    backgroundColor: colors.redLight,
    borderColor: 'rgba(239, 68, 68, 0.20)',
  },

  // Avatar
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bgCardActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSpeaking: {
    backgroundColor: colors.primary,
  },
  avatarListening: {
    backgroundColor: colors.textMuted,
  },
  avatarMuted: {
    backgroundColor: colors.red,
  },
  avatarText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },

  // Content
  cardContent: {
    flex: 1,
  },
  cardName: {
    fontWeight: '700',
    fontSize: 16,
    color: colors.text,
  },
  cardStatus: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusSpeaking: {
    color: colors.primary,
    fontWeight: '600',
  },
  statusMuted: {
    color: colors.red,
    fontWeight: '600',
  },

  // Status icon
  statusIcon: {
    fontSize: 18,
    opacity: 0.25,
  },
  statusIconActive: {
    opacity: 0.7,
  },
  statusIconMuted: {
    opacity: 0.5,
  },
});
