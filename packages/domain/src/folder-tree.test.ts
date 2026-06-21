import { describe, expect, it } from 'vitest';
import { FolderType } from './enums';
import { buildFolderTree, findSpecialFolder } from './folder-tree';
import { toAccountId, toFolderId } from './ids';
import type { MailFolder } from './models';

function folder(
  id: string,
  displayName: string,
  type: FolderType = FolderType.Custom,
  parentId?: string,
): MailFolder {
  return {
    id: toFolderId(id),
    accountId: toAccountId('acc-1'),
    displayName,
    type,
    ...(parentId !== undefined ? { parentId: toFolderId(parentId) } : {}),
    unreadCount: 0,
    totalCount: 0,
  };
}

describe('buildFolderTree', () => {
  it('verschachtelt Unterordner unter ihrem Elternordner', () => {
    const tree = buildFolderTree([
      folder('inbox', 'Posteingang', FolderType.Inbox),
      folder('proj', 'Projekte', FolderType.Custom, 'inbox'),
      folder('proj-a', 'Projekt A', FolderType.Custom, 'proj'),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.folder.id).toBe('inbox');
    expect(tree[0]?.children[0]?.folder.id).toBe('proj');
    expect(tree[0]?.children[0]?.children[0]?.folder.id).toBe('proj-a');
  });

  it('ordnet Spezialordner vor Custom und Custom alphabetisch', () => {
    const tree = buildFolderTree([
      folder('zeta', 'Zeta'),
      folder('alpha', 'Alpha'),
      folder('sent', 'Gesendet', FolderType.Sent),
      folder('inbox', 'Posteingang', FolderType.Inbox),
    ]);
    expect(tree.map((n) => n.folder.id)).toEqual(['inbox', 'sent', 'alpha', 'zeta']);
  });

  it('behandelt Ordner mit unbekanntem parentId als Wurzel', () => {
    const tree = buildFolderTree([folder('orphan', 'Waise', FolderType.Custom, 'does-not-exist')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.folder.id).toBe('orphan');
  });
});

describe('findSpecialFolder', () => {
  it('findet den Ordner eines Typs', () => {
    const folders = [folder('inbox', 'Posteingang', FolderType.Inbox), folder('c', 'Custom')];
    expect(findSpecialFolder(folders, FolderType.Inbox)?.id).toBe('inbox');
    expect(findSpecialFolder(folders, FolderType.Archive)).toBeUndefined();
  });
});
