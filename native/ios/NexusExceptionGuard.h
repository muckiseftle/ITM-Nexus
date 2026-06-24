#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Führt einen Block in einem Objective-C `@try/@catch` aus und liefert die gefangene
/// `NSException` (oder `nil`). Swift kann NSExceptions **nicht** abfangen — dieser Guard
/// verhindert, dass eine NSException aus System-APIs (z. B. `BGTaskScheduler` ohne passendes
/// Entitlement, typisch bei Sideload mit kostenloser Apple-ID) die App zum Absturz bringt.
@interface NexusExceptionGuard : NSObject
+ (nullable NSException *)run:(__attribute__((noescape)) void (^)(void))block;
@end

NS_ASSUME_NONNULL_END
