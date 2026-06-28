Pod::Spec.new do |s|
  s.name         = 'NexusNative'
  s.version      = '0.0.1'
  s.summary      = 'NEXUS Native-Core (SecureStore, SQLCipher-DB, EWS-Transport).'
  s.description  = 'Sicherheits-/performancekritische Primitive für die NEXUS-App (Thin-JS / Native-Core).'
  s.homepage     = 'https://itm-technologies.de'
  s.license      = { :type => 'Proprietary', :text => 'ITM Technologies' }
  s.author       = { 'ITM Technologies' => 'support@itm-technologies.de' }
  s.platform     = :ios, '15.1'
  s.source       = { :path => '.' }
  s.source_files = '*.{swift,h,m,mm}'
  s.swift_version = '5.0'

  # React-Native-Bridge.
  s.dependency 'React-Core'

  # Verschlüsselte lokale DB (at-rest, AES-256). Stellt das `SQLCipher`-Modul mit den
  # sqlite3_*-Funktionen inkl. sqlite3_key bereit (siehe NexusDatabase.swift).
  s.dependency 'SQLCipher'
end
