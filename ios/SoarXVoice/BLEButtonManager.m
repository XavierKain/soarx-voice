#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(BLEButtonManager, RCTEventEmitter)

RCT_EXTERN_METHOD(startScan)
RCT_EXTERN_METHOD(stopScan)
RCT_EXTERN_METHOD(connectToDevice:(NSString *)uuid)
RCT_EXTERN_METHOD(disconnectDevice)
RCT_EXTERN_METHOD(getSavedDeviceUUID:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(probeDevice)
RCT_EXTERN_METHOD(enableScanMode)
RCT_EXTERN_METHOD(disableScanMode)

@end
