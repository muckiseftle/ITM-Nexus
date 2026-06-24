import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  readonly children: React.ReactNode;
}

interface State {
  readonly error: Error | null;
}

/**
 * Fängt Render-/Lebenszyklus-Fehler der darunterliegenden UI ab und zeigt eine ruhige
 * Fallback-Ansicht statt eines harten Absturzes (Weißbild). Bewusst themenfrei und
 * abhängigkeitsarm, damit der Fallback selbst nicht fehlschlagen kann.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Etwas ist schiefgelaufen</Text>
        <Text style={styles.detail}>
          Die Ansicht konnte nicht angezeigt werden. Du kannst es erneut versuchen.
        </Text>
        <Text style={styles.technical} numberOfLines={4}>
          {error.message}
        </Text>
        <Pressable style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  container: {
    alignItems: 'center',
    backgroundColor: '#0B0F14',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  detail: { color: '#9AA5B1', fontSize: 15, marginTop: 8, textAlign: 'center' },
  technical: { color: '#5B6573', fontSize: 12, marginTop: 16, textAlign: 'center' },
  title: { color: '#E6EAF0', fontSize: 22, fontWeight: '700' },
});
