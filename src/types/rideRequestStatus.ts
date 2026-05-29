export type RideRequestStatus =
  | "New"
  | "Accepted"
  | "Inprogress"
  | "Completed"
  | "Canceled"
  | "Expired"
  | "Arrived"
  | "Waitingforrider"
  | "Failed";

export const defaultRideRequestStatus: RideRequestStatus = "New";
