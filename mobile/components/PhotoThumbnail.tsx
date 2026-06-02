import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import api, { Photo } from '@/services/api';

interface Props {
  photo: Photo;
  onPress: () => void;
}

export function PhotoThumbnail({ photo, onPress }: Props) {
  const [imgError, setImgError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const thumbUrl = photo.thumbnail_url
    ? api.photoUrl(photo.thumbnail_url)
    : photo.storage_url
    ? api.photoUrl(photo.storage_url)
    : null;

  const windowLabel = photo.window_number
    ? `W${photo.window_number}${photo.panel_letter ?? ''}`
    : photo.filename?.replace(/\.[^.]+$/, '') ?? null;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.imageWrap}>
        {thumbUrl && !imgError ? (
          <>
            <Image
              source={{ uri: thumbUrl }}
              style={styles.image}
              onError={() => setImgError(true)}
              onLoadEnd={() => setLoading(false)}
            />
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color={Colors.primary} size="small" />
              </View>
            )}
          </>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={28} color={Colors.border} />
          </View>
        )}

        {windowLabel && (
          <View style={styles.windowBadge}>
            <Text style={styles.windowBadgeText}>{windowLabel}</Text>
          </View>
        )}
      </View>

      {photo.notes ? (
        <Text style={styles.notes} numberOfLines={2}>
          {photo.notes}
        </Text>
      ) : (
        <Text style={styles.noNotes}>No notes</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 140,
    marginRight: 12,
  },
  imageWrap: {
    width: 140,
    height: 105,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.primaryLight,
    marginBottom: 6,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  windowBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  notes: {
    fontSize: 12,
    color: Colors.textDark,
    lineHeight: 16,
  },
  noNotes: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});

export default PhotoThumbnail;
