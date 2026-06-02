/**
 * Project List Screen — shows all projects for this technician.
 * Big "+" FAB creates a new project.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import api, { Project } from '@/services/api';
import Colors from '@/constants/Colors';
import { ProjectCard } from '@/components/ProjectCard';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProjectListScreen() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProjects = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.listProjects();
      setProjects(data);
    } catch (err: any) {
      if (!silent) {
        Alert.alert('Connection Error', err.message ?? 'Could not load projects.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time this screen comes into focus (e.g. after creating a project)
  useFocusEffect(
    useCallback(() => {
      fetchProjects(true);
    }, [fetchProjects]),
  );

  useEffect(() => {
    fetchProjects();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProjects(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hey{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </Text>
          <Text style={styles.headerTitle}>Projects</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading projects…</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          renderItem={({ item }) => (
            <ProjectCard
              project={item}
              onPress={() => router.push(`/(app)/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={56} color={Colors.border} />
              <Text style={styles.emptyTitle}>No projects yet</Text>
              <Text style={styles.emptyText}>
                Tap the + button to create your first project.
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(app)/new-project')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={32} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: Colors.primary,
  },
  greeting: {
    color: Colors.white,
    opacity: 0.8,
    fontSize: 14,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: '700',
  },
  logoutBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    minHeight: '100%',
    paddingBottom: 100,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textDark,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 36,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
