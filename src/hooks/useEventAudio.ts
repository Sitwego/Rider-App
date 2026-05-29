import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";

const acceptSound = require("../../assets/accept.mp3");

export function useEventAudio() {
  const player = useAudioPlayer(acceptSound);

  const playAccept = useCallback(() => {
    player.seekTo(0);
    player.play();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [player]);

  return { playAccept };
}
