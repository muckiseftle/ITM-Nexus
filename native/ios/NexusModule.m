#import <React/RCTBridgeModule.h>

// Registriert die Swift-Methoden von `NexusNative` bei der React-Native-Bridge.
@interface RCT_EXTERN_MODULE(NexusNative, NSObject)

RCT_EXTERN_METHOD(secureSet:(NSString *)key value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(secureGet:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(secureDelete:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(secureWipe:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(dbInit:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(dbExec:(NSString *)sql params:(NSArray *)params
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(dbQuery:(NSString *)sql params:(NSArray *)params
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(transportDiscover:(NSString *)email credentialsJson:(NSString *)credentialsJson
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(transportSyncMessages:(NSString *)accountId folderId:(NSString *)folderId syncKey:(NSString *)syncKey
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(transportApplyOperation:(NSString *)operationJson
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(transportSendMessage:(NSString *)accountId messageJson:(NSString *)messageJson
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(transportSearchServer:(NSString *)accountId query:(NSString *)query
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
