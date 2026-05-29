import { useNavigation, useRoute } from "@react-navigation/native";
import { PressableScale } from "pressto";
import React, { useCallback } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StarRating from "react-native-star-rating-widget";

import { useRideFareHistory, useSubmitDriverReview } from "~/hooks/api";
import { s } from "~/styles/Common-Styles";
import RnText from "~/ui/RnText";
import RnTextInput from "~/ui/RnTextInput";
import { RnView } from "~/ui/RnView";
import { useAppTheme } from "~/ui/theme";
import { atoms } from "~/ui/theme/atoms";

import type {
  RatingScreenNavigationProp,
  RatingScreenRouteProp,
} from "~/navigation/types";

const MAX_STARS = 5;

function RatingRow({
  label,
  rating,
  onChange,
}: {
  label: string;
  rating: number;
  onChange: (rating: number) => void;
}) {
  const handleChange = useCallback(
    (r: number) => onChange(Math.min(Math.max(0, r), MAX_STARS)),
    [onChange],
  );

  return (
    <RnView style={[s.gap12, s.alignCenter, s.flexCol]}>
      <RnText style={[atoms.text_xs]}>{label}</RnText>
      <StarRating
        step="full"
        onChange={handleChange}
        enableSwiping
        rating={rating}
        maxStars={MAX_STARS}
      />
    </RnView>
  );
}

export default function RatingComponent() {
  const { colors, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RatingScreenNavigationProp>();
  const { params } = useRoute<RatingScreenRouteProp>();
  const { mutateAsync: submitReview, isPending } = useSubmitDriverReview();
  const { data: fareHistory } = useRideFareHistory(params.rideId);
  const fare = fareHistory?.[0];
  const extraCharges = fare
    ? (
        [
          ["Extra distance", fare.components.extra_dx],
          ["Toll", fare.components.toll],
          ["Waiting charge", fare.components.waiting_charge],
        ] as const
      ).filter(([, v]) => v > 0)
    : [];

  const [punctuality, setPunctuality] = React.useState(0);
  const [drivingBehavior, setDrivingBehavior] = React.useState(0);
  const [safetyCompliance, setSafetyCompliance] = React.useState(0);
  const [vehicleCleanliness, setVehicleCleanliness] = React.useState(0);
  const [comment, setComment] = React.useState("");

  const onPunctualityChange = useCallback(
    (rating: number) => setPunctuality(rating),
    [],
  );
  const onDrivingBehaviorChange = useCallback(
    (rating: number) => setDrivingBehavior(rating),
    [],
  );
  const onSafetyComplianceChange = useCallback(
    (rating: number) => setSafetyCompliance(rating),
    [],
  );
  const onVehicleCleanlinessChange = useCallback((rating: number) => {
    setVehicleCleanliness(rating);
  }, []);

  const handleSubmit = useCallback(async () => {
    const data = {
      driver_id: params.driverId,
      ride_id: params.rideId,
      punctuality,
      driving_behavior: drivingBehavior,
      safety_compliance: safetyCompliance,
      vehicle_cleanliness: vehicleCleanliness,
      feedback_details: comment,
    };
    await submitReview(data);
    navigation.goBack();
  }, [
    params.driverId,
    params.rideId,
    punctuality,
    drivingBehavior,
    safetyCompliance,
    vehicleCleanliness,
    comment,
    submitReview,
    navigation,
  ]);

  return (
    <KeyboardAwareScrollView
      bottomOffset={40}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        s.px16,
        s.gap16,
        { paddingTop: insets.top + 20, paddingBottom: 40 },
      ]}
    >
      {fare ? (
        <RnView
          style={[
            s.gap8,
            s.p16,
            s.borderRadius_sm,
            { borderWidth: 1, borderColor: colors.bg_50 },
          ]}
        >
          <RnView style={[s.flexRow, s.spaceBetween]}>
            <RnText style={[atoms.text_sm, { color: colors.gray_600 }]}>
              Estimated fare
            </RnText>
            <RnText style={[atoms.text_sm]}>
              {fare.components.estimated_fare}
            </RnText>
          </RnView>
          {extraCharges.map(([label, value]) => (
            <RnView key={label} style={[s.flexRow, s.spaceBetween]}>
              <RnText style={[atoms.text_sm, { color: colors.gray_600 }]}>
                {label}
              </RnText>
              <RnText style={[atoms.text_sm]}>{value}</RnText>
            </RnView>
          ))}
          <RnView
            style={[
              s.flexRow,
              s.spaceBetween,
              {
                paddingTop: 8,
                borderTopWidth: 1,
                borderTopColor: colors.bg_50,
              },
            ]}
          >
            <RnText style={[atoms.text_md]}>Total</RnText>
            <RnText style={[atoms.text_md]}>{fare.total}</RnText>
          </RnView>
        </RnView>
      ) : null}
      <RatingRow
        label="Punctuality"
        rating={punctuality}
        onChange={onPunctualityChange}
      />
      <RatingRow
        label="Driving Behavior"
        rating={drivingBehavior}
        onChange={onDrivingBehaviorChange}
      />
      <RatingRow
        label="Safety Compliance"
        rating={safetyCompliance}
        onChange={onSafetyComplianceChange}
      />
      <RatingRow
        label="Vehicle Cleanliness"
        rating={vehicleCleanliness}
        onChange={onVehicleCleanlinessChange}
      />
      <RnView>
        <RnText style={[atoms.text_2xs, { color: colors.gray_600 }]}>
          Feal free to share any additional feedback or comments about your ride
          experience.
        </RnText>
        <RnTextInput
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          placeholder="Write your comments here..."
          placeholderTextColor={colors.gray_600}
          style={[
            s.input,
            s.p12,
            s.mt10,
            {
              color: colors.text,
              borderColor: colors.bg_50,
              fontFamily: fonts.regular.fontFamily,
            },
          ]}
        />
      </RnView>
      <RnView style={[s.flexRow, s.gap12]}>
        <PressableScale
          onPress={() => navigation.goBack()}
          style={[
            s.flex1,
            s.p16,
            s.alignCenter,
            s.borderRadius_sm,
            { borderWidth: 1, borderColor: colors.primary },
          ]}
        >
          <RnText style={[atoms.text_sm, { color: colors.primary }]}>
            Skip
          </RnText>
        </PressableScale>
        <PressableScale
          onPress={handleSubmit}
          enabled={!isPending}
          style={[
            s.flex1,
            s.p16,
            s.alignCenter,
            s.borderRadius_sm,
            {
              backgroundColor: isPending ? colors.primary_200 : colors.primary,
            },
          ]}
        >
          <RnText style={[atoms.text_sm, { color: "#fff" }]}>
            {isPending ? "Submitting..." : "Submit Review"}
          </RnText>
        </PressableScale>
      </RnView>
      <RnView style={{ marginVertical: 100 }} />
    </KeyboardAwareScrollView>
  );
}
