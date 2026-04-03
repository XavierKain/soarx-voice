#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(AudioSessionManager, RCTEventEmitter)
RCT_EXTERN_METHOD(configureAudioSession)
RCT_EXTERN_METHOD(deactivateAudioSession)
RCT_EXTERN_METHOD(setManuallyMuted:(BOOL)muted)
RCT_EXTERN_METHOD(getManuallyMuted:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(ping:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
