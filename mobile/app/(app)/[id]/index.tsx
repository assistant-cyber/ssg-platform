/**
 * Project Detail Screen — Window-based field mode.
 * Shows Window cards + site/elevation photos + big '+ New Window' button.
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
  TextInput,
  Modal,
} from 'react-native';
import { router, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { ProjectDetail, Window, Photo } from '@/services/api';
import Colors from '@/constants/Colors';
import { PhotoThumbnail } from '@/components/PhotoThumbnail';
import { WindowCard } from '@/components/WindowCard';
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
  const [windows, setWindows] = useState<Window[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createWindowModal, setCreateWindowModal] = useState(false);
  const [newWindowNumber, setNewWindowNumber] = useState('');
  const [newWindowName, setNewWindowName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const [projectData, windowsData] = await Promise.all([
        api.getProject(id),
        api.listWindows(id),
      ]);
      setProject(projectData);
      setWindows(windowsData);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not load project.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData(true);
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const openCreateWindow = () => {
    // Auto-suggest next window number
    const maxNumber = windows.reduce((max, w) => Math.max(max, w.number), 0);
    setNewWindowNumber((maxNumber + 1).toString());
    setNewWindowName('');
    setCreateWindowModal(true);
  };

  const handleCreateWindow = async () => {
    const num = parseInt(newWindowNumber, 10);
    if (isNaN(num) || num < 1) {
      Alert.alert('Invalid Number', 'Window number must be a positive integer.');
      return;
    }

    if (!id) return;
    setCreating(true);

    try {
      const created = await api.createWindow(id, {
        number: num,
        name: newWindowName.trim() || undefined,
        sort_order: num,
      });

      setWindows((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
      setCreateWindowModal(false);
      setNewWindowNumber('');
      setNewWindowName('');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not create window.');
    } finally {
      setCreating(false);
    }
  };

  const openWindow = (windowId: string) => {
    router.push(`/(app)/${id}/window/${windowId}`);
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

  // Filter photos: site/elevation photos have no window_id
  const sitePhotos = project.photos.filter((p) => !p.window_id);

  return (
    <>
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

          {/* Windows section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Windows {windows.length > 0 ? `(${windows.length})` : ''}
              </Text>
            </View>

            {windows.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="grid-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyText}>No windows yet</Text>
                <Text style={styles.emptySubtext}>
                  Create a window to start capturing photos in organized groups.
                </Text>
              </View>
            ) : (
              windows.map((window) => (
                <WindowCard
                  key={window.id}
                  window={window}
                  onPress={() => openWindow(window.id)}
                />
              ))
            )}

            <TouchableOpacity
              style={styles.addWindowBtn}
              onPress={openCreateWindow}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
              <Text style={styles.addWindowText}>New Window</Text>
            </TouchableOpacity>
          </View>

          {/* Site/Elevation photos */}
          {sitePhotos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Site & Elevation Photos ({sitePhotos.length})
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
              >
                {sitePhotos.map((photo) => (
                  <PhotoThumbnail
                    key={photo.id}
                    photo={photo}
                    onPress={() => router.push(`/(app)/${id}/photo/${photo.id}`)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

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
      </SafeAreaView>

      {/* Create Window Modal */}
      <Modal
        visible={createWindowModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreateWindowModal(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setCreateWindowModal(false)} style={styles.modalClose}>
              <Ionicons name="close" size={26} color={Colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Window</Text>
            <View style={{ width: 34 }} />
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.label}>Window Number *</Text>
            <TextInput
              style={styles.input}
              value={newWindowNumber}
              onChangeText={setNewWindowNumber}
              placeholder="e.g. 1"
              keyboardType="number-pad"
              autoFocus
            />

            <Text style={styles.label}>Name (optional)</Text>
            <TextInput
              style={styles.input}
              value={newWindowName}
              onChangeText={setNewWindowName}
              placeholder="e.g. North Transept, Chancel Left"
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleCreateWindow}
            />

            <TouchableOpacity
              style={[styles.createBtn, creating && styles.createBtnDisabled]}
              onPress={handleCreateWindow}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
                  <Text style={styles.createBtnText}>Create Window</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
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
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
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
  addWindowBtn: {
    height: 56,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  addWindowText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  photoRow: {
    paddingBottom: 4,
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
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalClose: { padding: 4 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.textDark },
  modalBody: { flex: 1, padding: 16, gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textDark, marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.textDark,
    backgroundColor: Colors.white,
    marginBottom: 12,
  },
  createBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
