# Add project specific ProGuard rules here.

# ---- React Native core (JNI/reflection loaded at startup) ----
-keep class com.facebook.** { *; }
-dontwarn com.facebook.**

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ---- Nitro Modules ----
-keep class com.margelo.nitro.** { *; }
-keep class margelo.** { *; }
-dontwarn margelo.**

# ---- Expo modules ----
-keep class kotlin.Metadata { *; }
-keepattributes RuntimeVisibleAnnotations
-keep class expo.modules.kotlin.** { *; }
-keep class expo.modules.image.** { *; }
-keep,allowoptimization,allowobfuscation class expo.modules.** { *; }

# ---- Protobuf-lite ----
# R8 obfuscates field names (e.g. id_) which breaks protobuf reflection lookups at runtime.
-keep class * extends com.google.protobuf.GeneratedMessageLite { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.protobuf.**

# ---- gRPC ----
-keep class io.grpc.** { *; }
-keep class io.grpc.stub.** { *; }
-dontwarn io.grpc.**

# ---- App proto/gRPC stubs (com.transli.mobilitycustomer package) ----
-keep class com.transli.** { *; }
-keep class com.transli.mobilitycustomer.**Grpc { *; }
-keep class com.transli.mobilitycustomer.**Grpc$* { *; }

# ---- MMKV ----
-keep class com.tencent.mmkv.** { *; }
-dontwarn com.tencent.mmkv.**

# ---- Firebase / Google Play Services ----
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.internal.**

# ---- OkHttp ----
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ---- Gson ----
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# ---- Kotlin ----
-keep class kotlin.** { *; }
-dontwarn kotlin.**
-keepclassmembers class **$WhenMappings {
    <fields>;
}
-keepclassmembers class kotlin.Lazy { *; }
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
