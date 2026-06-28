#import "NexusBGTasks.h"

@implementation NexusBGTasks

+ (void)registerRefreshWithIdentifier:(NSString *)identifier
                              handler:(void (^)(BGAppRefreshTask *task))handler {
  @try {
    [[BGTaskScheduler sharedScheduler] registerForTaskWithIdentifier:identifier
                                                          usingQueue:nil
                                                       launchHandler:^(BGTask *task) {
                                                         if ([task isKindOfClass:[BGAppRefreshTask class]]) {
                                                           handler((BGAppRefreshTask *)task);
                                                         } else {
                                                           [task setTaskCompletedWithSuccess:NO];
                                                         }
                                                       }];
  } @catch (NSException *exception) {
    // Kein Background-Entitlement (Sideload) → Hintergrund-Sync bleibt inaktiv, KEIN Crash.
  }
}

+ (void)submitRefreshWithIdentifier:(NSString *)identifier
                   earliestInterval:(NSTimeInterval)interval {
  @try {
    BGAppRefreshTaskRequest *request =
        [[BGAppRefreshTaskRequest alloc] initWithIdentifier:identifier];
    request.earliestBeginDate = [NSDate dateWithTimeIntervalSinceNow:interval];
    NSError *error = nil;
    [[BGTaskScheduler sharedScheduler] submitTaskRequest:request error:&error];
  } @catch (NSException *exception) {
    // submit() wirft ohne Entitlement eine NSException — hier sicher (im selben Obj-C-Frame) gefangen.
  }
}

@end
