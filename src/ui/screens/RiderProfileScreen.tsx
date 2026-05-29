import { PressableScale } from "pressto";
import { useCallback } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Icon from "~/components/Icons";
import { useGetRiderProfile, useLinkGoogleAccount } from "~/hooks/useUserApis";
import { useAuthApi } from "~/providers/AuthProvider";
import { s } from "~/styles/Common-Styles";

import Avatar from "../Avatar";
import RnText from "../RnText";
import { RnView } from "../RnView";
import { useAppTheme } from "../theme";
import { atoms } from "../theme/atoms";

type Props = {
  navigation?: any;
};

export const RiderProfileScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { fonts, colors } = useAppTheme();

  const { logout } = useAuthApi();
  const { data: profile, isLoading } = useGetRiderProfile();
  console.log("RiderProfileScreen - profile:", profile);
  const { mutate: linkGoogle, isPending: isLinking } = useLinkGoogleAccount();

  const fullName = profile
    ? `${profile.first_name.trim()} ${profile.last_name.trim()}`
    : "—";

  const onLoadAvatar = useCallback(() => {}, []);

  const onEditProfile = useCallback(() => {
    navigation?.navigate("EditProfileScreen");
  }, [navigation]);

  const onManageAddress = useCallback(() => {
    navigation?.navigate("UserAddressScreen");
  }, [navigation]);

  const onLogout = useCallback(() => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: logout },
    ]);
  }, [logout]);

  if (isLoading) {
    return (
      <RnView
        style={[s.flex1, s.centerItem, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary_500} />
      </RnView>
    );
  }

  return (
    <RnView style={[s.flex1, { backgroundColor: colors.background }]}>
      {/* Header */}
      <RnView
        style={[
          styles.header,
          {
            backgroundColor: colors.bg_50,
            paddingTop: insets.top + 16,
          },
        ]}
      >
        <RnView style={[s.alignCenter]}>
          <RnView style={styles.avatarWrapper}>
            <Avatar
              onLoad={onLoadAvatar}
              avatar={profile?.avatar_url ?? ""}
              size={88}
            />
            <PressableScale
              onPress={onEditProfile}
              style={[styles.cameraBtn, { backgroundColor: colors.background }]}
            >
              <Icon
                name="Camera"
                size={14}
                strokeWidth={2}
                color={colors.text}
              />
            </PressableScale>
          </RnView>
          <RnView style={[s.mt10]}>
            <RnText
              style={[
                s.textCenter,
                atoms.text_xl,
                { fontFamily: fonts.heavy.fontFamily, color: "#fff" },
              ]}
            >
              {fullName}
            </RnText>
            <RnText
              style={[
                s.textCenter,
                atoms.text_xs,
                { color: "rgba(255,255,255,0.8)", marginTop: 2 },
              ]}
            >
              <Icon name="Star" strokeWidth={3} size={12} color="#FFD700" />{" "}
              {profile?.total_rating_score.toFixed(1) ?? "—"} {" . "}{" "}
              {profile?.review_count ?? 0} Reviews
            </RnText>
          </RnView>
        </RnView>
      </RnView>

      {/* Content */}
      <ScrollView
        contentContainerStyle={[
          s.px16,
          { paddingTop: 24, flexGrow: 1, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Personal Info Section */}
        <RnText
          style={[
            atoms.text_xs,
            s.mb5,
            { fontFamily: fonts.bold.fontFamily, color: colors.gray },
          ]}
        >
          PERSONAL INFO
        </RnText>
        <PressableScale onPress={onEditProfile}>
          <RnView
            style={[
              styles.card,
              { backgroundColor: colors.bg_50, borderColor: colors.bg_100 },
            ]}
          >
            <ProfileRow
              icon="User"
              label="Full Name"
              value={fullName}
              colors={colors}
              fonts={fonts}
            />
            <RnView
              style={[styles.divider, { backgroundColor: colors.bg_100 }]}
            />
            <ProfileRow
              icon="Cake"
              label="Age"
              value={profile?.age != null ? String(profile.age) : "—"}
              colors={colors}
              fonts={fonts}
            />
          </RnView>
        </PressableScale>

        {/* Contact Section */}
        <RnText
          style={[
            atoms.text_xs,
            s.mb5,
            {
              fontFamily: fonts.bold.fontFamily,
              color: colors.gray,
              marginTop: 20,
            },
          ]}
        >
          CONTACT
        </RnText>
        <RnView
          style={[
            styles.card,
            { backgroundColor: colors.bg_50, borderColor: colors.bg_100 },
          ]}
        >
          <ProfileRow
            icon="Phone"
            label="Phone"
            value={profile?.phone_number ?? "—"}
            colors={colors}
            fonts={fonts}
          />
          <RnView
            style={[styles.divider, { backgroundColor: colors.bg_100 }]}
          />
          <ProfileRow
            icon="Mail"
            label="Email"
            value={profile?.email ?? "—"}
            colors={colors}
            fonts={fonts}
            badge={profile?.email_verified === false ? "Verify" : undefined}
            badgeColor={colors.red_500}
          />
          <RnView
            style={[styles.divider, { backgroundColor: colors.bg_100 }]}
          />
          {/* Link Gmail */}
          <PressableScale
            onPress={() => {
              if (!profile?.google_linked && !isLinking) linkGoogle();
            }}
          >
            <RnView
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                },
              ]}
            >
              <RnView
                style={[
                  { flexDirection: "row", alignItems: "center", gap: 14 },
                ]}
              >
                <RnView
                  style={[
                    styles.gmailIcon,
                    { backgroundColor: `${colors.red_500}12` },
                  ]}
                >
                  <RnText
                    style={[
                      {
                        fontSize: 13,
                        fontFamily: fonts.heavy.fontFamily,
                        color: colors.red_500,
                      },
                    ]}
                  >
                    G
                  </RnText>
                </RnView>
                <RnView>
                  <RnText
                    style={[
                      {
                        fontSize: 11,
                        color: colors.gray,
                        fontFamily: fonts.regular.fontFamily,
                      },
                    ]}
                  >
                    Google Account
                  </RnText>
                  <RnText
                    style={[
                      {
                        fontSize: 14,
                        color: colors.text,
                        fontFamily: fonts.regular.fontFamily,
                      },
                    ]}
                  >
                    {profile?.google_linked
                      ? (profile.google_email ?? "Gmail Linked")
                      : "Link Gmail account"}
                  </RnText>
                </RnView>
              </RnView>
              <RnView
                style={[styles.linkBtn, { borderColor: colors.primary_500 }]}
              >
                {isLinking ? (
                  <ActivityIndicator size="small" color={colors.primary_500} />
                ) : (
                  <RnText
                    style={[
                      {
                        fontSize: 12,
                        color: colors.primary_500,
                        fontFamily: fonts.bold.fontFamily,
                      },
                    ]}
                  >
                    {profile?.google_linked ? "Linked" : "Link"}
                  </RnText>
                )}
              </RnView>
            </RnView>
          </PressableScale>
        </RnView>

        {/* Address Section */}
        <RnText
          style={[
            atoms.text_xs,
            s.mb5,
            {
              fontFamily: fonts.bold.fontFamily,
              color: colors.gray,
              marginTop: 20,
            },
          ]}
        >
          ADDRESS
        </RnText>
        <PressableScale onPress={onManageAddress}>
          <RnView
            style={[
              styles.card,
              { backgroundColor: colors.bg_50, borderColor: colors.bg_100 },
            ]}
          >
            <RnView style={[s.flexDirectionRow, s.spaceBetween, s.py10]}>
              <RnView style={[s.flexDirectionRow, s.gap16]}>
                <Icon
                  name="MapPin"
                  size={20}
                  strokeWidth={2}
                  color={colors.primary_500}
                />
                <RnView>
                  <RnText
                    style={[
                      atoms.text_2xs,
                      {
                        color: colors.gray,
                        fontFamily: fonts.regular.fontFamily,
                      },
                    ]}
                  >
                    Home Address
                  </RnText>
                  <RnText
                    style={[
                      atoms.text_sm,
                      {
                        color: colors.gray,
                        fontFamily: fonts.regular.fontFamily,
                      },
                    ]}
                  >
                    {profile?.address
                      ? `${profile.address.street ?? ""}, ${profile.address.city ?? ""}`.replace(
                          /^,\s*|,\s*$/g,
                          "",
                        )
                      : "Add your address"}
                  </RnText>
                </RnView>
              </RnView>
              <Icon
                name="ChevronRight"
                size={18}
                strokeWidth={2}
                color={colors.gray}
              />
            </RnView>
          </RnView>
        </PressableScale>

        {/* Actions */}
        <RnView
          style={[
            s.flexDirectionRow,
            s.justifyCenter,
            { gap: 32, marginTop: 32, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <PressableScale onPress={onLogout}>
            <RnView style={[styles.actionBtn, { borderColor: colors.red_500 }]}>
              <Icon
                name="LogOut"
                size={16}
                strokeWidth={2}
                color={colors.red_500}
              />
              <RnText
                style={[
                  atoms.text_sm,
                  {
                    color: colors.red_500,
                    fontFamily: fonts.bold.fontFamily,
                    marginLeft: 6,
                  },
                ]}
              >
                Logout
              </RnText>
            </RnView>
          </PressableScale>
          <PressableScale onPress={() => {}}>
            <RnView style={[styles.actionBtn, { borderColor: colors.red_500 }]}>
              <Icon
                name="Trash2"
                size={16}
                strokeWidth={2}
                color={colors.red_500}
              />
              <RnText
                style={[
                  atoms.text_sm,
                  {
                    color: colors.red_500,
                    fontFamily: fonts.bold.fontFamily,
                    marginLeft: 6,
                  },
                ]}
              >
                Delete Account
              </RnText>
            </RnView>
          </PressableScale>
        </RnView>
      </ScrollView>
    </RnView>
  );
};

// ─── Sub-component ────────────────────────────────────────────────────────────

type ProfileRowProps = {
  icon: string;
  label: string;
  value: string;
  colors: any;
  fonts: any;
  badge?: string;
  badgeColor?: string;
};

const ProfileRow: React.FC<ProfileRowProps> = ({
  icon,
  label,
  value,
  colors,
  fonts,
  badge,
  badgeColor,
}) => (
  <RnView
    style={[
      {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
      },
    ]}
  >
    <RnView style={[{ flexDirection: "row", alignItems: "center", gap: 14 }]}>
      <Icon
        name={icon as any}
        size={20}
        strokeWidth={2}
        color={colors.primary_500}
      />
      <RnView>
        <RnText
          style={[
            {
              fontSize: 11,
              color: colors.gray,
              fontFamily: fonts.regular.fontFamily,
            },
          ]}
        >
          {label}
        </RnText>
        <RnText
          style={[
            {
              fontSize: 14,
              color: colors.text,
              fontFamily: fonts.regular.fontFamily,
            },
          ]}
        >
          {value}
        </RnText>
      </RnView>
    </RnView>
    {badge && (
      <RnView style={[styles.badge, { backgroundColor: `${badgeColor}18` }]}>
        <RnText
          style={[
            {
              fontSize: 10,
              color: badgeColor,
              fontFamily: fonts.bold.fontFamily,
            },
          ]}
        >
          {badge}
        </RnText>
      </RnView>
    )}
  </RnView>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingBottom: 28,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  avatarWrapper: {
    position: "relative",
  },
  cameraBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowRadius: 4,
    shadowOpacity: 0.15,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 34,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  gmailIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  linkBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
});
