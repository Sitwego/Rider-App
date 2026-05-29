import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { themes } from "./utils";

export const fontFamily = {
  bold: "Lato-Bold",
  light: "Lato-Light",
  normal: "babble",
  regular: "Lato-Regular",
  extraBold: "Lato-Black",
} as const;

export const darkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: themes.bg_950,
    primary: themes.primary_500,
  },
  fonts: {
    ...DarkTheme.fonts,
    regular: {
      fontFamily: fontFamily.regular,
      fontWeight: "normal",
    },
    medium: {
      fontFamily: fontFamily.normal,
      fontWeight: "normal",
    },
    bold: {
      fontFamily: fontFamily.bold,
      fontWeight: "600",
    },
    heavy: {
      fontFamily: fontFamily.extraBold,
      fontWeight: "700",
    },
  },
};
export const lightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: themes.bg_100,
    primary: themes.primary_500,
  },
  fonts: {
    ...DefaultTheme.fonts,
    regular: {
      fontFamily: fontFamily.regular,
      fontWeight: "normal",
    },
    medium: {
      fontFamily: fontFamily.normal,
      fontWeight: "normal",
    },
    bold: {
      fontFamily: fontFamily.bold,
      fontWeight: "600",
    },
    heavy: {
      fontFamily: fontFamily.extraBold,
      fontWeight: "700",
    },
  },
};

export type Colors = {
  primary: string;
  card: string;
  text: string;
  border: string;
};
export type ThemeMode = "light" | "dark";
export type ThemeType = typeof theme.light | typeof theme.dark;

export const theme = {
  dark: {
    themeMode: "dark",
    ...darkTheme,
    colors: {
      ...darkTheme.colors,
      text: "rgb(255, 255, 255)",
      transparent: themes.transparent,
      danger: themes.red_600,
      gray: themes.gray_400,
      gray_50: themes.gray_700,
      gray_100: themes.gray_600,
      gray_200: themes.gray_500,
      gray_300: themes.gray_400,
      gray_400: themes.gray_300,
      gray_500: themes.gray_200,
      gray_600: themes.gray_100,
      gray_700: themes.gray_50,

      green_25: themes.green_900,
      green_50: themes.green_800,
      green_100: themes.green_700,
      green_200: themes.green_600,
      green_300: themes.green_500,
      green_400: themes.green_400,
      green_500: themes.green_300,
      green_600: themes.green_200,
      green_700: themes.green_100,
      green_800: themes.green_50,
      green_900: themes.green_25,

      primary_25: themes.primary_900,
      primary_50: themes.primary_800,
      primary_100: themes.primary_700,
      primary_200: themes.primary_600,
      primary_300: themes.primary_500,
      primary_400: themes.primary_400,
      primary_500: themes.primary_300,
      primary_600: themes.primary_200,
      primary_700: themes.primary_100,
      primary_800: themes.primary_50,
      primary_900: themes.primary_25,
      primary_950: themes.primary_25,
      primary_975: themes.primary_25,

      red_25: themes.red_900,
      red_50: themes.red_800,
      red_100: themes.red_700,
      red_200: themes.red_600,
      red_300: themes.red_500,
      red_400: themes.red_400,
      red_500: themes.red_300,
      red_600: themes.red_200,
      red_700: themes.red_100,
      red_800: themes.red_50,
      red_900: themes.red_25,
      red_950: themes.red_25,
      red_975: themes.red_25,

      bg_25: themes.bg_950,
      bg_50: themes.bg_900,
      bg_100: themes.bg_800,
      bg_200: themes.bg_700,
      bg_300: themes.bg_600,
      bg_400: themes.bg_500,
      bg_500: themes.bg_400,
      bg_600: themes.bg_300,
      bg_700: themes.bg_200,
      bg_800: themes.bg_100,
      bg_900: themes.bg_50,
    },
  },
  light: {
    themeMode: "light",
    ...lightTheme,
    colors: {
      ...lightTheme.colors,
      text: "rgb(0, 0, 0)",
      transparent: themes.transparent,
      danger: themes.red_600,
      gray: themes.gray_600,
      gray_50: themes.gray_50,
      gray_100: themes.gray_100,
      gray_200: themes.gray_200,
      gray_300: themes.gray_300,
      gray_400: themes.gray_400,
      gray_500: themes.gray_500,
      gray_600: themes.gray_600,
      gray_700: themes.gray_700,

      green_25: themes.green_25,
      green_50: themes.green_50,
      green_100: themes.green_100,
      green_200: themes.green_200,
      green_300: themes.green_300,
      green_400: themes.green_400,
      green_500: themes.green_500,
      green_600: themes.green_600,
      green_700: themes.green_700,
      green_800: themes.green_800,
      green_900: themes.green_900,

      primary_25: themes.primary_25,
      primary_50: themes.primary_50,
      primary_100: themes.primary_100,
      primary_200: themes.primary_200,
      primary_300: themes.primary_300,
      primary_400: themes.primary_400,
      primary_500: themes.primary_500,
      primary_600: themes.primary_600,
      primary_700: themes.primary_700,
      primary_800: themes.primary_800,
      primary_900: themes.primary_900,

      bg_50: themes.bg_50,
      bg_100: themes.bg_100,
      bg_200: themes.bg_200,
      bg_300: themes.bg_300,
      bg_400: themes.bg_400,
      bg_500: themes.bg_500,
      bg_600: themes.bg_600,
      bg_700: themes.bg_700,
      bg_800: themes.bg_800,
      bg_900: themes.bg_900,
      bg_950: themes.bg_950,
      bg_975: themes.bg_975,

      red_25: themes.red_25,
      red_50: themes.red_50,
      red_100: themes.red_100,
      red_200: themes.red_200,
      red_300: themes.red_300,
      red_400: themes.red_400,
      red_500: themes.red_500,
      red_600: themes.red_600,
      red_700: themes.red_700,
      red_800: themes.red_800,
      red_900: themes.red_900,
      red_950: themes.red_950,
      red_975: themes.red_975,
    },
  },
};
