import {
  Canvas,
  RoundedRect,
  Text as SkiaText,
  useFont,
  useImage,
  Image as SkiaImage,
  Line,
  vec,
  LinearGradient,
  Path,
  Skia,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";

const KENYA_FLAG_URL = require("../../../assets/images/flags/Flag_of_Kenya.png");
const ASPECT = 4.64;
const GRADIENT_START = vec(0, 0);
const GRADIENT_COLORS = ["#FAFAFA", "#E8E8E4"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NumberPlateProps {
  /** Full plate text, e.g. "KCW 041W" */
  plateNumber: string;
  /** Overall width – height is derived (≈4.64:1 aspect ratio) */
  width?: number;
  /**
   * Path to a bold, condensed font file bundled with your app.
   * The Kenyan plate uses a DIN-style / Charles Wright–style typeface.
   * You can use "FE-Schrift" or "CharlesWright" .ttf/.otf.
   * Falls back to the default system font when omitted (less accurate).
   */
  fontPath?: string;
  /** Optional: path to a smaller font for the "KE" country code */
  smallFontPath?: string;
  /**
   * Bundled Kenyan flag image asset.
   * Pass a `require(...)` reference.
   * Defaults to the bundled flag when omitted.
   */
  flagImage?: ReturnType<typeof require>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const NumberPlateInner: React.FC<NumberPlateProps> = ({
  plateNumber,
  width = 360,
  fontPath,
  smallFontPath,
  flagImage = KENYA_FLAG_URL,
}) => {
  const height = Math.round(width / ASPECT);
  const mainFontSize = height * 0.58;
  const keFontSize = height * 0.22;

  const loadedMainFont = useFont(fontPath ?? null, mainFontSize);
  const loadedSmallFont = useFont(
    smallFontPath ?? fontPath ?? null,
    keFontSize,
  );
  const flag = useImage(flagImage);

  // Fall back to the system font so text always renders even without a custom fontPath
  const systemTypeface = useMemo(
    () => Skia.FontMgr.System().matchFamilyStyle("sans-serif", {}),
    [],
  );
  const mainFont = useMemo(
    () =>
      loadedMainFont ??
      (systemTypeface ? Skia.Font(systemTypeface, mainFontSize) : null),
    [loadedMainFont, systemTypeface, mainFontSize],
  );
  const smallFont = useMemo(
    () =>
      loadedSmallFont ??
      (systemTypeface ? Skia.Font(systemTypeface, keFontSize) : null),
    [loadedSmallFont, systemTypeface, keFontSize],
  );

  const layout = useMemo(() => {
    const borderRadius = height * 0.12;
    const borderWidth = height * 0.04;
    const padding = height * 0.1;

    const badgePadding = 2;
    const badgeX = borderWidth + badgePadding;
    const badgeY = borderWidth + badgePadding;
    const badgeW = width * 0.115;
    const badgeH = height - borderWidth * 2 - badgePadding * 2;

    const flagPad = badgeW * 0.12;
    const flagW = badgeW - flagPad * 2;
    const flagH = flagW * 0.7; // Kenya flag aspect ≈ 3:2
    const flagX = badgeX + flagPad;
    const flagY = badgeY + badgeH * 0.12;

    const keLabelY = flagY + flagH + keFontSize * 1.15;
    const keLabelCenterX = badgeX + badgeW / 2;

    const separatorX = badgeX + badgeW + padding * 0.3;

    return {
      borderRadius,
      borderWidth,
      badgeX,
      badgeY,
      badgeW,
      badgeH,
      flagW,
      flagH,
      flagX,
      flagY,
      keLabelY,
      keLabelCenterX,
      separatorX,
      textY: height / 2 + mainFontSize * 0.35,
      gradientEnd: vec(0, height),
      separatorP1: vec(separatorX, borderWidth + padding),
      separatorP2: vec(separatorX, height - borderWidth - padding),
    };
  }, [width, height, keFontSize, mainFontSize]);

  // Center the plate number in the text area (right of separator)
  const textX = useMemo(() => {
    const { separatorX, borderWidth } = layout;
    const areaStart = separatorX;
    const areaWidth = width - borderWidth - separatorX;
    if (!mainFont) return areaStart + areaWidth / 2;
    const textWidth = mainFont.measureText(plateNumber).width;
    return areaStart + (areaWidth - textWidth) / 2 - width * 0.02;
  }, [mainFont, plateNumber, layout, width]);

  // Badge shape: rounded left corners, straight right edge
  const badgePath = useMemo(() => {
    const { badgeX, badgeY, badgeW, badgeH, borderRadius } = layout;
    const r = borderRadius * 0.7;
    const path = Skia.Path.Make();
    path.moveTo(badgeX + r, badgeY);
    path.lineTo(badgeX + badgeW, badgeY);
    path.lineTo(badgeX + badgeW, badgeY + badgeH);
    path.lineTo(badgeX + r, badgeY + badgeH);
    path.quadTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - r);
    path.lineTo(badgeX, badgeY + r);
    path.quadTo(badgeX, badgeY, badgeX + r, badgeY);
    path.close();
    return path;
  }, [layout]);

  const {
    borderRadius,
    borderWidth,
    flagW,
    flagH,
    flagX,
    flagY,
    keLabelY,
    keLabelCenterX,
    textY,
    gradientEnd,
    separatorP1,
    separatorP2,
  } = layout;

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={{ width, height }}>
        {/* === Outer dark border / frame === */}
        <RoundedRect
          x={0}
          y={0}
          width={width}
          height={height}
          r={borderRadius}
          color="#2A2A2A"
        />

        {/* === White plate background === */}
        <RoundedRect
          x={borderWidth}
          y={borderWidth}
          width={width - borderWidth * 2}
          height={height - borderWidth * 2}
          r={borderRadius * 0.85}
          color="#F2F2F0"
        >
          <LinearGradient
            start={GRADIENT_START}
            end={gradientEnd}
            colors={GRADIENT_COLORS}
          />
        </RoundedRect>

        {/* === Blue badge area (left) — rounded left corners only === */}
        <Path path={badgePath} color="#003893" />

        {/* === Kenyan flag (bundled PNG image) === */}
        {flag && (
          <SkiaImage
            image={flag}
            x={flagX}
            y={flagY}
            width={flagW}
            height={flagH}
            fit="contain"
          />
        )}

        {/* === "KE" country code === */}
        {smallFont && (
          <SkiaText
            x={keLabelCenterX - smallFont.measureText("KE").width / 2}
            y={keLabelY}
            text="KE"
            font={smallFont}
            color="#FFFFFF"
          />
        )}

        {/* === Thin separator line === */}
        <Line
          p1={separatorP1}
          p2={separatorP2}
          color="#C0C0C0"
          strokeWidth={1}
        />

        {/* === Main plate number === */}
        {mainFont && (
          <SkiaText
            x={textX}
            y={textY}
            text={plateNumber}
            font={mainFont}
            color="#0A0A0A"
          />
        )}
      </Canvas>
    </View>
  );
};

const NumberPlate = React.memo(NumberPlateInner);
NumberPlate.displayName = "NumberPlate";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});

export default NumberPlate;
