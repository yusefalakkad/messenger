plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}

// google-services плагин — нужен только если есть google-services.json
buildscript {
    dependencies {
        classpath("com.google.gms:google-services:${libs.versions.google.services.get()}")
    }
}
