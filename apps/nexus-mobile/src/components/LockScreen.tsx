import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, typography } from '@nexus/ui-kit';
import { NexusNative } from '../native/NexusNative';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  /** Wird nach erfolgreicher biometrischer Entsperrung aufgerufen. */
  readonly onUnlock: () => void;
}

/**
 * Vollflächige App-Sperre: blendet den Inhalt aus, bis der Nutzer sich per Face ID / Touch ID
 * (oder Geräte-Code als Fallback) authentifiziert. Versucht beim Erscheinen automatisch zu
 * entsperren; bei Abbruch/Fehlschlag bleibt die Sperre mit „Erneut versuchen" aktiv.
 */
export function LockScreen({ onUnlock }: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const authenticate = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await NexusNative.biometricAuthenticate('NEXUS entsperren');
      onUnlock();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, onUnlock]);

  // Beim Erscheinen automatisch einen Entsperr-Versuch starten.
  useEffect(() => {
    void authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.root}>
      <View style={s.center}>
        <View style={s.badge}>
          <Text style={s.badgeGlyph}>🔒</Text>
        </View>
        <Text style={s.title}>NEXUS gesperrt</Text>
        <Text style={s.subtitle}>
          {failed
            ? 'Entsperrung abgebrochen oder fehlgeschlagen.'
            : 'Zum Fortfahren bitte authentifizieren.'}
        </Text>
        <Pressable
          style={({ pressed }) => [s.button, pressed ? s.buttonPressed : null]}
          onPress={() => void authenticate()}
          disabled={busy}
        >
          <Text style={s.buttonText}>{busy ? 'Prüfe …' : 'Entsperren'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    badge: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary + '1A',
      borderRadius: radius.pill,
      height: 88,
      justifyContent: 'center',
      marginBottom: space.lg,
      width: 88,
    },
    badgeGlyph: { color: t.c.brandPrimary, fontSize: 40 },
    button: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.pill,
      marginTop: space.xl,
      paddingHorizontal: space.xl,
      paddingVertical: space.md,
    },
    buttonPressed: { opacity: 0.85 },
    buttonText: { color: t.onBrand, fontSize: typography.body.size, fontWeight: '700' },
    center: { alignItems: 'center', paddingHorizontal: space.xl },
    root: {
      alignItems: 'center',
      backgroundColor: t.c.bgCanvas,
      flex: 1,
      justifyContent: 'center',
    },
    subtitle: {
      color: t.c.textSecondary,
      fontSize: typography.body.size,
      marginTop: space.xs,
      textAlign: 'center',
    },
    title: { color: t.c.textPrimary, fontSize: typography.headline.size, fontWeight: '700' },
  });
}
