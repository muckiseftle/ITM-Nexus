import React, { useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { radius, space, typography } from '@nexus/ui-kit';
import { Icon } from './Icon';
import { useTheme, type AppTheme } from '../theme/ThemeContext';

interface Props {
  readonly html: string;
  /** Inline-Bilder: contentId (ohne „cid:" und ohne spitze Klammern) → Data-URI. */
  readonly cidImages?: Readonly<Record<string, string>>;
  /** Externe (http(s)) Bilder tatsächlich laden. Standard aus → Anti-Tracking. */
  readonly loadRemoteImages?: boolean;
  /** Wird ausgelöst, wenn der Nutzer externe Bilder freigibt (Banner-Tipp). */
  readonly onRequestRemoteImages?: () => void;
}

/** Entfernt aktive/gefährliche Inhalte (Skripte, Frames, Inline-Handler) aus der Mail. */
function sanitize(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<(object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

/** Ersetzt `src="cid:…"` durch die aufgelösten Data-URIs der Inline-Anhänge. */
function inlineCids(html: string, cidImages: Readonly<Record<string, string>>): string {
  if (Object.keys(cidImages).length === 0) return html;
  return html.replace(/src\s*=\s*(["']?)cid:([^"'>\s]+)\1/gi, (match, _q, rawId: string) => {
    const id = rawId.replace(/^<|>$/g, '');
    const uri = cidImages[id] ?? cidImages[rawId];
    return uri !== undefined ? `src="${uri}"` : match;
  });
}

/** Baut ein in sich geschlossenes, gehärtetes HTML-Dokument (CSP, Basis-CSS, Höhen-Skript). */
function buildDocument(body: string, t: AppTheme, allowRemote: boolean, nonce: string): string {
  const imgSrc = allowRemote ? 'data: https: http:' : 'data:';
  const csp =
    `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; ` +
    `font-src data:; media-src data:; script-src 'nonce-${nonce}';`;
  const css = `
    :root { color-scheme: light dark; }
    html, body { margin: 0; padding: 0; background: transparent; }
    body {
      color: ${t.c.textPrimary};
      font: 16px/1.5 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
      word-break: break-word; overflow-wrap: anywhere; padding: 2px;
    }
    a { color: ${t.c.brandPrimary}; }
    img { max-width: 100% !important; height: auto; border-radius: 6px; }
    table { max-width: 100% !important; border-collapse: collapse; }
    td, th { word-break: break-word; }
    blockquote { margin: 0 0 0 8px; padding-left: 12px; border-left: 3px solid ${t.border}; color: ${t.c.textSecondary}; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
  `;
  const heightScript =
    `<script nonce="${nonce}">(function(){` +
    `function p(){var h=document.body.scrollHeight;` +
    `if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(String(h));}` +
    `window.addEventListener('load',p);window.addEventListener('resize',p);` +
    `document.addEventListener('DOMContentLoaded',p);` +
    `setTimeout(p,250);setTimeout(p,800);setTimeout(p,2000);` +
    `})();</script>`;
  return (
    `<!DOCTYPE html><html><head>` +
    `<meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5"/>` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}"/>` +
    `<style>${css}</style></head><body>${body}${heightScript}</body></html>`
  );
}

/**
 * Maximal kompatible HTML-Mail-Anzeige in einer **gehärteten WebView**: echtes HTML/CSS/Tabellen,
 * aber ohne JS-Ausführung aus der Mail (Skripte/Frames/Inline-Handler entfernt + strikte CSP).
 * Externe Bilder werden bis zur Freigabe blockiert (Tracking-Schutz); Inline-`cid:`-Bilder werden
 * aus den Anhängen aufgelöst. Höhe wird per Nonce-Skript gemessen → kein inneres Scrollen.
 */
export function HtmlWebView({
  html,
  cidImages,
  loadRemoteImages,
  onRequestRemoteImages,
}: Props): React.JSX.Element {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [height, setHeight] = useState(80);
  const firstLoad = useRef(true);

  const hasRemoteImages = useMemo(() => /<img[^>]+src\s*=\s*["']?https?:\/\//i.test(html), [html]);
  const allowRemote = loadRemoteImages === true;

  const doc = useMemo(() => {
    const nonce = `n${String(Math.abs(hashCode(html)))}`;
    const resolved = inlineCids(sanitize(html), cidImages ?? {});
    return buildDocument(resolved, t, allowRemote, nonce);
  }, [html, cidImages, t, allowRemote]);

  const onMessage = (e: WebViewMessageEvent): void => {
    const h = Number(e.nativeEvent.data);
    if (Number.isFinite(h) && h > 0) setHeight(Math.ceil(h) + 8);
  };

  return (
    <View>
      {hasRemoteImages && !allowRemote ? (
        <Pressable style={s.banner} onPress={onRequestRemoteImages}>
          <Icon name="shield" size={15} color={t.c.brandPrimary} />
          <Text style={s.bannerText}>Externe Bilder blockiert · Tippen zum Laden</Text>
        </Pressable>
      ) : null}
      <WebView
        originWhitelist={['about:*', 'data:*']}
        source={{ html: doc }}
        style={[s.web, { height }]}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled={false}
        // Wechsel von blockiert→geladen erzwingt durch den neuen `doc`-Key ein sauberes Remount.
        key={allowRemote ? 'remote' : 'blocked'}
        onMessage={onMessage}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(req) => {
          if (firstLoad.current) {
            firstLoad.current = false;
            return true;
          }
          if (req.url.startsWith('data:') || req.url.startsWith('about:')) return true;
          void Linking.openURL(req.url).catch(() => undefined);
          return false;
        }}
      />
    </View>
  );
}

/** Stabiler Hash (für den CSP-Nonce je Dokument) — kein Math.random nötig. */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
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
    web: { backgroundColor: 'transparent', width: '100%' },
  });
}
