export type RideSearchType = {
  distance: number;
  duration: (string | number)[];
  estimates: EstimatesType[];
  line_str: number[][];
  search_req_id: string;
};
export type EstimatesType = {
  base_fare: number;
  category: string;
  discount: number;
  distance_cost: number;
  final_fare: number;
  total_before_discount: number;
  waiting_cost: number;
};
