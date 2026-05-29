import React, { useState } from "react";
import { Canvas, Circle, Rect, Line } from "@shopify/react-native-skia";
import { useContextBridge } from "its-fine";
import { View, StyleSheet } from "react-native";
import { atoms } from "~/ui/theme/atoms";
import { useAppTheme } from "~/ui/theme";
import { themes } from "~/ui/theme/utils";
import RnText from "~/ui/RnText";
import { RnView } from "~/ui/RnView";
import Icon from "./Icons";
import { s } from "~/styles/Common-Styles";
import { Pressable } from "react-native-gesture-handler";

export type FromToLocationType = {
  city?: string | null;
  street?: string | null;
  ward?: string | null;
  country?: string;
};
type Props = {
  height?: number;
  from: FromToLocationType;
  to: FromToLocationType;
  duration?: string;
  distance?: string;
};
const PickupToDestination: React.FC<Props> = ({
  height,
  from,
  to,
  distance,
  duration,
}) => {
  const pickupY = 20;
  // State to control destination Y position (making height dynamic)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [destinationY, _] = useState(height ?? 65);

  // Calculate the dynamic height of the canvas
  const padding = 20;
  const canvasHeight = Math.abs(destinationY - pickupY) + padding * 2;
  const ContextBridge = useContextBridge();

  const { colors, fonts } = useAppTheme();
  return (
    <View style={styles.container}>
      {/* Row to place Skia Canvas and Text side by side */}
      <View style={styles.row}>
        {/* Skia Canvas for the dot, square, and line */}
        <Canvas style={[styles.canvas, { height: canvasHeight }]}>
          <ContextBridge>
            <CanvasDrawings height={height} />
          </ContextBridge>
        </Canvas>

        {/* Text container for travel details and addresses */}
        <View style={[{ height: canvasHeight }]}>
          {/* Pick-up details */}
          <View style={[atoms.gap_xs]}>
            {/* <RnText style={[atoms.text_sm, { color: themes.bg_300 }]}>
              2 mins (0.4 mi) away
            </RnText> */}
            <RnView>
              <RnText style={[atoms.text_xs, { color: colors.gray }]}>
                {from.ward}
              </RnText>
              <RnText style={[atoms.text_2xs]}>{from.city}</RnText>
            </RnView>
          </View>

          <View
            style={[atoms.flex_1, atoms.gap_xs, { justifyContent: "flex-end" }]}
          >
            <Pressable
              onPress={() => console.log("Edit drop off")}
              style={[
                {
                  width: "92%",
                  paddingVertical: 4,
                  // alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "space-between",
                },
              ]}
            >
              <RnView style={[s.flexDirectionRow, atoms.gap_sm]}>
                <RnView>
                  <RnText style={[atoms.text_xs, { color: colors.gray }]}>
                    {to.ward}
                  </RnText>
                  <RnText style={[atoms.text_2xs]}>{to.city}</RnText>
                </RnView>
                <Icon
                  style={{ top: -5 }}
                  name="LocationEdit"
                  size={18}
                  strokeWidth={2}
                  color={colors.text}
                />
              </RnView>
              <RnView style={{ top: 2 }}>
                <RnText style={[atoms.text_2xs]}>
                  {duration} ({distance})
                </RnText>
              </RnView>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

const CanvasDrawings = ({ height }: { height?: number }) => {
  const { colors } = useAppTheme();
  // Fixed pick-up position
  const pickupX = 25;
  const pickupY = 20;

  // State to control destination Y position (making height dynamic)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [destinationY, _] = useState(height ?? 65);
  const destinationX = 25;

  // Calculate the dynamic height of the canvas

  // Sizes for the dot and square
  const dotRadius = 6;
  const squareSize = 10;
  return (
    <>
      <Circle
        cx={pickupX}
        cy={pickupY}
        r={dotRadius}
        color={themes.bg_300}
        style="fill"
      />
      <Circle
        cx={pickupX}
        cy={pickupY}
        r={dotRadius}
        color="black"
        style="stroke"
        strokeWidth={1}
      />
      <Rect
        x={destinationX - squareSize / 2}
        y={destinationY - squareSize / 2}
        width={squareSize}
        height={squareSize}
        color={colors.text}
        style="fill"
      />
      <Rect
        x={destinationX - squareSize / 2}
        y={destinationY - squareSize / 2}
        width={squareSize}
        height={squareSize}
        color={themes.bg_600}
        style="stroke"
        strokeWidth={4}
      />
      <Line
        p1={{ x: pickupX, y: pickupY }}
        p2={{ x: destinationX, y: destinationY }}
        color={themes.bg_300}
        style="stroke"
        strokeWidth={1}
      />
    </>
  );
};
const styles = StyleSheet.create({
  container: { left: -10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  canvas: {
    width: 40,
  },
  textContainer: {
    marginLeft: 10, // Space between canvas and text
    justifyContent: "space-between",
  },
  buttonContainer: {
    marginTop: 20,
    gap: 10,
  },
});

export default PickupToDestination;
