import React, { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

/**
 * „Chrome"-Steuerung: ein gemeinsamer Animationswert, der beim Scrollen die schwebende TabBar
 * dynamisch ein-/ausklappt. `collapse` 0 = groß (ausgeklappt) … 1 = klein (eingeklappt). Listen
 * hängen `handleScroll` an ihr `onScroll`; ein Tab-Tap/Wechsel ruft `expand()`.
 */
export interface Chrome {
  readonly collapse: SharedValue<number>;
  readonly handleScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly expand: () => void;
}

const ChromeContext = createContext<Chrome | null>(null);
const DUR = 200;

export function ChromeProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const collapse = useSharedValue(0);
  const lastY = useRef(0);
  const value = useMemo<Chrome>(() => {
    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;
      lastY.current = y;
      // Nahe am oberen Rand immer groß; sonst Richtung entscheiden (kleine Totzone gegen Zittern).
      if (y <= 8) {
        collapse.value = withTiming(0, { duration: DUR });
        return;
      }
      if (dy > 6) collapse.value = withTiming(1, { duration: DUR });
      else if (dy < -6) collapse.value = withTiming(0, { duration: DUR });
    };
    const expand = (): void => {
      collapse.value = withTiming(0, { duration: DUR });
    };
    return { collapse, handleScroll, expand };
  }, [collapse]);
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): Chrome {
  const ctx = useContext(ChromeContext);
  if (ctx === null) throw new Error('useChrome muss innerhalb von ChromeProvider genutzt werden');
  return ctx;
}
