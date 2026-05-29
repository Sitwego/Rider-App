import { ReactElement, ReactNode, SetStateAction } from "react";

export interface AddressInputRef {
  setAddressText: (address: SetStateAction<string>) => void;
  getAddressText: () => string;
  blur: () => void;
  focus: () => void;
  isFocused: () => boolean;
  clear: () => void;
}
export interface GooglePlacesAutocompleteProps {
  autoFillOnNotFound?: boolean;
  currentLocation?: boolean;
  currentLocationLabel?: string;
  debounce?: number;
  disableScroll?: boolean;
  enableHighAccuracyLocation?: boolean;
  enablePoweredByContainer?: boolean;
  fetchDetails?: boolean;
  filterReverseGeocodingByTypes?: string[];
  GooglePlacesDetailsQuery?: Record<string, any>;
  GooglePlacesSearchQuery?: Record<string, any>;
  GoogleReverseGeocodingQuery?: Record<string, any>;
  inbetweenCompo?: ReactNode;
  isRowScrollable?: boolean;
  keyboardShouldPersistTaps?: "never" | "always" | "handled";
  listEmptyComponent?: ReactElement;
  listLoaderComponent?: ReactElement;
  listHoverColor?: string;
  listUnderlayColor?: string;
  listViewDisplayed?: boolean | "auto";
  keepResultsAfterBlur?: boolean;
  minLength?: number;
  nearbyPlacesAPI?: string;
  numberOfLines?: number;
  onFail?: (error: any) => void;
  onNotFound?: () => void;
  onPress?: (data: any, details: any) => void;
  onTimeout?: () => void;
  placeholder?: string;
  predefinedPlaces?: [];
  predefinedPlacesAlwaysVisible?: boolean;
  preProcess?: (text: string) => string;
  query?: Record<string, any>;
  renderDescription?: (description: any) => ReactNode;
  renderHeaderComponent?: () => ReactNode;
  renderLeftButton?: () => ReactNode;
  renderRightButton?: () => ReactNode;
  renderRow?: (data: any) => ReactNode;
  requestUrl?: {
    url: string;
    useOnPlatform: "web" | "all";
    headers: Record<string, string>;
  };
  styles?: Record<string, any>;
  suppressDefaultStyles?: boolean;
  textInputHide?: boolean;
  textInputProps?: Record<string, any>;
  timeout?: number;
  isNewPlacesAPI?: boolean;
  fields?: string;
  setFromDataSource?: (d: any) => void;
  // setToDataSource: React.Dispatch<React.SetStateAction<any[]>>;
  // toDataSource: any[];
}

export interface PlaceType {
  street?: string;
  name?: string;
  street2?: string;
  country?: string;
  state?: string;
  city?: string;
  zipCode?: string;
  lat?: number;
  lng?: number;
  address?: string;
  place_id?: string;
  id?: string;
}
