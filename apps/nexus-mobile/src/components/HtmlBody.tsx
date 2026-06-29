import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { parseHtmlBlocks, type HtmlBlock, type HtmlSpan } from '@nexus/domain';
import { radius, space, typography } from '@nexus/ui-kit';
import { Icon } from './Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly html: string;
  /** Externe (http(s)) Bilder tatsächlich laden. Standard aus → Anti-Tracking. */
  readonly loadRemoteImages?: boolean;
  /** Wird ausgelöst, wenn der Nutzer externe Bilder freigibt (Banner-Tipp). */
  readonly onRequestRemoteImages?: () => void;
}

/**
 * Sichere HTML-Mail-Anzeige ohne WebView: rendert die von {@link parseHtmlBlocks} erzeugten
 * Blöcke mit nativen RN-Komponenten. Es wird kein HTML/JS ausgeführt; externe Bilder werden
 * standardmäßig BLOCKIERT (Tracking-Schutz) und erst nach ausdrücklicher Freigabe geladen.
 */
export function HtmlBody({
  html,
  loadRemoteImages,
  onRequestRemoteImages,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const blocks = useMemo(() => parseHtmlBlocks(html), [html]);
  const hasRemoteImages = useMemo(
    () => blocks.some((b) => b.kind === 'image' && b.remote),
    [blocks],
  );

  const renderSpans = (spans: readonly HtmlSpan[]): React.ReactNode =>
    spans.map((sp, i) => {
      const style = [
        sp.bold === true ? s.bold : null,
        sp.italic === true ? s.italic : null,
        sp.underline === true ? s.underline : null,
        sp.href !== undefined ? s.link : null,
      ];
      if (sp.href !== undefined) {
        const href = sp.href;
        return (
          <Text
            key={i}
            style={style}
            onPress={() => void Linking.openURL(href).catch(() => undefined)}
          >
            {sp.text}
          </Text>
        );
      }
      return (
        <Text key={i} style={style}>
          {sp.text}
        </Text>
      );
    });

  return (
    <View>
      {hasRemoteImages && loadRemoteImages !== true ? (
        <Pressable style={s.banner} onPress={onRequestRemoteImages}>
          <Icon name="shield" size={15} color={t.c.brandPrimary} />
          <Text style={s.bannerText}>Externe Bilder blockiert · Tippen zum Laden</Text>
        </Pressable>
      ) : null}

      {blocks.map((block, i) => (
        <BlockView
          key={i}
          block={block}
          styles={s}
          loadRemoteImages={loadRemoteImages === true}
          renderSpans={renderSpans}
        />
      ))}
    </View>
  );
}

function BlockView({
  block,
  styles,
  loadRemoteImages,
  renderSpans,
}: {
  readonly block: HtmlBlock;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly loadRemoteImages: boolean;
  readonly renderSpans: (spans: readonly HtmlSpan[]) => React.ReactNode;
}): React.JSX.Element | null {
  switch (block.kind) {
    case 'paragraph':
      return <Text style={styles.paragraph}>{renderSpans(block.spans)}</Text>;
    case 'heading':
      return (
        <Text style={[styles.paragraph, block.level <= 2 ? styles.h1 : styles.h3]}>
          {renderSpans(block.spans)}
        </Text>
      );
    case 'listItem':
      return (
        <View style={[styles.listRow, { marginLeft: space.md * (block.depth + 1) }]}>
          <Text style={styles.listMarker}>{block.marker}</Text>
          <Text style={styles.listText}>{renderSpans(block.spans)}</Text>
        </View>
      );
    case 'quote':
      return <Text style={styles.quote}>{renderSpans(block.spans)}</Text>;
    case 'rule':
      return <View style={styles.rule} />;
    case 'image':
      if (block.remote && !loadRemoteImages) {
        return (
          <ImagePlaceholder
            styles={styles}
            label={`${block.alt.length > 0 ? block.alt : 'Bild'} (extern, blockiert)`}
          />
        );
      }
      if (block.remote || block.src.startsWith('data:')) {
        return <RemoteImage src={block.src} styles={styles} />;
      }
      // cid:/unbekannt → eingebettet, hier (noch) nicht aufgelöst.
      return (
        <ImagePlaceholder
          styles={styles}
          label={block.alt.length > 0 ? block.alt : 'Eingebettetes Bild'}
        />
      );
    default:
      return null;
  }
}

function ImagePlaceholder({
  styles,
  label,
}: {
  readonly styles: ReturnType<typeof makeStyles>;
  readonly label: string;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={styles.imagePlaceholder}>
      <Icon name="image" size={15} color={t.c.textSecondary} />
      <Text style={styles.imagePlaceholderText}>{label}</Text>
    </View>
  );
}

function RemoteImage({
  src,
  styles,
}: {
  readonly src: string;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    Image.getSize(
      src,
      (w, h) => {
        if (active && h > 0) setRatio(w / h);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [src]);
  return (
    <Image
      source={{ uri: src }}
      style={[styles.image, { aspectRatio: ratio ?? 1.6 }]}
      resizeMode="contain"
    />
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    banner: {
      alignItems: 'center',
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.sm,
      flexDirection: 'row',
      gap: space.xs,
      marginBottom: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    bannerText: { color: t.c.brandPrimary, fontSize: typography.caption.size, fontWeight: '600' },
    bold: { fontWeight: '700' },
    h1: { fontSize: typography.headline.size, fontWeight: '700' },
    h3: { fontSize: typography.body.size, fontWeight: '700' },
    image: {
      backgroundColor: t.c.bgElevated,
      borderRadius: radius.sm,
      marginVertical: space.xs,
      maxHeight: 360,
      width: '100%',
    },
    imagePlaceholder: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: space.xs,
      marginVertical: space.xs,
    },
    imagePlaceholderText: {
      color: t.c.textSecondary,
      flex: 1,
      fontSize: typography.caption.size,
      fontStyle: 'italic',
    },
    italic: { fontStyle: 'italic' },
    link: { color: t.c.brandPrimary, textDecorationLine: 'underline' },
    listMarker: { color: t.c.textSecondary, marginRight: space.sm, minWidth: 18 },
    listRow: { flexDirection: 'row', marginBottom: space.xs },
    listText: { color: t.c.textPrimary, flex: 1, fontSize: typography.body.size, lineHeight: 22 },
    paragraph: {
      color: t.c.textPrimary,
      fontSize: typography.body.size,
      lineHeight: 22,
      marginBottom: space.sm,
    },
    quote: {
      borderLeftColor: t.border,
      borderLeftWidth: 3,
      color: t.c.textSecondary,
      fontSize: typography.body.size,
      fontStyle: 'italic',
      lineHeight: 22,
      marginBottom: space.sm,
      paddingLeft: space.md,
    },
    rule: {
      backgroundColor: t.border,
      height: StyleSheet.hairlineWidth,
      marginVertical: space.sm,
    },
    underline: { textDecorationLine: 'underline' },
  });
}
