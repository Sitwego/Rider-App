import { forwardRef, useImperativeHandle, useRef, type Ref } from "react";
import { FlatList, StyleSheet } from "react-native";
import {
  TrueSheet,
  type TrueSheetProps,
} from "@lodev09/react-native-true-sheet";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RnView } from "../RnView";
import RnText from "../RnText";
import { useAppTheme } from "../theme";
import { height } from "~/utils/dimensions";

const $content = StyleSheet.create({
  bottomSheetContainer: {
    overflow: "hidden",
    flexGrow: 1,
    flexBasis: "100%",
  },
});

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Props extends TrueSheetProps {}
export const ConversationsSheet = forwardRef(
  (props: Props, ref: Ref<TrueSheet>) => {
    const { colors, fonts } = useAppTheme();
    const flatListRef = useRef<FlatList>(null);
    const sheetRef = useRef<TrueSheet>(null);
    const inset = useSafeAreaInsets();

    useImperativeHandle<TrueSheet | null, TrueSheet | null>(
      ref,
      () => sheetRef.current,
    );

    const _height = height - inset.top - inset.bottom;
    return (
      <TrueSheet
        ref={sheetRef}
        // @ts-ignore
        scrollRef={flatListRef}
        style={{ top: inset.top }}
        contentContainerStyle={[$content.bottomSheetContainer]}
        dimmed
        grabber={false}
        sizes={["100%"]}
        blurTint="dark"
        backgroundColor={colors.background}
        keyboardMode="pan"
        edgeToEdge
        onDismiss={() => console.log("Sheet FlatList dismissed!")}
        onPresent={() => console.log(`Sheet FlatList presented!`)}
        {...props}
      >
        <RnView
          style={{
            flexBasis: "100%",
            flexGrow: 1,
            width: "100%",
            height: _height,
            // bottom: inset.bottom + inset.top,
            backgroundColor: colors.bg_100,
          }}
        ></RnView>
      </TrueSheet>
    );
  },
);

ConversationsSheet.displayName = "ConversationsSheet";
