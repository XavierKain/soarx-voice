import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {useAgoraContext} from '../contexts/AgoraContext';
import {useUser} from '../contexts/UserContext';
import {useMute} from '../hooks/useMute';
import {useBluetoothHID} from '../hooks/useBluetoothHID';
import {MuteButton} from '../components/MuteButton';
import {PilotList} from '../components/PilotList';
import {ChannelBadge} from '../components/ChannelBadge';
import {useTheme} from '../contexts/ThemeContext';
import {colors as defaultColors, fonts, spacing, radius} from '../theme';

interface VoiceScreenProps {
  onLeft: () => void;
}

export function VoiceScreen({onLeft}: VoiceScreenProps) {
  const {colors} = useTheme();
  const {channelName, remotePilots, leaveChannel, connectionState, isSpeakerOn, toggleSpeaker} = useAgoraContext();
  const {pilotName} = useUser();
  const {isMuted, toggle} = useMute();
  useBluetoothHID(toggle);

  const handleLeave = () => {
    Alert.alert('Leave Flight', 'Are you sure you want to leave this channel?', [
      {text: 'Cancel', style: 'cancel'},
      { text: 'Leave', style: 'destructive', onPress: async () => { await leaveChannel(); onLeft(); } },
    ]);
  };

  return (
    <View style={[styles.container, {backgroundColor: colors.bg}]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.channelLabel, {color: colors.textMuted}]}>Channel</Text>
          <Text style={[styles.channelName, {color: colors.text}]}>{channelName}</Text>
        </View>
        <View style={styles.headerRight}>
          {connectionState === 'connected' && <ChannelBadge />}
          {connectionState === 'reconnecting' && <Text style={[styles.reconnecting, {color: colors.amber}]}>Reconnecting...</Text>}
        </View>
      </View>

      <View style={styles.pilotListWrapper}>
        <PilotList remotePilots={remotePilots} localPilotName={pilotName} isMuted={isMuted} />
      </View>

      <View style={styles.controls}>
        <MuteButton isMuted={isMuted} onPress={toggle} />

        <TouchableOpacity
          style={[styles.speakerPill, {backgroundColor: colors.bgCard, borderColor: colors.primaryBorder}, isSpeakerOn && styles.speakerPillActive]}
          onPress={toggleSpeaker}
          activeOpacity={0.7}>
          <Text style={styles.speakerIcon}>{isSpeakerOn ? '🔊' : '🔈'}</Text>
          <Text style={[styles.speakerText, {color: colors.textSecondary}, isSpeakerOn && {color: colors.primary}]}>
            {isSpeakerOn ? 'Speaker' : 'Earpiece'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.leaveButton} onPress={handleLeave} activeOpacity={0.6}>
        <Text style={styles.leaveText}>Leave Flight</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: defaultColors.bg,
    paddingTop: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    marginLeft: spacing.md,
  },
  channelLabel: {
    fontSize: fonts.label,
    color: defaultColors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  channelName: {
    fontSize: fonts.title,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: defaultColors.text,
  },
  reconnecting: {
    fontSize: fonts.label,
    fontWeight: '600',
    color: defaultColors.amber,
  },
  pilotListWrapper: {
    flex: 1,
  },
  controls: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  speakerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: defaultColors.bgCard,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: defaultColors.primaryBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  speakerPillActive: {
    backgroundColor: defaultColors.primaryLight,
    borderColor: defaultColors.primary,
  },
  speakerIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  speakerText: {
    fontSize: fonts.sm,
    fontWeight: '600',
    color: defaultColors.textSecondary,
  },
  speakerTextActive: {
    color: defaultColors.primary,
  },
  leaveButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xxl,
    alignSelf: 'center',
  },
  leaveText: {
    fontSize: fonts.body,
    fontWeight: '600',
    color: defaultColors.red,
  },
});
