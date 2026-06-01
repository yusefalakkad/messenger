# kotlinx.serialization — сохраняем @Serializable классы и их companion'ы
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class online.akkdmsg.dakka.**$$serializer { *; }
-keepclassmembers class online.akkdmsg.dakka.** {
    *** Companion;
}

# OkHttp — стандартные правила
-dontwarn okhttp3.**
-dontwarn okio.**
