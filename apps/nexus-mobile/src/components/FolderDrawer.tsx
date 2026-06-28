import React, { useMemo, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FolderType, type FolderId, type MailFolder } from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import type { SharedMailbox } from '../composition/sharedMailboxes';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly accountName: string;
  readonly accountEmail: string;
  readonly folders: readonly MailFolder[];
  readonly currentFolderId: FolderId;
  readonly onSelectFolder: (id: FolderId) => void;
  /** Freigegebene Postfächer des Kontos — als eigene, einklappbare Abschnitte. */
  readonly sharedMailboxes?: readonly SharedMailbox[];
  /** Öffnet ein freigegebenes Postfach (Nur-Lese-Ansicht). */
  readonly onOpenSharedMailbox?: (mailbox: SharedMailbox) => void;
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
 * Seitliches Schubfach: Konto-Kopf plus ein- und ausklappbare Postfächer. „Mein Postfach"
 * listet die eigenen Ordner; jedes freigegebene Postfach erscheint als eigener, einklappbarer
 * Abschnitt. Großzügige Tippflächen für gute Erreichbarkeit.
 */
export function FolderDrawer({
  visible,
  onClose,
  accountName,
  accountEmail,
  folders,
  currentFolderId,
  onSelectFolder,
  sharedMailboxes,
  onOpenSharedMailbox,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  // Eingeklappte Abschnitte (per Schlüssel). Eigenes Postfach standardmäßig offen, freigegebene zu.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const shared = sharedMailboxes ?? [];

  const renderFolderRow = (f: MailFolder): React.JSX.Element => {
    const active = f.id === currentFolderId;
    return (
      <Pressable
        key={f.id}
        style={({ pressed }) => [
          s.frow,
          active ? s.frowActive : null,
          pressed ? s.frowPressed : null,
        ]}
        onPress={() => onSelectFolder(f.id)}
      >
        <Text style={[s.fglyph, active ? s.fglyphActive : null]}>{TYPE_GLYPH[f.type] ?? '▸'}</Text>
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
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.scrim} onPress={onClose} />
        <View style={s.panel}>
          <SafeAreaView style={s.acct}>
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
          </SafeAreaView>

          <ScrollView contentContainerStyle={s.panelContent}>
            {/* Eigenes Postfach (einklappbar) */}
            <GroupHeader
              title="Mein Postfach"
              subtitle={accountEmail}
              open={!collapsed.has('self')}
              onPress={() => toggle('self')}
              s={s}
            />
            {!collapsed.has('self') ? folders.map(renderFolderRow) : null}

            {/* Freigegebene Postfächer — je ein eigener, einklappbarer Abschnitt */}
            {shared.map((mb) => {
              const key = `shared:${mb.email}`;
              const open = collapsed.has(key); // freigegebene standardmäßig ZU (collapsed-Set = offen)
              return (
                <View key={key}>
                  <GroupHeader
                    title={mb.displayName}
                    subtitle={mb.email}
                    open={open}
                    onPress={() => toggle(key)}
                    s={s}
                  />
                  {open ? (
                    <Pressable
                      style={({ pressed }) => [s.frow, pressed ? s.frowPressed : null]}
                      onPress={() => onOpenSharedMailbox?.(mb)}
                    >
                      <Text style={s.fglyph}>{TYPE_GLYPH[FolderType.Inbox]}</Text>
                      <Text style={s.fname} numberOfLines={1}>
                        Posteingang
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Einklappbarer Abschnittskopf mit Chevron + Titel/Untertitel. */
function GroupHeader({
  title,
  subtitle,
  open,
  onPress,
  s,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly open: boolean;
  readonly onPress: () => void;
  readonly s: Styles;
}): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [s.group, pressed ? s.frowPressed : null]}
      onPress={onPress}
      hitSlop={4}
    >
      <Text style={s.chevron}>{open ? '▾' : '▸'}</Text>
      <View style={s.groupBody}>
        <Text style={s.groupTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined ? (
          <Text style={s.groupSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type Styles = ReturnType<typeof makeStyles>;

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
    acctName: { color: t.onBrand, fontSize: typography.headline.size, fontWeight: '700' },
    ava: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.25)',
      borderRadius: radius.pill,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    avaText: { color: t.onBrand, fontSize: typography.body.size, fontWeight: '700' },
    badge: {
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.pill,
      minWidth: 22,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    badgeText: { color: t.onBrand, fontSize: 12, fontWeight: '700', textAlign: 'center' },
    chevron: { color: t.c.textSecondary, fontSize: typography.body.size, width: 18 },
    fglyph: { color: t.c.textSecondary, fontSize: typography.headline.size, width: 28 },
    fglyphActive: { color: t.c.brandPrimary },
    fname: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size },
    fnameActive: { color: t.c.brandPrimary, fontWeight: '700' },
    frow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingLeft: space.lg,
      paddingVertical: 15,
    },
    frowActive: { backgroundColor: t.mode === 'dark' ? '#1B2740' : '#EAF0FE' },
    frowPressed: { backgroundColor: t.rowActive },
    group: {
      alignItems: 'center',
      borderTopColor: t.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: space.xs,
      paddingHorizontal: space.md,
      paddingVertical: 14,
    },
    groupBody: { flex: 1 },
    groupSub: { color: t.c.textSecondary, fontSize: typography.caption.size },
    groupTitle: {
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      fontWeight: '700',
    },
    overlay: { flex: 1, flexDirection: 'row' },
    panel: {
      backgroundColor: t.c.bgCanvas,
      bottom: 0,
      left: 0,
      maxWidth: 360,
      position: 'absolute',
      top: 0,
      width: '86%',
    },
    panelContent: { paddingBottom: space.xl },
    scrim: { backgroundColor: 'rgba(0,0,0,0.4)', flex: 1 },
  });
}
