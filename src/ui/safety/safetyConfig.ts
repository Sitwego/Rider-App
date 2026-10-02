/** Kenya's emergency numbers: 999 (police/ambulance/fire) and 112 (GSM). */
export const EMERGENCY_NUMBER = "999";
export const ALT_EMERGENCY_NUMBER = "112";

/**
 * Off until POST /api/safety/incident exists and an on-call person receives
 * the alerts. While off, the app never tells the rider the safety team has
 * been alerted — a silent no-op here would be worse than no button.
 */
export const SAFETY_ALERTS_ENABLED = false;
