declare module 'react-native-config' {
  export interface NativeConfig {
    API_BASE_URL: string;
    GRPC_HOST: string;
    APP_ENV: 'development' | 'staging' | 'production';
    GOOGLE_MAPS_API_KEY: string;
  }

  export const Config: NativeConfig;
  export default Config;
}
