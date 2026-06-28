import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { color } from '@nexus/ui-kit';

interface Props {
  readonly size?: number;
}

/**
 * NEXUS-Markenzeichen als Vektor (react-native-svg): abgerundete Marken-Kachel mit einem weißen
 * „Spark". Wird auf dem Start-/Login-Screen gezeigt und dient zugleich als Smoke-Test, dass
 * react-native-svg korrekt eingebunden/autolinked ist.
 */
export function BrandMark({ size = 72 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" accessibilityLabel="NEXUS">
      <Rect x={0} y={0} width={96} height={96} rx={24} fill={color.brandPrimary} />
      <Path
        d="M48 18 C51 39 57 45 78 48 C57 51 51 57 48 78 C45 57 39 51 18 48 C39 45 45 39 48 18 Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}
