#import <Foundation/Foundation.h>
#import <BackgroundTasks/BackgroundTasks.h>

NS_ASSUME_NONNULL_BEGIN

/// Kapselt die `BGTaskScheduler`-Aufrufe in REINEM Objective-C `@try/@catch`.
///
/// WICHTIG: `submit()`/`register()` werfen ohne Background-Entitlement (typisch bei Sideload mit
/// kostenloser Apple-ID) eine `NSException`. Wird der Aufruf aus Swift heraus gemacht, muss die
/// Exception über Swift-Frames zum `@catch` laufen — das ist NICHT zuverlässig fangbar und endet
/// in `std::terminate`/`abort` (SIGABRT beim Start). Hier passiert der Aufruf direkt im `@try`,
/// ohne Swift-Frame dazwischen, sodass die Exception sicher gefangen wird (dann No-op).
@interface NexusBGTasks : NSObject
+ (void)registerRefreshWithIdentifier:(NSString *)identifier
                              handler:(void (^)(BGAppRefreshTask *task))handler;
+ (void)submitRefreshWithIdentifier:(NSString *)identifier
                   earliestInterval:(NSTimeInterval)interval;
@end

NS_ASSUME_NONNULL_END
