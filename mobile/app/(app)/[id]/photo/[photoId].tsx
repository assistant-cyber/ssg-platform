/**
 * Photo Review Screen — full-screen view of a single photo.
 * Edit notes, save, or delete.
 * v2: full-screen notes modal + voice dictation + fixed autocorrect.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    Image,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Modal,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { Photo } from '@/services/api';
import Colors from '@/constants/Colors';
import { ShorthandHint } from '@/components/ShorthandHint';
import { SafeAreaView } from 'react-native-safe-area-context';
import Voice, {
    SpeechResultsEvent,
    SpeechErrorEvent,
} from '@react-native-voice/voice';

export default function PhotoReviewScreen() {
    const { id: projectId, photoId } = useLocalSearchParams<{
          id: string;
          photoId: string;
    }>();

  const [photo, setPhoto] = useState<Photo | null>(null);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [partialText, setPartialText] = useState('');
    const notesBase = useRef('');

  useEffect(() => { notesBase.current = notes; }, [notes]);

  useEffect(() => {
        (async () => {
                try {
                          const p = await api.request<Photo>('GET', `/photos/${photoId}`);
                          setPhoto(p);
                          setNotes(p.notes ?? '');
                } catch (err: any) {
                          Alert.alert('Error', err.message ?? 'Could not load photo.');
                          router.back();
                } finally {
                          setLoading(false);
                }
        })();
  }, [photoId]);

  useEffect(() => {
        Voice.onSpeechResults = (e: SpeechResultsEvent) => {
                const transcript = e.value?.[0] ?? '';
                if (transcript) {
                          const base = notesBase.current.trimEnd();
                          setNotes(base ? `${base} ${transcript}` : transcript);
                          setDirty(true);
                }
                setPartialText('');
                setIsListening(false);
        };
        Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
                setPartialText(e.value?.[0] ?? '');
        };
        Voice.onSpeechError = (_e: SpeechErrorEvent) => {
                setIsListening(false);
                setPartialText('');
        };
        Voice.onSpeechEnd = () => setIsListening(false);
        return () => { Voice.destroy().then(Voice.removeAllListeners); };
  }, []);

  const toggleVoice = async () => {
        try {
                if (isListening) {
                          await Voice.stop();
                          setIsListening(false);
                } else {
                          setPartialText('');
                          await Voice.start('en-US');
                          setIsListening(true);
                }
        } catch {
                Alert.alert('Voice unavailable', 'Speech recognition could not start.');
        }
  };

  const handleSave = async () => {
        if (!photo || saving) return;
        setSaving(true);
        try {
                const updated = await api.updatePhoto(photo.id, { notes: notes.trim() });
                setPhoto(updated);
                setDirty(false);
                setModalVisible(false);
        } catch (err: any) {
                Alert.alert('Error', err.message ?? 'Could not save.');
        } finally {
                setSaving(false);
        }
  };

  const handleDelete = () => {
        Alert.alert(
                'Delete Photo',
                'Are you sure you want to delete this photo? This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: async () => {
                                            if (!photo) return;
                                            setDeleting(true);
                                            try {
                                                            await api.deletePhoto(photo.id);
                                                            router.back();
                                            } catch (err: any) {
                                                            Alert.alert('Error', err.message ?? 'Could not delete.');
                                                            setDeleting(false);
                                            }
                              },
                  },
                        ],
              );
  };

  if (loading || !photo) {
        return (
                <View style={styles.center}>
                          <ActivityIndicator size="large" color={Colors.primary} />
                </View>View>
              );
  }

  const imageUrl = api.photoUrl(photo.storage_url);
    const windowLabel = photo.window_number
      ? `Window ${photo.window_number}${photo.panel_letter ?? ''}`
          : photo.filename?.replace(/\.[^.]+$/, '') ?? 'Photo';

  return (
        <>
              <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                      >
                      <Stack.Screen
                                  options={{
                                                title: windowLabel,
                                                headerRight: () => (
                                                                <TouchableOpacity
                                                                                  onPress={handleDelete}
                                                                                  disabled={deleting}
                                                                                  style={{ padding: 4 }}
                                                                                >
                                                                  {deleting ? (
                                                                                                    <ActivityIndicator color={Colors.white} size="small" />
                                                                                                  ) : (
                                                                                                    <Ionicons name="trash-outline" size={22} color={Colors.white} />
                                                                                                  )}
                                                                </TouchableOpacity>TouchableOpacity>
                                                              ),
                                  }}
                                />
              
                      <SafeAreaView style={styles.safe} edges={['bottom']}>
                                <View style={styles.imageContainer}>
                                            <Image
                                                            source={{ uri: imageUrl }}
                                                            style={styles.image}
                                                            resizeMode="contain"
                                                          />
                                </View>View>
                      
                                <ScrollView
                                              style={styles.notesPanel}
                                              contentContainerStyle={styles.notesPanelContent}
                                              keyboardShouldPersistTaps="handled"
                                            >
                                            <ShorthandHint />
                                
                                            <View style={styles.metaRow}>
                                              {photo.window_number && (
                                                              <View style={styles.metaBadge}>
                                                                                <Text style={styles.metaBadgeText}>
                                                                                                    W{photo.window_number}{photo.panel_letter ?? ''}
                                                                                </Text>Text>
                                                              </View>View>
                                                          )}
                                              {photo.elevation && (
                                                              <View style={styles.metaBadge}>
                                                                                <Text style={styles.metaBadgeText}>{photo.elevation}</Text>Text>
                                                              </View>View>
                                                          )}
                                                          <Text style={styles.metaDate}>
                                                            {new Date(photo.uploaded_at).toLocaleDateString()}
                                                          </Text>Text>
                                            </View>View>
                                
                                            <Text style={styles.label}>Window notes</Text>Text>
                                
                                            <TouchableOpacity
                                                            style={styles.notesPreview}
                                                            onPress={() => setModalVisible(true)}
                                                            activeOpacity={0.75}
                                                          >
                                                          <View style={{ flex: 1 }}>
                                                            {notes ? (
                                                                              <Text style={styles.notesPreviewText} numberOfLines={3}>
                                                                                {notes}
                                                                              </Text>Text>
                                                                            ) : (
                                                                              <Text style={styles.notesPlaceholder}>
                                                                                                  Tap to add notes or use voice…
                                                                              </Text>Text>
                                                                          )}
                                                          </View>View>
                                                          <View style={styles.notesPreviewIcons}>
                                                                          <Ionicons name="mic-outline" size={18} color={Colors.primary} />
                                                                          <Ionicons name="expand-outline" size={18} color={Colors.textMuted} />
                                                          </View>View>
                                            </TouchableOpacity>TouchableOpacity>
                                
                                            <TouchableOpacity
                                                            style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
                                                            onPress={handleSave}
                                                            disabled={!dirty || saving}
                                                          >
                                              {saving ? (
                                                                            <ActivityIndicator color={Colors.white} size="small" />
                                                                          ) : (
                                                                            <>
                                                                                              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
                                                                                              <Text style={styles.saveBtnText}>Save Notes</Text>Text>
                                                                            </>>
                                                                          )}
                                            </TouchableOpacity>TouchableOpacity>
                                </ScrollView>ScrollView>
                      </SafeAreaView>SafeAreaView>
              </KeyboardAvoidingView>KeyboardAvoidingView>
        
              <Modal
                        visible={modalVisible}
                        animationType="slide"
                        presentationStyle="pageSheet"
                        onRequestClose={() => setModalVisible(false)}
                      >
                      <SafeAreaView style={styles.modalSafe}>
                                <View style={styles.modalHeader}>
                                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalClose}>
                                                          <Ionicons name="chevron-down" size={26} color={Colors.textDark} />
                                            </TouchableOpacity>TouchableOpacity>
                                            <Text style={styles.modalTitle}>{windowLabel}</Text>Text>
                                            <View style={{ width: 34 }} />
                                </View>View>
                      
                                <KeyboardAvoidingView
                                              style={{ flex: 1 }}
                                              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                                            >
                                            <View style={styles.modalBody}>
                                              {(isListening || partialText !== '') && (
                                                              <View style={styles.listeningBar}>
                                                                                <Ionicons name="radio-button-on" size={14} color={Colors.white} />
                                                                                <Text style={styles.listeningText} numberOfLines={2}>
                                                                                  {partialText || 'Listening…'}
                                                                                </Text>Text>
                                                              </View>View>
                                                          )}
                                            
                                                          <TextInput
                                                                            style={styles.modalInput}
                                                                            value={notes}
                                                                            onChangeText={(v) => { setNotes(v); setDirty(true); }}
                                                                            placeholder="Type notes or tap the mic to dictate…"
                                                                            placeholderTextColor={Colors.textLight}
                                                                            multiline
                                                                            autoCapitalize="none"
                                                                            autoCorrect={false}
                                                                            spellCheck={false}
                                                                            autoComplete="off"
                                                                            textContentType="none"
                                                                            autoFocus
                                                                            textAlignVertical="top"
                                                                          />
                                            
                                                          <View style={styles.actionRow}>
                                                                          <TouchableOpacity
                                                                                              style={[styles.voiceBtn, isListening && styles.voiceBtnActive]}
                                                                                              onPress={toggleVoice}
                                                                                            >
                                                                                            <Ionicons
                                                                                                                  name={isListening ? 'mic' : 'mic-outline'}
                                                                                                                  size={22}
                                                                                                                  color={isListening ? Colors.white : Colors.primary}
                                                                                                                />
                                                                                            <Text style={[styles.voiceBtnLabel, isListening && styles.voiceBtnLabelActive]}>
                                                                                              {isListening ? 'Stop' : 'Voice'}
                                                                                              </Text>Text>
                                                                          </TouchableOpacity>TouchableOpacity>
                                                          
                                                                          <TouchableOpacity
                                                                                              style={[styles.saveBtnModal, (!dirty || saving) && styles.saveBtnDisabled]}
                                                                                              onPress={handleSave}
                                                                                              disabled={!dirty || saving}
                                                                                            >
                                                                            {saving ? (
                                                                                                                  <ActivityIndicator color={Colors.white} size="small" />
                                                                                                                ) : (
                                                                                                                  <>
                                                                                                                                        <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
                                                                                                                                        <Text style={styles.saveBtnText}>Save</Text>Text>
                                                                                                                    </>>
                                                                                                                )}
                                                                          </TouchableOpacity>TouchableOpacity>
                                                          </View>View>
                                            </View>View>
                                </KeyboardAvoidingView>KeyboardAvoidingView>
                      </SafeAreaView>SafeAreaView>
              </Modal>Modal>
        </>>
      );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    imageContainer: { backgroundColor: Colors.charcoal, height: 260, width: '100%' },
    image: { flex: 1, width: '100%' },
    notesPanel: { flex: 1, backgroundColor: Colors.background },
    notesPanelContent: { padding: 16, paddingBottom: 32, gap: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    metaBadge: {
          backgroundColor: Colors.primaryLight,
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
    },
    metaBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.primaryDark },
    metaDate: { fontSize: 12, color: Colors.textMuted },
    label: { fontSize: 13, fontWeight: '700', color: Colors.textDark, marginBottom: 8 },
    notesPreview: {
          borderWidth: 1.5,
          borderColor: Colors.border,
          borderRadius: 12,
          padding: 14,
          backgroundColor: Colors.white,
          minHeight: 72,
          marginBottom: 14,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 8,
    },
    notesPreviewText: { fontSize: 15, color: Colors.textDark, fontFamily: 'monospace' },
    notesPlaceholder: { fontSize: 15, color: Colors.textLight, fontStyle: 'italic' },
    notesPreviewIcons: { flexDirection: 'row', gap: 6, paddingTop: 2 },
    saveBtn: {
          height: 52,
          backgroundColor: Colors.primary,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
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
    modalBody: { flex: 1, padding: 16, gap: 12 },
    listeningBar: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: Colors.primary,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
    },
    listeningText: { color: Colors.white, fontSize: 14, fontWeight: '600', flex: 1 },
    modalInput: {
          flex: 1,
          borderWidth: 1.5,
          borderColor: Colors.border,
          borderRadius: 12,
          padding: 14,
          fontSize: 16,
          color: Colors.textDark,
          backgroundColor: Colors.white,
          textAlignVertical: 'top',
          fontFamily: 'monospace',
    },
    actionRow: { flexDirection: 'row', gap: 12, paddingBottom: 8 },
    voiceBtn: {
          height: 52,
          paddingHorizontal: 20,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: Colors.primary,
          backgroundColor: Colors.white,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
    },
    voiceBtnActive: { backgroundColor: Colors.primary },
    voiceBtnLabel: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
    voiceBtnLabelActive: { color: Colors.white },
    saveBtnModal: {
          flex: 1,
          height: 52,
          backgroundColor: Colors.primary,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
    },
});
</></></>
