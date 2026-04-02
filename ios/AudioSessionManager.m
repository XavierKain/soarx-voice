#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AudioSessionManager, NSObject)
RCT_EXTERN_METHOD(ping:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
