import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FolderType, type FolderId, type MailFolder } from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly accountName: string;
  readonly accountEmail: string;
  readonly folders: readonly MailFolder[];
  readonly currentFolderId: FolderId;
  readonly onSelectFolder: (id: FolderId) => void;
}

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

const TYPE_GLYPH: Record<string, string> = {
  [FolderType.Inbox]: '↧',
  [FolderType.Sent]: '➤',
  [FolderType.Drafts]: '✎',
  [FolderType.Archive]: '▤',
  [FolderType.Deleted]: '⌫',
  [FolderType.Junk]: '⊘',
  [FolderType.Outbox]: '↥',
};

/**
 * Seitliches Schubfach (wie in der Vorschau): Konto-Kopf, primäres Postfach und die
 * Ordnerliste mit Ungelesen-Zählern. Tippen wählt den aktiven Ordner für die Mail-Liste.
 */
export function FolderDrawer({
  visible,
  onClose,
  accountName,
  accountEmail,
  folders,
  currentFolderId,
  onSelectFolder,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.scrim} onPress={onClose} />
        <View style={s.panel}>
          <ScrollView contentContainerStyle={s.panelContent}>
            <View style={s.acct}>
              <View style={s.ava}>
                <Text style={s.avaText}>{initials(accountName)}</Text>
              </View>
              <View style={s.acctBody}>
                <Text style={s.acctName} numberOfLines={1}>
                  {accountName}
                </Text>
                <Text style={s.acctMail} numberOfLines={1}>
                  {accountEmail}
                </Text>
              </View>
            </View>

            <Text style={s.section}>Postfächer</Text>
            <View style={s.mbx}>
              <Text style={s.mbxName} numberOfLines={1}>
                Mein Postfach
              </Text>
              <Text style={s.mbxAddr} numberOfLines={1}>
                {accountEmail}
              </Text>
            </View>

            <Text style={s.section}>Ordner</Text>
            {folders.map((f) => {
              const active = f.id === currentFolderId;
              return (
                <Pressable
                  key={f.id}
                  style={({ pressed }) => [
                    s.frow,
                    active ? s.frowActive : null,
                    pressed ? s.frowPressed : null,
                  ]}
                  onPress={() => {
                    onSelectFolder(f.id);
                  }}
                >
                  <Text style={[s.fglyph, active ? s.fglyphActive : null]}>
                    {TYPE_GLYPH[f.type] ?? '▸'}
                  </Text>
                  <Text style={[s.fname, active ? s.fnameActive : null]} numberOfLines={1}>
                    {f.displayName}
                  </Text>
                  {f.unreadCount > 0 ? (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{f.unreadCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    acct: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      flexDirection: 'row',
      gap: space.sm,
      padding: space.md,
    },
    acctBody: { flex: 1 },
    acctMail: { color: 'rgba(255,255,255,0.85)', fontSize: typography.caption.size },
    acctName: { color: t.onBrand, fontSize: typography.body.size, fontWeight: '700' },
    ava: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.25)',
      borderRadius: radius.pill,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    avaText: { color: t.onBrand, fontWeight: '700' },
    badge: {
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.pill,
      paddingHorizontal: space.xs,
      paddingVertical: 1,
    },
    badgeText: { color: t.onBrand, fontSize: 11, fontWeight: '700' },
    fglyph: { color: t.c.textSecondary, fontSize: typography.body.size, width: 22 },
    fglyphActive: { color: t.c.brandPrimary },
    fname: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size },
    fnameActive: { color: t.c.brandPrimary, fontWeight: '700' },
    frow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: 11,
    },
    frowActive: { backgroundColor: t.mode === 'dark' ? '#1B2740' : '#EAF0FE' },
    frowPressed: { backgroundColor: t.rowActive },
    mbx: { paddingHorizontal: space.md, paddingVertical: space.xs },
    mbxAddr: { color: t.c.textSecondary, fontSize: typography.caption.size },
    mbxName: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '600' },
    overlay: { flex: 1, flexDirection: 'row' },
    panel: {
      backgroundColor: t.c.bgCanvas,
      bottom: 0,
      left: 0,
      maxWidth: 340,
      position: 'absolute',
      top: 0,
      width: '84%',
    },
    panelContent: { paddingBottom: space.xl },
    scrim: { backgroundColor: 'rgba(0,0,0,0.4)', flex: 1 },
    section: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      fontWeight: '700',
      letterSpacing: 0.5,
      paddingHorizontal: space.md,
      paddingTop: space.md,
      paddingBottom: space.xxs,
      textTransform: 'uppercase',
    },
  });
}
