import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  buildFolderTree,
  FolderType,
  type FolderId,
  type FolderNode,
  type MailFolder,
} from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import type { SharedMailbox } from '../composition/sharedMailboxes';
import { ScreenHeader } from '../components/ScreenHeader';
import { Icon, IconButton, type IconName } from '../components/Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

/** Eine Baumzeile, flachgeklopft: Ordner + Tiefe + ob Unterordner vorhanden. */
interface FlatFolder {
  readonly folder: MailFolder;
  readonly depth: number;
  readonly hasChildren: boolean;
}

function flattenTree(
  nodes: readonly FolderNode[],
  depth: number,
  collapsed: ReadonlySet<string>,
  acc: FlatFolder[],
): void {
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    acc.push({ folder: node.folder, depth, hasChildren });
    if (hasChildren && !collapsed.has(node.folder.id)) {
      flattenTree(node.children, depth + 1, collapsed, acc);
    }
  }
}

interface Props {
  readonly onBack: () => void;
  readonly accountName: string;
  readonly accountEmail: string;
  readonly folders: readonly MailFolder[];
  readonly currentFolderId: FolderId;
  readonly onSelectFolder: (id: FolderId) => void;
  readonly sharedMailboxes?: readonly SharedMailbox[];
  readonly onOpenSharedMailbox?: (mailbox: SharedMailbox) => void;
}

function initials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

const TYPE_ICON: Record<string, IconName> = {
  [FolderType.Inbox]: 'inbox',
  [FolderType.Sent]: 'send',
  [FolderType.Drafts]: 'edit',
  [FolderType.Archive]: 'archive',
  [FolderType.Deleted]: 'trash',
  [FolderType.Junk]: 'shield',
  [FolderType.Outbox]: 'send',
};

/**
 * Vollseitige Postfach-Ansicht: Konto-Kopf plus alle eigenen Ordner (Baum) und die
 * freigegebenen Postfächer — übersichtlich auf einer ganzen Seite statt im halben Schubfach.
 * Ein Pfeil oben führt zurück in die Nachrichtenliste.
 */
export function FolderListScreen({
  onBack,
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

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const shared = sharedMailboxes ?? [];

  const flatFolders = useMemo(() => {
    const tree = buildFolderTree(folders);
    const acc: FlatFolder[] = [];
    flattenTree(tree, 0, collapsed, acc);
    return acc;
  }, [folders, collapsed]);

  const renderFolderRow = ({ folder: f, depth, hasChildren }: FlatFolder): React.JSX.Element => {
    const active = f.id === currentFolderId;
    const expanded = !collapsed.has(f.id);
    return (
      <View key={f.id} style={[s.row, active ? s.rowActive : null]}>
        <View style={{ width: depth * 18 }} />
        {hasChildren ? (
          <Pressable style={s.disclosure} hitSlop={8} onPress={() => toggle(f.id)}>
            <Icon
              name={expanded ? 'chevronDown' : 'chevronRight'}
              size={16}
              color={t.c.textSecondary}
            />
          </Pressable>
        ) : (
          <View style={s.disclosure} />
        )}
        <Pressable style={s.rowMain} onPress={() => onSelectFolder(f.id)}>
          <Icon
            name={TYPE_ICON[f.type] ?? 'folder'}
            size={20}
            color={active ? t.c.brandPrimary : t.c.textSecondary}
          />
          <Text style={[s.rowName, active ? s.rowNameActive : null]} numberOfLines={1}>
            {f.displayName}
          </Text>
          {f.unreadCount > 0 ? (
            <View style={s.badge}>
              <Text style={s.badgeText}>{f.unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <ScreenHeader
        title="Postfach"
        left={<IconButton name="chevronLeft" color={t.c.textPrimary} onPress={onBack} />}
      />
      <ScrollView contentContainerStyle={s.content}>
        {/* Konto-Kopf als kräftige Markenkarte */}
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

        <Text style={s.section}>Postfach-Ordner</Text>
        <View style={s.card}>{flatFolders.map(renderFolderRow)}</View>

        {shared.length > 0 ? (
          <>
            <Text style={s.section}>Freigegebene Ordner</Text>
            <View style={s.card}>
              {shared.map((mb) => {
                const key = `shared:${mb.email}`;
                const open = collapsed.has(key); // freigegebene standardmäßig ZU
                return (
                  <View key={key}>
                    <Pressable style={s.groupRow} onPress={() => toggle(key)} hitSlop={4}>
                      <Icon
                        name={open ? 'chevronDown' : 'chevronRight'}
                        size={18}
                        color={t.c.textSecondary}
                      />
                      <View style={s.groupBody}>
                        <Text style={s.groupTitle} numberOfLines={1}>
                          {mb.displayName}
                        </Text>
                        <Text style={s.groupSub} numberOfLines={1}>
                          {mb.email}
                        </Text>
                      </View>
                    </Pressable>
                    {open ? (
                      <View style={s.row}>
                        <View style={s.disclosure} />
                        <Pressable style={s.rowMain} onPress={() => onOpenSharedMailbox?.(mb)}>
                          <Icon name="inbox" size={20} color={t.c.textSecondary} />
                          <Text style={s.rowName} numberOfLines={1}>
                            Posteingang
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    acct: {
      alignItems: 'center',
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.lg,
      flexDirection: 'row',
      gap: space.sm,
      marginBottom: space.md,
      padding: space.md,
    },
    acctBody: { flex: 1, minWidth: 0 },
    acctMail: { color: 'rgba(255,255,255,0.85)', fontSize: typography.caption.size },
    acctName: { color: t.onBrand, fontSize: typography.headline.size, fontWeight: '800' },
    ava: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.25)',
      borderRadius: radius.pill,
      height: 52,
      justifyContent: 'center',
      width: 52,
    },
    avaText: { color: t.onBrand, fontSize: typography.headline.size, fontWeight: '800' },
    badge: {
      backgroundColor: t.c.brandPrimary,
      borderRadius: radius.pill,
      minWidth: 22,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    badgeText: { color: t.onBrand, fontSize: 12, fontWeight: '700', textAlign: 'center' },
    card: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.lg,
      marginBottom: space.md,
      overflow: 'hidden',
      paddingVertical: space.xxs,
    },
    content: { padding: space.md, paddingBottom: space.xxl },
    disclosure: { alignItems: 'center', justifyContent: 'center', width: 26 },
    groupBody: { flex: 1, minWidth: 0 },
    groupRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.xs,
      paddingHorizontal: space.sm,
      paddingVertical: 14,
    },
    groupSub: { color: t.c.textSecondary, fontSize: typography.caption.size },
    groupTitle: { color: t.c.textPrimary, fontSize: typography.body.size, fontWeight: '700' },
    row: { alignItems: 'center', flexDirection: 'row', paddingRight: space.sm },
    rowActive: { backgroundColor: t.mode === 'dark' ? '#1B2740' : '#EAF0FE' },
    rowMain: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: space.sm,
      minWidth: 0,
      paddingLeft: space.sm,
      paddingVertical: 13,
    },
    rowName: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size, fontWeight: '600' },
    rowNameActive: { color: t.c.brandPrimary, fontWeight: '800' },
    screen: { backgroundColor: t.c.bgCanvas, flex: 1 },
    section: {
      color: t.c.textSecondary,
      fontSize: typography.caption.size,
      fontWeight: '700',
      letterSpacing: 0.4,
      marginBottom: space.xs,
      marginLeft: space.xxs,
      textTransform: 'uppercase',
    },
  });
}
