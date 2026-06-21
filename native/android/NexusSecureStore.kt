package de.itmtechnologies.nexus

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Sicherer Schlüssel/Wert-Speicher auf Basis von Android Keystore +
 * EncryptedSharedPreferences (AES-256). Implementiert den `SecureStore`-Port.
 * Der Masterkey ist im StrongBox/Keystore gebunden (siehe ADR-005 / Security-Konzept).
 */
class NexusSecureStore(context: Context) {
  private val prefs: SharedPreferences

  init {
    val masterKey = MasterKey.Builder(context)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .setRequestStrongBoxBacked(true)
      .build()

    prefs = EncryptedSharedPreferences.create(
      context,
      "nexus_secure_store",
      masterKey,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  fun set(key: String, value: String) {
    prefs.edit().putString(key, value).apply()
  }

  fun get(key: String): String? = prefs.getString(key, null)

  fun delete(key: String) {
    prefs.edit().remove(key).apply()
  }

  /** Krypto-Shredding: entfernt alle Einträge (lokaler/remote Wipe). */
  fun wipe() {
    prefs.edit().clear().apply()
  }
}
