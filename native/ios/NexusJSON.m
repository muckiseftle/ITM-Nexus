#import "NexusJSON.h"

@implementation NexusJSON

+ (NSString *)stringFromObject:(id)object {
  @try {
    NSData *data = [NSJSONSerialization dataWithJSONObject:object
                                                  options:NSJSONWritingFragmentsAllowed
                                                    error:NULL];
    if (data == nil) {
      return nil;
    }
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  } @catch (NSException *exception) {
    // Ungültiger Wert (NaN/Infinity/nicht serialisierbar) → sicher gefangen, KEIN Crash.
    return nil;
  }
}

+ (id)objectFromString:(NSString *)string {
  @try {
    NSData *data = [string dataUsingEncoding:NSUTF8StringEncoding];
    if (data == nil) {
      return nil;
    }
    return [NSJSONSerialization JSONObjectWithData:data
                                          options:NSJSONReadingAllowFragments
                                            error:NULL];
  } @catch (NSException *exception) {
    return nil;
  }
}

@end
