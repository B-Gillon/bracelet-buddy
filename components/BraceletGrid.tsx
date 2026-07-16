// components/BraceletGrid.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Rect, Polygon } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

const DIAMOND = 40;

interface Props {
  width?:  number;
  height?: number;
}

export default function BraceletGrid({ width = 440, height = 280 }: Props) {
  const { theme } = useTheme();
  const FILL   = theme.gridEmptyFill;
  const STROKE = theme.gridStroke;
  const BORDER = theme.borderStrong;

  const D = DIAMOND;
  const H = D / 2;

  const diamonds = [
    `${H},0 ${D},${H} ${H},${D} 0,${H}`,
    `${D},0 ${D+H},${H} ${D},${D} ${H},${H}`,
    `0,0 ${H},${H} 0,${D} ${-H},${H}`,
    `${H},${-H} ${D},0 ${H},${H} 0,0`,
    `${H},${H} ${D},${D} ${H},${D+H} 0,${D}`,
  ];

  return (
    <View style={styles.wrapper}>
      <Svg width={width} height={height}>
        <Defs>
          <Pattern
            id="dp"
            x={0} y={0}
            width={D} height={D}
            patternUnits="userSpaceOnUse"
          >
            <Rect width={D} height={D} fill={FILL} />
            {diamonds.map((pts, i) => (
              <Polygon
                key={i}
                points={pts}
                fill={FILL}
                stroke={STROKE}
                strokeWidth={0.75}
              />
            ))}
          </Pattern>
        </Defs>

        <Rect
          x={0} y={0}
          width={width} height={height}
          rx={6}
          fill="url(#dp)"
          stroke={BORDER}
          strokeWidth={1.25}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
});
