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
  s.source_files = '*.{swift,h,m}'
  s.swift_version = '5.0'

  # React-Native-Bridge.
  s.dependency 'React-Core'

  # SQLCipher wird aktiviert, sobald der DB-Code die echten sqlite3_*-Aufrufe nutzt
  # (siehe NexusDatabase.swift). Bis dahin kompiliert das Modul ohne diese Abhängigkeit.
  # s.dependency 'SQLCipher'
end
