/**
 * Create Project Screen — form to set up a new project.
 * On success, navigates directly to the project detail.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/services/api';
import Colors from '@/constants/Colors';

export default function NewProjectScreen() {
  const [name, setName] = useState('');
  const [churchName, setChurchName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [saving, setSaving] = useState(false);

  const isValid = name.trim().length > 0;

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const project = await api.createProject({
        name: name.trim(),
        church_name: churchName.trim() || undefined,
        address_street: street.trim() || undefined,
        address_city: city.trim() || undefined,
        address_state: state.trim() || undefined,
        address_zip: zip.trim() || undefined,
      });
      // Navigate directly into the new project
      router.replace(`/(app)/${project.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not create project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: 'New Project',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
              <Ionicons name="arrow-back" size={24} color={Colors.white} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Project Info</Text>

          <Text style={styles.label}>Project Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. St. Mary's Catholic Church"
            placeholderTextColor={Colors.textLight}
            returnKeyType="next"
            autoCapitalize="words"
          />

          <Text style={styles.label}>Church / Building Name</Text>
          <TextInput
            style={styles.input}
            value={churchName}
            onChangeText={setChurchName}
            placeholder="If different from project name"
            placeholderTextColor={Colors.textLight}
            returnKeyType="next"
            autoCapitalize="words"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address</Text>

          <Text style={styles.label}>Street Address</Text>
          <TextInput
            style={styles.input}
            value={street}
            onChangeText={setStreet}
            placeholder="123 Church Street"
            placeholderTextColor={Colors.textLight}
            returnKeyType="next"
            autoCapitalize="words"
          />

          <View style={styles.row}>
            <View style={styles.flex2}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="Denver"
                placeholderTextColor={Colors.textLight}
                returnKeyType="next"
                autoCapitalize="words"
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="CO"
                placeholderTextColor={Colors.textLight}
                returnKeyType="next"
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>ZIP</Text>
              <TextInput
                style={styles.input}
                value={zip}
                onChangeText={setZip}
                placeholder="80202"
                placeholderTextColor={Colors.textLight}
                returnKeyType="done"
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, !isValid && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!isValid || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color={Colors.white} />
              <Text style={styles.saveBtnText}>Create Project</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingBottom: 60, gap: 0 },
  section: {
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
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.textDark,
    backgroundColor: Colors.white,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  saveBtn: {
    height: 56,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
});
