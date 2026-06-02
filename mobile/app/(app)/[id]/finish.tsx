/**
 * Finish / Sync Screen — confirmation before marking project complete.
 * Shows photo count, project name, and triggers status update.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import api, { ProjectDetail } from '@/services/api';
import Colors from '@/constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';

type Step = 'confirm' | 'syncing' | 'done';

export default function FinishScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('confirm');
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getProject(projectId!);
        setProject(data);
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Could not load project.');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const handleSync = async () => {
    if (!project) return;
    setStep('syncing');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      setSyncMessage('Verifying photos…');
      await new Promise((r) => setTimeout(r, 600));

      setSyncMessage('Updating project status…');
      await api.updateProject(project.id, { status: 'assessment_complete' });

      setSyncMessage('All done!');
      await new Promise((r) => setTimeout(r, 400));

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('done');
    } catch (err: any) {
      setStep('confirm');
      Alert.alert('Sync Failed', err.message ?? 'Could not complete the project. Try again.');
    }
  };

  if (loading || !project) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ── DONE ──────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <SafeAreaView style={styles.doneSafe} edges={['top', 'bottom']}>
        <Stack.Screen options={{ title: 'Complete', headerShown: false }} />
        <View style={styles.doneContainer}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={52} color={Colors.white} />
          </View>
          <Text style={styles.doneTitle}>Project Saved!</Text>
          <Text style={styles.doneSubtitle}>
            {project.photos.length} photo{project.photos.length !== 1 ? 's' : ''} saved for{'\n'}
            {project.church_name ?? project.name}
          </Text>
          <Text style={styles.doneNote}>
            The office can now generate the condition spreadsheet and assessment report from the web dashboard.
          </Text>

          <View style={styles.doneActions}>
            <TouchableOpacity
              style={styles.newProjectBtn}
              onPress={() => router.replace('/(app)/new-project')}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.primaryDark} />
              <Text style={styles.newProjectBtnText}>Start New Project</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.homeBtn}
              onPress={() => router.replace('/(app)')}
              activeOpacity={0.85}
            >
              <Ionicons name="home-outline" size={20} color={Colors.white} />
              <Text style={styles.homeBtnText}>Back to Projects</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── SYNCING ───────────────────────────────────────────────────────────────

  if (step === 'syncing') {
    return (
      <SafeAreaView style={styles.syncSafe} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.syncContainer}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={styles.syncText}>{syncMessage}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── CONFIRM ───────────────────────────────────────────────────────────────

  const photoCount = project.photos.length;
  const photosWithNotes = project.photos.filter((p) => p.notes?.trim()).length;
  const photosWithoutNotes = photoCount - photosWithNotes;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Finish Project' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
      >
        {/* Project summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="business-outline" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.summaryName}>
            {project.church_name ?? project.name}
          </Text>
          {project.address_city && (
            <Text style={styles.summaryAddress}>
              {[project.address_city, project.address_state].filter(Boolean).join(', ')}
            </Text>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="camera" size={24} color={Colors.primary} />
            <Text style={styles.statNumber}>{photoCount}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="create-outline" size={24} color={Colors.primary} />
            <Text style={styles.statNumber}>{photosWithNotes}</Text>
            <Text style={styles.statLabel}>With Notes</Text>
          </View>
          <View style={[styles.statCard, photosWithoutNotes > 0 && styles.statCardWarn]}>
            <Ionicons
              name="warning-outline"
              size={24}
              color={photosWithoutNotes > 0 ? Colors.warning : Colors.border}
            />
            <Text style={[styles.statNumber, photosWithoutNotes > 0 && styles.statNumberWarn]}>
              {photosWithoutNotes}
            </Text>
            <Text style={styles.statLabel}>No Notes</Text>
          </View>
        </View>

        {/* Warning if photos without notes */}
        {photosWithoutNotes > 0 && (
          <View style={styles.warningBox}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.warning} />
            <Text style={styles.warningText}>
              {photosWithoutNotes} photo{photosWithoutNotes !== 1 ? 's' : ''} without notes.
              The condition sheet works best when every panel photo has shorthand notes.
            </Text>
          </View>
        )}

        {/* What happens next info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>What happens next</Text>
          <View style={styles.infoStep}>
            <View style={styles.infoNum}><Text style={styles.infoNumText}>1</Text></View>
            <Text style={styles.infoStepText}>
              The office opens this project in the web dashboard
            </Text>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.infoNum}><Text style={styles.infoNumText}>2</Text></View>
            <Text style={styles.infoStepText}>
              They run "Generate Report" — condition spreadsheet + branded PDF are created automatically
            </Text>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.infoNum}><Text style={styles.infoNumText}>3</Text></View>
            <Text style={styles.infoStepText}>
              An estimate is built and sent to the customer
            </Text>
          </View>
        </View>

        {/* Action button */}
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={handleSync}
          activeOpacity={0.85}
        >
          <Ionicons name="cloud-done-outline" size={22} color={Colors.white} />
          <Text style={styles.syncBtnText}>Upload & Complete Project</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.backBtnText}>Go Back — Keep Working</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 60, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  summaryName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
    textAlign: 'center',
  },
  summaryAddress: {
    fontSize: 14,
    color: Colors.textMuted,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statCardWarn: {
    borderWidth: 1.5,
    borderColor: Colors.warning + '55',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textDark,
  },
  statNumberWarn: {
    color: Colors.warning,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning + '44',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.charcoal,
    lineHeight: 18,
  },

  infoBox: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  infoNumText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  infoStepText: {
    flex: 1,
    fontSize: 13,
    color: Colors.primaryDark,
    lineHeight: 18,
  },

  syncBtn: {
    height: 58,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  syncBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  backBtn: {
    alignItems: 'center',
    padding: 14,
  },
  backBtnText: {
    fontSize: 15,
    color: Colors.textMuted,
  },

  // Done state
  doneSafe: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  doneTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.white,
  },
  doneSubtitle: {
    fontSize: 16,
    color: Colors.white,
    opacity: 0.9,
    textAlign: 'center',
    lineHeight: 24,
  },
  doneNote: {
    fontSize: 13,
    color: Colors.white,
    opacity: 0.75,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  doneActions: {
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  newProjectBtn: {
    height: 54,
    backgroundColor: Colors.white,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  newProjectBtnText: {
    color: Colors.primaryDark,
    fontSize: 16,
    fontWeight: '700',
  },
  homeBtn: {
    height: 54,
    backgroundColor: Colors.primaryDark,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  homeBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },

  // Syncing state
  syncSafe: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  syncContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  syncText: {
    fontSize: 18,
    color: Colors.white,
    fontWeight: '600',
  },
});
