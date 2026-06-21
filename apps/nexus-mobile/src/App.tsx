import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { color } from '@nexus/ui-kit';
import type { MessageId } from '@nexus/domain';
import { createContainer, type AppContainer } from './composition/container';
import { MailboxScreen } from './screens/MailboxScreen';
import { MessageScreen } from './screens/MessageScreen';

export type RootStackParamList = {
  Mailbox: undefined;
  Message: { messageId: MessageId };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): React.JSX.Element {
  const [container, setContainer] = useState<AppContainer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createContainer()
      .then(setContainer)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Initialisierung fehlgeschlagen');
      });
  }, []);

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (container === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.brandPrimary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Mailbox" options={{ title: 'NEXUS' }}>
            {(props) => <MailboxScreen {...props} container={container} />}
          </Stack.Screen>
          <Stack.Screen name="Message" options={{ title: 'Nachricht' }}>
            {(props) => <MessageScreen {...props} container={container} />}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  error: { color: color.danger, padding: 24, textAlign: 'center' },
});
