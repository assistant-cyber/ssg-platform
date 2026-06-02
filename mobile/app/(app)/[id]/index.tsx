/**
 * Project Detail Screen — field mode.
 * Shows all photos taken so far + big camera button at bottom.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { ProjectDetail } from '@/services/api';
import Colors from '@/constants/Colors';
import { PhotoThumbnail } from '@/components/PhotoThumbnail';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUS_LABELS: Record<string, string> = {
  active: 'In Progress',
  assessment_complete: 'Assessment Complete',
  report_generated: 'Report Ready',
  estimate_sent: 'Estimate Sent',
  accepted: 'Accepted',
  declined: 'Declined',
};

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProject = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const data = await api.getProject(id);
      setProject(data);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not load project.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  useFocusEffect(
    useCallback(() => {
      fetchProject(true);
    }, [fetchProject]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProject(true);
  };

  if (loading || !project) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const statusLabel = STATUS_LABELS[project.status] ?? project.status;
  const address = [project.address_street, project.address_city, project.address_state]
    .filter(Boolean)
    .join(', ');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: project.church_name ?? project.name,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/${id}/finish`)}
              style={styles.finishBtn}
            >
              <Text style={styles.finishBtnText}>Finish</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Project summary card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
            <Text style={styles.photoCount}>{project.photos.length} photos</Text>
          </View>
          {address ? (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.addressText}>{address}</Text>
            </View>
          ) : null}
          {project.general_notes ? (
            <Text style={styles.notes}>{project.general_notes}</Text>
          ) : null}
        </View>

        {/* Photos */}
        <View style={styles.photosSection}>
          <Text style={styles.sectionTitle}>
            Photos
            {project.photos.length > 0 ? ` (${project.photos.length})` : ''}
          </Text>

          {project.photos.length === 0 ? (
            <View style={styles.emptyPhotos}>
              <Ionicons name="camera-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>No photos yet</Text>
              <Text style={styles.emptySubtext}>
                Tap the camera button below to start documenting windows.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
            >
              {project.photos.map((photo) => (
                <PhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  onPress={() =>
                    router.push(`/(app)/${id}/photo/${photo.id}`)
                  }
                />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Report section (if generated) */}
        {project.latest_report?.pdf_url && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Report</Text>
            <View style={styles.reportRow}>
              <Ionicons name="document-text" size={20} color={Colors.primary} />
              <Text style={styles.reportText}>Assessment report generated</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Camera FAB */}
      <View style={styles.fabArea}>
        <TouchableOpacity
          style={styles.cameraBtn}
          onPress={() => router.push(`/(app)/${id}/camera`)}
          activeOpacity={0.85}
        >
          <Ionicons name="camera" size={28} color={Colors.white} />
          <Text style={styles.cameraBtnText}>Take Photo</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  finishBtn: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 4,
  },
  finishBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  photoCount: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addressText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  notes: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.textDark,
    lineHeight: 18,
  },
  photosSection: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 14,
  },
  photoRow: {
    paddingBottom: 4,
  },
  emptyPhotos: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportText: {
    fontSize: 14,
    color: Colors.textDark,
  },
  fabArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 28,
    paddingHorizontal: 24,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 14,
  },
  cameraBtn: {
    height: 60,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  cameraBtnText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
