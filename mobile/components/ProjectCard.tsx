import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import type { Project } from '@/services/api';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  assessment_complete: 'Assessment Done',
  report_generated: 'Report Ready',
  estimate_sent: 'Estimate Sent',
  accepted: 'Accepted',
  declined: 'Declined',
};

const STATUS_COLORS: Record<string, string> = {
  active: Colors.statusActive,
  assessment_complete: Colors.primaryDark,
  report_generated: Colors.primaryDark,
  estimate_sent: Colors.statusPending,
  accepted: Colors.statusComplete,
  declined: Colors.error,
};

interface Props {
  project: Project;
  onPress: () => void;
}

export function ProjectCard({ project, onPress }: Props) {
  const statusLabel = STATUS_LABELS[project.status] ?? project.status;
  const statusColor = STATUS_COLORS[project.status] ?? Colors.textMuted;

  const addressLine = [project.address_city, project.address_state]
    .filter(Boolean)
    .join(', ');

  const date = new Date(project.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="business-outline" size={28} color={Colors.primary} />
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>
            {project.church_name ?? project.name}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {project.name !== project.church_name && project.church_name && (
          <Text style={styles.subName} numberOfLines={1}>
            {project.name}
          </Text>
        )}

        <View style={styles.bottomRow}>
          {addressLine ? (
            <Text style={styles.meta}>
              <Ionicons name="location-outline" size={12} color={Colors.textMuted} />{' '}
              {addressLine}
            </Text>
          ) : null}
          <Text style={styles.meta}>{date}</Text>
          <Text style={styles.meta}>
            <Ionicons name="camera-outline" size={12} color={Colors.textMuted} />{' '}
            {project.photo_count ?? 0} photos
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color={Colors.border} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
    flex: 1,
  },
  subName: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  meta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});

export default ProjectCard;
