import React from 'react';
import {View, Text, StyleSheet, FlatList} from 'react-native';
import {Pilot} from '../types';
import {useTheme} from '../contexts/ThemeContext';
import {ThemeColors} from '../theme';

const radius = {sm: 8, md: 12, lg: 16};

interface PilotListProps {
  remotePilots: Pilot[];
  localPilotName: string;
  isMuted: boolean;
}

export function PilotList({remotePilots, localPilotName, isMuted}: PilotListProps) {
  const {colors} = useTheme();
  const localStatus = isMuted ? 'muted' : 'speaking';
  const totalCount = remotePilots.length + 1;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerLabel, {color: colors.textMuted}]}>Connected Pilots</Text>
        <View style={[styles.countBadge, {backgroundColor: colors.primaryLight}]}>
          <Text style={[styles.countText, {color: colors.primary}]}>{totalCount}</Text>
        </View>
      </View>
      <PilotCard name={localPilotName} status={localStatus} isLocal audioVolume={0} colors={colors} />
      <FlatList
        data={remotePilots}
        keyExtractor={item => String(item.uid)}
        renderItem={({item}) => (
          <PilotCard name={item.name} status={item.status} isLocal={false} audioVolume={item.audioVolume} colors={colors} />
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
  colors: ThemeColors;
}

function PilotCard({name, status, isLocal, colors}: PilotCardProps) {
  const initial = name.charAt(0).toUpperCase();
  const isSpeaking = status === 'speaking';
  const isMutedStatus = status === 'muted';
  const isListening = status === 'listening';

  const cardStyle = [
    styles.card,
    {
      backgroundColor: isSpeaking
        ? colors.primaryLight
        : isLocal && isMutedStatus
          ? colors.redLight
          : colors.bgCard,
      borderColor: isSpeaking
        ? colors.primaryBorder
        : isLocal && isMutedStatus
          ? 'rgba(239, 68, 68, 0.20)'
          : colors.cardBorder,
    },
  ];

  const avatarStyle = [
    styles.avatar,
    {
      backgroundColor: isSpeaking
        ? colors.primary
        : isMutedStatus
          ? colors.red
          : isListening
            ? colors.textMuted
            : colors.bgCardActive,
    },
  ];

  const statusTextStyle = [
    styles.cardStatus,
    {
      color: isSpeaking
        ? colors.primary
        : isMutedStatus
          ? colors.red
          : colors.textSecondary,
      fontWeight: (isSpeaking || isMutedStatus ? '600' : 'normal') as '600' | 'normal',
    },
  ];

  return (
    <View style={cardStyle}>
      <View style={avatarStyle}>
        <Text style={[styles.avatarText, {color: colors.white}]}>{initial}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.cardName, {color: colors.text}]}>{name}</Text>
        <Text style={statusTextStyle}>
          {isLocal && !isMutedStatus ? 'You'
            : isLocal && isMutedStatus ? 'Mic off'
            : isSpeaking ? 'Speaking...'
            : isMutedStatus ? 'Muted'
            : 'Listening'}
        </Text>
      </View>
      <Text style={[
        styles.statusIcon,
        {opacity: isSpeaking ? 0.7 : isMutedStatus ? 0.5 : 0.25},
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
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  countBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Card base
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
  },

  // Avatar
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
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
  },
  cardStatus: {
    fontSize: 13,
    marginTop: 2,
  },

  // Status icon
  statusIcon: {
    fontSize: 18,
  },
});
