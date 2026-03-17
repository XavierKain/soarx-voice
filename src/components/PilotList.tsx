import React from 'react';
import {View, Text, StyleSheet, FlatList} from 'react-native';
import {Pilot} from '../types';
import {colors, fonts, spacing} from '../theme';

interface PilotListProps {
  remotePilots: Pilot[];
  localPilotName: string;
  isMuted: boolean;
}

export function PilotList({remotePilots, localPilotName, isMuted}: PilotListProps) {
  const localStatus = isMuted ? 'muted' : 'speaking';
  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        Connected Pilots ({remotePilots.length + 1})
      </Text>
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

  return (
    <View style={[
      styles.card,
      isSpeaking && styles.cardSpeaking,
      isLocal && isMutedStatus && styles.cardMutedLocal,
    ]}>
      <View style={[
        styles.avatar,
        isSpeaking && styles.avatarSpeaking,
        isMutedStatus && styles.avatarMuted,
      ]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardName}>{name}</Text>
        <Text style={[
          styles.cardStatus,
          isSpeaking && styles.statusSpeaking,
          isLocal && isMutedStatus && styles.statusMuted,
        ]}>
          {isLocal && !isMutedStatus ? 'You'
            : isLocal && isMutedStatus ? 'Mic off'
            : isSpeaking ? 'Speaking...'
            : isMutedStatus ? 'Muted'
            : 'Listening'}
        </Text>
      </View>
      <Text style={styles.statusIcon}>
        {isSpeaking ? '🎤' : isMutedStatus ? '🔇' : '🎧'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, flex: 1 },
  header: { fontSize: fonts.label, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderWidth: 2, borderColor: 'rgba(26, 39, 68, 0.08)', borderRadius: 12, padding: 14, marginBottom: spacing.sm },
  cardSpeaking: { backgroundColor: colors.cyanLight, borderColor: colors.cyanBorder },
  cardMutedLocal: { backgroundColor: 'rgba(229, 57, 53, 0.06)', borderColor: 'rgba(229, 57, 53, 0.15)' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarSpeaking: { backgroundColor: colors.cyan },
  avatarMuted: { backgroundColor: colors.grey },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  cardContent: { flex: 1 },
  cardName: { fontWeight: '700', fontSize: 16, color: colors.navy },
  cardStatus: { fontSize: fonts.small, color: colors.textSecondary },
  statusSpeaking: { color: colors.cyan, fontWeight: '600' },
  statusMuted: { color: colors.red, fontWeight: '600' },
  statusIcon: { fontSize: 18, opacity: 0.3 },
});
