import { FolderType } from './enums';
import type { FolderId } from './ids';
import type { MailFolder } from './models';

/** Ein Ordner mit seinen (rekursiven) Unterordnern. */
export interface FolderNode {
  readonly folder: MailFolder;
  readonly children: readonly FolderNode[];
}

/** Reihenfolge der Spezialordner; alles andere (Custom) folgt alphabetisch danach. */
const SPECIAL_ORDER: readonly FolderType[] = [
  FolderType.Inbox,
  FolderType.Drafts,
  FolderType.Outbox,
  FolderType.Sent,
  FolderType.Archive,
  FolderType.Junk,
  FolderType.Deleted,
];

function rank(folder: MailFolder): number {
  const index = SPECIAL_ORDER.indexOf(folder.type);
  return index === -1 ? SPECIAL_ORDER.length : index;
}

function compareFolders(a: MailFolder, b: MailFolder): number {
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) {
    return byRank;
  }
  return a.displayName.localeCompare(b.displayName);
}

/**
 * Baut aus einer flachen Ordnerliste den Hierarchiebaum (Wurzeln = Ordner ohne bekanntes
 * `parentId`). Geschwister werden sortiert: Spezialordner in fester Reihenfolge, Custom
 * alphabetisch. Rein und seiteneffektfrei (Vorlage: `groupByConversation`).
 */
export function buildFolderTree(folders: readonly MailFolder[]): FolderNode[] {
  const childrenByParent = new Map<FolderId, MailFolder[]>();
  const ids = new Set<FolderId>(folders.map((f) => f.id));
  const roots: MailFolder[] = [];

  for (const folder of folders) {
    if (folder.parentId !== undefined && ids.has(folder.parentId)) {
      const siblings = childrenByParent.get(folder.parentId);
      if (siblings === undefined) {
        childrenByParent.set(folder.parentId, [folder]);
      } else {
        siblings.push(folder);
      }
    } else {
      roots.push(folder);
    }
  }

  const toNode = (folder: MailFolder): FolderNode => {
    const children = (childrenByParent.get(folder.id) ?? [])
      .slice()
      .sort(compareFolders)
      .map(toNode);
    return { folder, children };
  };

  return roots.slice().sort(compareFolders).map(toNode);
}

/** Erster Ordner eines bestimmten Typs (z. B. Inbox), oder `undefined`. */
export function findSpecialFolder(
  folders: readonly MailFolder[],
  type: FolderType,
): MailFolder | undefined {
  return folders.find((f) => f.type === type);
}
