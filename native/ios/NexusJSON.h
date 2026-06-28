#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// `NSJSONSerialization` in REINEM Objective-C `@try/@catch`.
///
/// WICHTIG: `dataWithJSONObject:` wirft bei ungültigen Werten (z. B. NaN/Infinity oder einem
/// nicht serialisierbaren Typ) eine `NSException`. Wird die Serialisierung aus Swift heraus in
/// einem Swift-Closure-Guard ausgeführt, muss die Exception über Swift-Frames zum `@catch`
/// laufen — das ist NICHT zuverlässig fangbar und endet in `std::terminate`/`abort` (Crash beim
/// Sync). Hier passiert alles im selben Obj-C-Frame, daher wird die Exception sicher gefangen
/// (Ergebnis: `nil` statt Absturz).
@interface NexusJSON : NSObject
+ (nullable NSString *)stringFromObject:(id)object;
+ (nullable id)objectFromString:(NSString *)string;
@end

NS_ASSUME_NONNULL_END
