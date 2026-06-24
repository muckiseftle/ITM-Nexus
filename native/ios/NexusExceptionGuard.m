#import "NexusExceptionGuard.h"

@implementation NexusExceptionGuard

+ (NSException *)run:(__attribute__((noescape)) void (^)(void))block {
  @try {
    block();
    return nil;
  } @catch (NSException *exception) {
    return exception;
  }
}

@end
