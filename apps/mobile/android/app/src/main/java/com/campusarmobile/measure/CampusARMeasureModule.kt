package com.campusarmobile.measure

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class CampusARMeasureModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CampusARMeasureModule"

  private fun view(): CampusARMeasureView? = CampusARMeasureRegistry.activeView

  @ReactMethod
  fun startSession(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val v = view()
      if (v == null) {
        promise.reject("no_view", "AR view is not mounted")
        return@runOnUiThread
      }
      v.startSession()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun pauseSession(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      view()?.pauseSession()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun resumeSession(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val v = view()
      if (v == null) {
        promise.reject("no_view", "AR view is not mounted")
      } else {
        v.resumeSession()
        promise.resolve(null)
      }
    }
  }

  @ReactMethod
  fun placePoint(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val placed = view()?.placePointAtCenter()
      promise.resolve(placed)
    }
  }

  @ReactMethod
  fun undoLastPoint(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      view()?.undoLastPoint()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun clearPoints(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      view()?.clearPoints()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun resetSession(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      view()?.resetSession()
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun getTrackingState(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      promise.resolve(view()?.currentTrackingState())
    }
  }
}
